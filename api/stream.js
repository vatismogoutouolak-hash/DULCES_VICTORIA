import {getServices,verifyPlayback,authorizePlayback,safeAsset,rewriteManifest,validPlaybackSession} from '../server/video-access.js';
const TYPES={m3u8:'application/vnd.apple.mpegurl',ts:'video/mp2t',m4s:'video/iso.segment',mp4:'video/mp4',aac:'audio/aac',key:'application/octet-stream',vtt:'text/vtt'};
export default async function handler(req,res) {
  res.setHeader('Cache-Control','private, no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  if(!['GET','HEAD'].includes(req.method)) return res.status(405).end();
  const {token,asset}=req.query || {};
  let payload;
  try {payload=verifyPlayback(token);} catch {return res.status(401).json({error:'Session vidéo expirée. Relancez la lecture.'});}
  if(!validPlaybackSession(req,payload))return res.status(403).json({error:'Relancez la vidéo depuis votre espace personnel.'});
  if(!safeAsset(asset)) return res.status(400).json({error:'Segment invalide.'});
  try {
    const s=await getServices();
    try {await authorizePlayback(s,payload);} catch {return res.status(403).json({error:'Accès vidéo suspendu.'});}
    const folder=payload.path.slice(0,payload.path.lastIndexOf('/')+1);
    const file=s.storage.bucket().file(folder+asset);
    const [metadata]=await file.getMetadata();
    const size=Number(metadata.size),extension=asset.split('.').pop().toLowerCase();
    if(!Number.isSafeInteger(size) || size<1) return res.status(404).end();
    res.setHeader('Content-Type',TYPES[extension]);
    if(extension==='m3u8') {
      if(size>1024*1024) return res.status(413).end();
      const [data]=await file.download();
      const manifest=rewriteManifest(data.toString('utf8'),asset,token);
      return req.method==='HEAD'?res.status(200).end():res.status(200).send(manifest);
    }
    let start=0,end=size-1;
    if(req.headers.range) {
      const range=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      if(!range || (!range[1]&&!range[2])) return res.status(416).end();
      if(!range[1]) {start=Math.max(0,size-Number(range[2]));} else {start=Number(range[1]);if(range[2])end=Math.min(end,Number(range[2]));}
      if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=size||end<start) {res.setHeader('Content-Range',`bytes */${size}`);return res.status(416).end();}
    }
    // Bound MP4 range responses to keep proxy memory and execution predictable.
    if(extension==='mp4') end=Math.min(end,start+8*1024*1024-1);
    else if(size>32*1024*1024) return res.status(413).end();
    const partial=start!==0 || end!==size-1 || !!req.headers.range;
    res.setHeader('Accept-Ranges','bytes');
    res.setHeader('Content-Length',end-start+1);
    if(partial)res.setHeader('Content-Range',`bytes ${start}-${end}/${size}`);
    res.status(partial?206:200);
    if(req.method==='HEAD')return res.end();
    const stream=file.createReadStream({start,end});
    res.on('close',()=>stream.destroy());
    stream.on('error',()=>{if(!res.headersSent)res.status(502).end();else res.destroy();});
    stream.pipe(res);
  } catch {if(!res.headersSent)return res.status(404).json({error:'Segment indisponible.'});res.destroy();}
}

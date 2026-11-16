import http from 'node:http';
import {readFile,realpath,stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {resolve,dirname,relative,sep,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import config from '../api/config.js';
import video from '../api/video.js';
import stream from '../api/stream.js';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
// Deliberate public allowlist: never serve source, environment, credentials or videos.
const PUBLIC=new Map([['/','index.html'],['/index.html','index.html'],['/app.js','app.js'],['/backend.js','backend.js'],['/style.css','style.css'],['/robots.txt','robots.txt']]);
const TYPES={html:'text/html; charset=utf-8',js:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8',txt:'text/plain; charset=utf-8'};
const SECURITY={
  'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'strict-origin-when-cross-origin',
  'Permissions-Policy':'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy':"default-src 'self'; script-src 'self' https://cdn.jsdelivr.net https://www.gstatic.com https://apis.google.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://images.unsplash.com https://lh3.googleusercontent.com; connect-src 'self' https://cdn.jsdelivr.net https://*.googleapis.com https://*.firebaseio.com https://*.firebasestorage.app https://*.appspot.com; frame-src https://*.firebaseapp.com https://accounts.google.com; media-src 'self' blob:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'"
};
function adapter(res){
  res.status=code=>{res.statusCode=code;return res;};
  res.json=value=>{res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(value));return res;};
  res.send=value=>{res.end(value);return res;};
}
function clientIP(req){
  const address=req.socket.remoteAddress || 'unknown';
  // Only a loopback reverse proxy may supply a client address. Nginx must overwrite this header.
  if(process.env.TRUST_LOOPBACK_PROXY==='true' && ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(address)) {
    const forwarded=req.headers['x-real-ip'];
    if(typeof forwarded==='string' && /^[a-fA-F0-9:.]{3,64}$/.test(forwarded))return forwarded;
  }
  return address;
}
function limiter(){
  const counters=new Map();
  return (req,route)=>{
    const now=Date.now();
    if(counters.size>10000)for(const [key,value]of counters)if(value.until<=now)counters.delete(key);
    // Independent limits accommodate HLS segments while bounding token generation.
    const limit=route==='/api/stream'?720:route==='/api/video'?60:180;
    const key=`${clientIP(req)}:${route}`;
    let item=counters.get(key);
    if(!item || item.until<=now){if(counters.size>=20000)return false;item={count:0,until:now+60000};counters.set(key,item);}
    return ++item.count<=limit;
  };
}
async function parseJSON(req){
  const length=Number(req.headers['content-length']);
  if(Number.isFinite(length) && length>16384)throw Object.assign(new Error('Corps trop volumineux.'),{status:413});
  if(!String(req.headers['content-type']||'').toLowerCase().startsWith('application/json'))throw Object.assign(new Error('Content-Type application/json requis.'),{status:415});
  let size=0;const chunks=[];
  for await(const chunk of req){size+=chunk.length;if(size>16384)throw Object.assign(new Error('Corps trop volumineux.'),{status:413});chunks.push(chunk);}
  try{const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!value || typeof value!=='object' || Array.isArray(value))throw new Error();return value;}catch{throw Object.assign(new Error('JSON invalide.'),{status:400});}
}
export function createServer({publicRoot=resolve(ROOT,'public')}={}){
  const allow=limiter();
  const server=http.createServer(async(req,res)=>{
    adapter(res);for(const [key,value]of Object.entries(SECURITY))res.setHeader(key,value);
    try{
      if(!req.url || req.url.length>8192)return res.status(414).end();
      const url=new URL(req.url,'http://localhost');
      const path=decodeURIComponent(url.pathname);
      if(path.includes('\0') || path.includes('\\') || path.split('/').some(p=>p==='..'||p==='.'))return res.status(400).end();
      if(path==='/health'){if(req.method!=='GET'&&req.method!=='HEAD')return res.status(405).end();return req.method==='HEAD'?res.status(200).end():res.status(200).json({status:'ok'});}
      if(path.startsWith('/api/')){
        res.setHeader('Cache-Control','private, no-store');
        if(!allow(req,path)){res.setHeader('Retry-After','60');return res.status(429).json({error:'Trop de requêtes. Réessayez dans une minute.'});}
        req.query=Object.fromEntries(url.searchParams);
        // Reject duplicates to avoid ambiguous playback authorization.
        if([...url.searchParams.keys()].some(k=>url.searchParams.getAll(k).length!==1))return res.status(400).end();
        if(path==='/api/config')return await config(req,res);
        if(path==='/api/video'){
          if(req.method==='POST')req.body=await parseJSON(req);
          return await video(req,res);
        }
        if(path==='/api/stream')return await stream(req,res);
        return res.status(404).end();
      }
      if(!['GET','HEAD'].includes(req.method)){res.setHeader('Allow','GET, HEAD');return res.status(405).end();}
      const name=PUBLIC.get(path);if(!name)return res.status(404).end();
      const root=await realpath(publicRoot),file=await realpath(resolve(root,name)),rel=relative(root,file);
      if(!rel || rel.startsWith(`..${sep}`)||rel==='..'||isAbsolute(rel))return res.status(404).end();
      const info=await stat(file);if(!info.isFile())return res.status(404).end();
      res.setHeader('Content-Type',TYPES[name.split('.').pop()]||'application/octet-stream');
      res.setHeader('Content-Length',info.size);res.setHeader('Cache-Control','no-cache');
      if(req.method==='HEAD')return res.end();
      const source=createReadStream(file);res.on('close',()=>source.destroy());source.on('error',()=>res.destroy());source.pipe(res);
    }catch(error){
      if(res.headersSent)return res.destroy();
      const status=error.status || (error.code==='ENOENT'?404:error instanceof URIError?400:500);
      res.status(status).json({error:status===500?'Service momentanément indisponible.':status===404?'Page introuvable.':error.message});
    }
  });
  server.requestTimeout=30000;server.headersTimeout=15000;server.keepAliveTimeout=5000;server.maxHeadersCount=60;
  return server;
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const port=Number(process.env.PORT || 3000),host=process.env.HOST || '127.0.0.1';
  if(!Number.isInteger(port)||port<1||port>65535)throw new Error('PORT invalide.');
  if(process.env.VIDEO_STORAGE==='local'){
    const videos=await realpath(process.env.VIDEO_ROOT || '');
    const web=await realpath(resolve(ROOT,'public'));
    const rel=relative(web,videos);
    if(!rel || (!rel.startsWith(`..${sep}`)&&rel!=='..'&&!isAbsolute(rel)))throw new Error('VIDEO_ROOT doit être hors du dossier public.');
  }
  const server=createServer();server.listen(port,host,()=>console.log(`DULCES VICTORIA écoute sur ${host}:${port}`));
  function shutdown(){server.close(()=>process.exit(0));setTimeout(()=>{server.closeAllConnections();process.exit(0);},10000).unref();}
  process.once('SIGTERM',shutdown);process.once('SIGINT',shutdown);
}

import {getServices,signPlayback,bindPlaybackSession} from '../server/video-access.js';
export default async function handler(req,res) {
  res.setHeader('Cache-Control','private, no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='POST') return res.status(405).json({error:'Méthode non autorisée'});
  if(!process.env.FIREBASE_PRIVATE_KEY || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.VIDEO_TOKEN_SECRET) return res.status(503).json({error:'La diffusion vidéo sera disponible après activation de l’espace formation.'});
  const token=req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
  if(!token) return res.status(401).json({error:'Connexion requise.'});
  const {courseId,lessonId}=req.body || {};
  if(!['chantilly','creme-au-beurre','gateaux-en-pot'].includes(courseId) || typeof lessonId!=='string' || !/^[a-z0-9-]{1,80}$/.test(lessonId)) return res.status(400).json({error:'Leçon invalide.'});
  try {
    const s=await getServices();
    let identity;
    try {identity=await s.auth.verifyIdToken(token,true);} catch {return res.status(401).json({error:'Session expirée. Reconnectez-vous.'});}
    const enrollment=await s.db.doc(`enrollments/${identity.uid}_${courseId}`).get();
    if(identity.admin!==true && enrollment.data()?.status!=='approved') return res.status(403).json({error:'Cette formation ne fait pas partie de vos accès actifs.'});
    const lesson=await s.db.doc(`courses/${courseId}/lessons/${lessonId}`).get();
    const path=lesson.data()?.videoPath;
    if(typeof path!=='string' || !path.startsWith(`courses/${courseId}/`) || path.includes('..') || !/\.(mp4|m3u8)$/i.test(path)) return res.status(404).json({error:'Vidéo indisponible.'});
    const iat=Date.now(),expiresAt=iat+15*60*1000;
    const playback=signPlayback({uid:identity.uid,courseId,lessonId,path,iat,exp:expiresAt,session:bindPlaybackSession(req,res)});
    const asset=path.slice(path.lastIndexOf('/')+1);
    return res.status(200).json({url:`/api/stream?token=${encodeURIComponent(playback)}&asset=${encodeURIComponent(asset)}`,type:/\.m3u8$/i.test(path)?'hls':'mp4',expiresAt,watermark:identity.email || identity.uid});
  } catch {return res.status(503).json({error:'La vidéo est momentanément indisponible. Réessayez dans quelques instants.'});}
}

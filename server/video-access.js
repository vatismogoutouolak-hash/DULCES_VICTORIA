import {createHmac,timingSafeEqual,randomBytes,createHash} from 'node:crypto';
import {createLocalStorage} from './local-storage.js';
let services;
export async function getServices() {
  if (!services) services = (async () => {
    const [{ initializeApp, getApps, cert }, { getAuth }, { getFirestore }, { getStorage }] = await Promise.all([
      import('firebase-admin/app'), import('firebase-admin/auth'), import('firebase-admin/firestore'), import('firebase-admin/storage')
    ]);
    const app = getApps()[0] || initializeApp({ credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,'\n')}), storageBucket:process.env.FIREBASE_STORAGE_BUCKET });
    return { auth:getAuth(app), db:getFirestore(app), storage:process.env.VIDEO_STORAGE==='local'?createLocalStorage():getStorage(app) };
  })();
  return services;
}
function secret() { const value=process.env.VIDEO_TOKEN_SECRET; if(!value || value.length<32) throw new Error('VIDEO_TOKEN_SECRET manquant'); return value; }
export function signPlayback(payload) {
  const body=Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${createHmac('sha256',secret()).update(body).digest('base64url')}`;
}
export function verifyPlayback(token) {
  if(typeof token!=='string' || token.length>4096) throw new Error('Jeton invalide');
  const [body,signature,...rest]=token.split('.');
  if(!body || !signature || rest.length) throw new Error('Jeton invalide');
  const expected=createHmac('sha256',secret()).update(body).digest();
  const actual=Buffer.from(signature,'base64url');
  if(actual.length!==expected.length || !timingSafeEqual(actual,expected)) throw new Error('Jeton invalide');
  const payload=JSON.parse(Buffer.from(body,'base64url').toString());
  if(!payload.uid || !payload.courseId || !payload.lessonId || !payload.path || !Number.isFinite(payload.exp) || payload.exp<=Date.now()) throw new Error('Session vidéo expirée');
  return payload;
}
export async function authorizePlayback(s,payload) {
  const [user,enrollment,lesson]=await Promise.all([s.auth.getUser(payload.uid),s.db.doc(`enrollments/${payload.uid}_${payload.courseId}`).get(),s.db.doc(`courses/${payload.courseId}/lessons/${payload.lessonId}`).get()]);
  if(user.disabled || (user.tokensValidAfterTime && payload.iat<Date.parse(user.tokensValidAfterTime)) || (user.customClaims?.admin!==true && enrollment.data()?.status!=='approved') || lesson.data()?.videoPath!==payload.path) throw new Error('Accès vidéo suspendu');
}
export function safeAsset(asset) {
  return typeof asset==='string' && asset.length<=700 && /^[a-zA-Z0-9_./-]+$/.test(asset) && !asset.startsWith('/') && !asset.split('/').some(p=>p==='..'||p==='.'||p==='') && /\.(m3u8|ts|m4s|mp4|aac|key|vtt)$/i.test(asset);
}
export function rewriteManifest(source,asset,token) {
  const folder=asset.includes('/')?asset.slice(0,asset.lastIndexOf('/')+1):'';
  const url=value=>{
    const path=folder+value;
    if(!safeAsset(path)) throw new Error('Le manifeste contient un chemin non autorisé.');
    return `/api/stream?token=${encodeURIComponent(token)}&asset=${encodeURIComponent(path)}`;
  };
  return source.split(/\r?\n/).map(line=>{
    if(line.startsWith('#')) return line.replace(/URI="([^"]+)"/g,(_,uri)=>`URI="${url(uri)}"`);
    return line.trim()?url(line.trim()):line;
  }).join('\n');
}

const SESSION_COOKIE='dv_playback_session';
function sessionValue(req){
  const parts=String(req.headers.cookie || '').split(';').map(p=>p.trim());
  const value=parts.find(p=>p.startsWith(SESSION_COOKIE+'='))?.slice(SESSION_COOKIE.length+1);
  if(!value || value.length>1000)return null;
  const [body,sig,...rest]=value.split('.');
  if(rest.length || !body || !sig)return null;
  const expected=createHmac('sha256',secret()).update('session:'+body).digest();
  const actual=Buffer.from(sig,'base64url');
  if(actual.length!==expected.length || !timingSafeEqual(actual,expected))return null;
  try{const payload=JSON.parse(Buffer.from(body,'base64url').toString());return typeof payload.id==='string' && /^[a-f0-9]{64}$/.test(payload.id) && payload.exp>Date.now()?payload:null;}catch{return null;}
}
export function bindPlaybackSession(req,res){
  if(process.env.VIDEO_STORAGE!=='local' && process.env.HOSTINGER_MODE!=='true')return undefined;
  let session=sessionValue(req);
  if(!session){
    session={id:randomBytes(32).toString('hex'),exp:Date.now()+24*60*60*1000};
    const body=Buffer.from(JSON.stringify(session)).toString('base64url');
    const sig=createHmac('sha256',secret()).update('session:'+body).digest('base64url');
    res.setHeader('Set-Cookie',`${SESSION_COOKIE}=${body}.${sig}; Path=/api; Max-Age=86400; HttpOnly; Secure; SameSite=Strict`);
  }
  return createHash('sha256').update(session.id).digest('hex');
}
export function validPlaybackSession(req,payload){
  if(process.env.VIDEO_STORAGE!=='local' && process.env.HOSTINGER_MODE!=='true')return true;
  const session=sessionValue(req);
  if(!session || typeof payload.session!=='string')return false;
  const actual=createHash('sha256').update(session.id).digest('hex');
  return actual===payload.session;
}

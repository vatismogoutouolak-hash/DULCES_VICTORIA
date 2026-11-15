import {createHmac,timingSafeEqual} from 'node:crypto';
let services;
export async function getServices() {
  if (!services) services = (async () => {
    const [{ initializeApp, getApps, cert }, { getAuth }, { getFirestore }, { getStorage }] = await Promise.all([
      import('firebase-admin/app'), import('firebase-admin/auth'), import('firebase-admin/firestore'), import('firebase-admin/storage')
    ]);
    const app = getApps()[0] || initializeApp({ credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,'\n')}), storageBucket:process.env.FIREBASE_STORAGE_BUCKET });
    return { auth:getAuth(app), db:getFirestore(app), storage:getStorage(app) };
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

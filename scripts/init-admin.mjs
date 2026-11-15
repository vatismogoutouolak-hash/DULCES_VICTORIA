// Authenticate with Application Default Credentials (ADC) before running.
// Admin UID is read from stdin, never from command arguments.
import {initializeApp,applicationDefault} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
let uid='';
for await (const part of process.stdin) uid+=part;
uid=uid.trim();
if(!uid || uid.length>128 || /\s/.test(uid)) throw new Error('Entrez un UID Firebase valide sur stdin.');
const app=initializeApp({credential:applicationDefault(),projectId:process.env.FIREBASE_PROJECT_ID});
const auth=getAuth(app);
const user=await auth.getUser(uid);
await auth.setCustomUserClaims(uid,{...user.customClaims,admin:true});
console.log('Administrateur activé. Reconnectez ce compte pour actualiser ses droits.');

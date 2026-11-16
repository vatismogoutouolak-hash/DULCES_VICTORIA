import {initializeApp,applicationDefault} from 'firebase-admin/app';
import {getFirestore,Timestamp,GeoPoint} from 'firebase-admin/firestore';
import {getAuth} from 'firebase-admin/auth';
export const EXPECTED_PROJECT='dulces-victoria-7cf8f';
export function context() {
  const projectId=process.env.FIREBASE_PROJECT_ID;
  if(projectId!==EXPECTED_PROJECT) throw new Error(`FIREBASE_PROJECT_ID doit être exactement ${EXPECTED_PROJECT}. Aucun projet par défaut implicite.`);
  const app=initializeApp({credential:applicationDefault(),projectId});
  return {db:getFirestore(app),auth:getAuth(app),Timestamp,GeoPoint,projectId};
}
export async function stdinJSON() {
  let body='';for await(const part of process.stdin){body+=part;if(body.length>65536)throw new Error('Entrée trop grande.');}
  return JSON.parse(body);
}
export function isMain(url){return process.argv[1] && new URL(url).pathname===process.argv[1];}

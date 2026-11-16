import {writeFile,mkdir} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {context} from './admin-context.mjs';
import {encode} from './data-codec.mjs';
export async function capture({db,auth,projectId}) {
  const documents=[];
  async function visit(collection) {
    // listDocuments includes missing parent documents that still own subcollections.
    for(const ref of await collection.listDocuments()) {
      const snapshot=await ref.get();
      if(snapshot.exists) documents.push({path:ref.path,data:encode(snapshot.data()),updateTime:encode(snapshot.updateTime)});
      for(const child of await ref.listCollections())await visit(child);
    }
  }
  for(const collection of await db.listCollections())await visit(collection);
  const authUsers=[];let pageToken;
  do {
    const page=await auth.listUsers(1000,pageToken);
    for(const u of page.users) authUsers.push({uid:u.uid,email:u.email??null,displayName:u.displayName??null,phoneNumber:u.phoneNumber??null,emailVerified:u.emailVerified,disabled:u.disabled,customClaims:u.customClaims??{},metadata:{creationTime:u.metadata.creationTime,lastSignInTime:u.metadata.lastSignInTime??null}});
    pageToken=page.pageToken;
  }while(pageToken);
  return {format:'dulces-backup-v1',projectId,capturedAt:new Date().toISOString(),consistentSnapshot:false,documents,authUsers,authPasswordHashesIncluded:false};
}
export async function saveBackup(data,file) {
  const target=resolve(file);await mkdir(dirname(target),{recursive:true});
  await writeFile(target,JSON.stringify(data,null,2)+'\n',{flag:'wx',mode:0o600});return target;
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const file=process.argv[2];if(!file)throw new Error('Usage: node scripts/backup.mjs /chemin/prive/backup.json');
  const data=await capture(context());await saveBackup(data,file);
  console.log(`Sauvegarde créée: ${data.documents.length} documents et ${data.authUsers.length} fiches Auth (sans mots de passe).`);
}

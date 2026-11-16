// Usage: FIREBASE_PROJECT_ID=... node scripts/bootstrap-admin.mjs < private-profile.json
// stdin: {uid,name,telephone,country}; account must already exist and email be verified.
import {context,stdinJSON} from './admin-context.mjs';
const input=await stdinJSON();
for(const [key,max]of [['uid',128],['name',120],['telephone',40],['country',100]])if(typeof input[key]!=='string'||!input[key].trim()||input[key].length>max)throw new Error(`Champ invalide: ${key}`);
if(input.uid.includes('/')||input.uid==='.'||input.uid==='..')throw new Error('UID incompatible avec un identifiant de document.');
const {db,auth,Timestamp}=context();const user=await auth.getUser(input.uid);
if(user.disabled||!user.email||!user.emailVerified)throw new Error('Compte actif avec adresse e-mail vérifiée requis.');
await db.runTransaction(async tx=>{
  const profile=db.doc(`users/${user.uid}`),membership=db.doc(`admins/${user.uid}`);
  const existing=await tx.get(profile);const member=await tx.get(membership);const now=Timestamp.now();
  if(existing.exists && existing.data().status==='suspended')throw new Error('Compte suspendu: réactivation explicite requise avant promotion.');
  tx.set(profile,{name:input.name.trim(),email:user.email,telephone:input.telephone.trim(),country:input.country.trim(),role:'admin',status:'active',createdAt:existing.data()?.createdAt??now,updatedAt:now});
  if(!member.exists)tx.create(membership,{createdAt:now,source:'trusted-bootstrap'});
});
console.log('Administrateur configuré. Aucun identifiant secret affiché.');

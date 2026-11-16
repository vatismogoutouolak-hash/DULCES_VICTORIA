import {readFile} from 'node:fs/promises';
import {context,EXPECTED_PROJECT} from './admin-context.mjs';
import {decode} from './data-codec.mjs';
const file=process.argv[2],apply=process.argv.includes('--apply');
if(!file)throw new Error('Usage: node scripts/restore.mjs backup.json [--apply]');
const backup=JSON.parse(await readFile(file,'utf8'));
if(backup.format!=='dulces-backup-v1'||backup.projectId!==EXPECTED_PROJECT)throw new Error('Format/projet de sauvegarde invalide.');
const ctx=context();
for(const entry of backup.documents){
  if(!/^[^/]+\/[^/]+(?:\/[^/]+\/[^/]+)*$/.test(entry.path))throw new Error('Chemin de document invalide.');
  if((await ctx.db.doc(entry.path).get()).exists)throw new Error(`Conflit: ${entry.path}. Restauration arrêtée avant écriture; aucun écrasement autorisé.`);
}
console.log(`${backup.documents.length} documents absents à restaurer. ${apply?'Application demandée.':'Simulation uniquement.'}`);
if(apply)for(const entry of backup.documents)await ctx.db.doc(entry.path).create(decode(entry.data,ctx));
console.log('Les comptes Firebase Authentication et leurs mots de passe ne sont pas restaurés par cet outil.');

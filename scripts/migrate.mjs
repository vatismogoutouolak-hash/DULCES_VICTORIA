import {resolve} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {context} from './admin-context.mjs';
import {capture,saveBackup} from './backup.mjs';
import {encode,decode} from './data-codec.mjs';
import {planMigration} from './migration-plan.mjs';
const apply=process.argv.includes('--apply');
const dirFlag=process.argv.indexOf('--backup-dir');
if(dirFlag===-1||!process.argv[dirFlag+1])throw new Error('Usage: node scripts/migrate.mjs --backup-dir /chemin/prive [--apply]');
const ctx=context();const data=await capture(ctx);const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const dir=resolve(process.argv[dirFlag+1]);await mkdir(dir,{recursive:true,mode:0o700});
await saveBackup(data,resolve(dir,`before-migration-${stamp}.json`));
const plan=planMigration(data,encode(ctx.Timestamp.now()));
await writeFile(resolve(dir,`migration-plan-${stamp}.json`),JSON.stringify(plan,null,2)+'\n',{flag:'wx',mode:0o600});
console.log(`${plan.writes.length} écritures préparées; ${plan.warnings.length} avertissements. Plan et sauvegarde privés enregistrés. ${apply?'Application.':'Simulation: aucune donnée distante modifiée.'}`);
if(apply){
 // Every write is guarded against concurrent changes. Abort on first conflict;
 // preceding documents may already be migrated; rerun is idempotent.
 for(const w of plan.writes)await ctx.db.runTransaction(async tx=>{
  const ref=ctx.db.doc(w.path),snap=await tx.get(ref);
  if(w.operation==='create'){if(snap.exists)throw new Error(`Conflit: ${w.path} existe désormais.`);tx.create(ref,decode(w.data,ctx));}
  else {if(!snap.exists||JSON.stringify(encode(snap.updateTime))!==JSON.stringify(w.expectedUpdateTime))throw new Error(`Conflit: ${w.path} modifié depuis la sauvegarde.`);tx.set(ref,decode(w.data,ctx));}
 });
 console.log('Migration appliquée. Cours nouvellement créés masqués; aucun fichier vidéo déplacé. Vérifier le plan avant de publier.');
}

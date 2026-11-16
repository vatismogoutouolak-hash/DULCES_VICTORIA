import {createHash} from 'node:crypto';
export const PROGRAMS=[
 {id:'chantilly',title:'Le gâteau d’anniversaire à la chantilly',description:'Des bases simples pour vos premiers gâteaux et des finitions qui font la différence. Programme : génoise classique, au chocolat, à l’eau et au beurre ; chantilly classique, au chocolat et stable résistante à la chaleur ; décoration en chantilly avec de la pâte à sucre.',category:'cakes',image:'https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=1000&q=80'},
 {id:'creme-au-beurre',title:'Le gâteau d’anniversaire à la crème au beurre',description:'Apprenez à réaliser vos génoises et à travailler trois crèmes au beurre. Programme : génoise classique, au chocolat, à l’eau et au beurre ; crème au beurre américaine, à la meringue suisse et au chocolat blanc résistante à la chaleur pour faciliter le transport.',category:'cakes',image:'https://images.unsplash.com/photo-1535141192574-5d4897c12636?auto=format&fit=crop&w=1000&q=80'},
 {id:'gateaux-en-pot',title:'Gâteaux en pot & biscuits',description:'Des recettes accessibles pour préparer une offre gourmande. Programme : génoise classique, génoise au chocolat, red velvet ; chantilly classique, au chocolat, en poudre et crème au fromage ; sirop et montage des cups ; biscuits au beurre, cookies aux pépites de chocolat et madeleines.',category:'commerce',image:'https://images.unsplash.com/photo-1499636136210-6f4ee915583e?auto=format&fit=crop&w=1000&q=80'}
];
export function assetId(courseId,lessonId,videoPath){return `${courseId}-${lessonId}`.slice(0,90).replace(/[^a-zA-Z0-9_-]/g,'-')+'-'+createHash('sha256').update(videoPath).digest('hex').slice(0,16);}
export function planMigration(backup,now) {
 const existing=new Map(backup.documents.map(d=>[d.path,d]));const writes=[],warnings=[],videoMappings=[];
 for(const p of PROGRAMS)if(!existing.has(`courses/${p.id}`))writes.push({path:`courses/${p.id}`,operation:'create',data:{title:p.title,description:p.description,category:p.category,level:'Débutant',duration:'À confirmer',price:null,image:p.image,status:'hidden',createdAt:now,updatedAt:now}});
 for(const doc of backup.documents){
  if(/^enrollments\/[^/]+$/.test(doc.path) && typeof doc.data.uid==='string'){
   const d=doc.data;
   if(!['pending','approved','rejected','suspended'].includes(d.status)||typeof d.courseId!=='string'||doc.path!==`enrollments/${d.uid}_${d.courseId}`){warnings.push(`Inscription incompatible ignorée: ${doc.path}`);continue;}
   // Pending/rejected/suspended never become active. Original intent preserved in mandatory backup.
   writes.push({path:doc.path,operation:'replace',expectedUpdateTime:doc.updateTime,data:{userId:d.uid,courseId:d.courseId,status:d.status==='approved'?'active':'revoked',createdAt:d.createdAt??now,updatedAt:now}});
   if(d.status==='pending')warnings.push(`Demande en attente archivée dans la sauvegarde, accès révoqué sans approbation: ${doc.path}`);
  }
  const match=doc.path.match(/^courses\/([^/]+)\/lessons\/([^/]+)$/);
  if(match && typeof doc.data.videoPath==='string'){
   const [,courseId,lessonId]=match,d=doc.data,videoAssetId=assetId(courseId,lessonId,d.videoPath);
   if(typeof d.title!=='string'||!Number.isInteger(d.order)){warnings.push(`Leçon incompatible ignorée: ${doc.path}`);continue;}
   writes.push({path:doc.path,operation:'replace',expectedUpdateTime:doc.updateTime,data:{title:d.title,module:'Programme',order:d.order,duration:'À confirmer',videoAssetId,createdAt:d.createdAt??now,updatedAt:now}});
   videoMappings.push({courseId,lessonId,oldVideoPath:d.videoPath,videoAssetId,target:`/srv/dulces/videos/${videoAssetId}/index.m3u8`});
  }
 }
 const uids=new Set(backup.authUsers.map(u=>u.uid));
 for(const w of writes)if(w.data.userId&&!uids.has(w.data.userId))warnings.push(`Compte Auth absent pour ${w.path}; accès inutilisable tant que non résolu.`);
 return {format:'dulces-migration-plan-v1',projectId:backup.projectId,writes,warnings,videoMappings,adminAccountsToBootstrap:backup.authUsers.filter(u=>u.customClaims?.admin===true).map(u=>u.uid),profilesToComplete:backup.authUsers.filter(u=>!existing.has(`users/${u.uid}`)).map(u=>u.uid)};
}

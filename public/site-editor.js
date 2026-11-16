import {doc,getDoc,onSnapshot,runTransaction,serverTimestamp} from 'firebase/firestore';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const page=document.body.dataset.page||'home', keys=['home','student','admin'];
const paths={home:'/',student:'/espace.html',admin:'/administration.html'};
const excluded='#auth-modal,#page-content,#page-status,#account-tools,#course-grid,#catalog-empty,.header-actions,.account-nav,script,style,[aria-hidden="true"]';
const registry=new Map(), sections=new Map();
let baseline, published={pages:{home:'{}',student:'{}',admin:'{}'},theme:{}},unsubscribe, editorGeneration=0;
export function imageURL(value){if(typeof value!=='string')return '';return /^https:\/\/[^\s"'<>\\]+$/i.test(value)||/^data:image\/(?:webp|jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(value)?value:'';}
export function linkURL(value){if(typeof value!=='string')return '';return /^(?:#[\w-]*|\/(?!\/)[^\s<>\\]*|https:\/\/[^\s<>\\]+|mailto:[^\s<>]+|tel:\+?[\d ()-]+)$/.test(value)?value:'';}
function add(id,item){registry.set(id,item);}
function register(){
 let i=0;const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
 while(walker.nextNode()){const n=walker.currentNode,p=n.parentElement;if(!p||p.closest(excluded)||!n.textContent.trim()||!p.closest('header,main,footer,.announcement'))continue;
 const id='text-'+i++;add(id,{kind:'text',label:n.textContent.trim().slice(0,70),node:n,original:n.textContent,section:p.closest('section')?.id||p.closest('section')?.className||p.closest('header,footer')?.tagName||'En-tête'});}
 document.querySelectorAll('header a,main a,footer a,.announcement a').forEach((n,j)=>{if(n.closest(excluded))return;add('link-'+j,{kind:'link',label:n.textContent.trim().slice(0,60),node:n,original:n.getAttribute('href')||'',section:'Liens'});});
 document.querySelectorAll('header img,main img,footer img,.hero-photo,.method-photo').forEach((n,j)=>{if(n.closest(excluded))return;const bg=getComputedStyle(n).backgroundImage.match(/url\(["']?(.*?)["']?\)/);add('image-'+j,{kind:'image',label:n.alt||n.getAttribute('aria-label')||'Image '+(j+1),node:n,original:n.tagName==='IMG'?n.src:bg?.[1]||'',section:'Images'});});
 document.querySelectorAll('main > section').forEach((n,j)=>sections.set('section-'+j,{node:n,label:n.querySelector('h1,h2,strong')?.textContent||n.id||'Section '+(j+1)}));
 baseline={title:document.title,description:document.querySelector('meta[name="description"]')?.content||''};
}
register();
function parsePage(data,p=page){try{const v=JSON.parse(data?.pages?.[p]||'{}');return v&&typeof v==='object'&&!Array.isArray(v)?v:{};}catch{return {};}}
function apply(data){
 data=data&&typeof data==='object'&&!Array.isArray(data)?data:{};
 const values=parsePage(data);
 for(const [id,r]of registry){const value=values.fields?.[id]??r.original;if(typeof value!=='string')continue;
 if(r.kind==='text')r.node.textContent=value.slice(0,10000);
 if(r.kind==='link'){const safe=linkURL(value);if(safe)r.node.setAttribute('href',safe);}
 if(r.kind==='image'){const safe=imageURL(value);if(safe){if(r.node.tagName==='IMG')r.node.src=safe;else r.node.style.backgroundImage='url("'+safe+'")';}}
 }
 for(const [id,s]of sections)s.node.hidden=Array.isArray(values.hidden)&&values.hidden.includes(id);
 for(const id of [...new Set([...(Array.isArray(values.order)?values.order:[]),...sections.keys()])]){const s=sections.get(id);if(s)s.node.parentNode.append(s.node);}
 document.querySelectorAll('[data-cms-logo]').forEach(n=>n.remove());
 const logo=imageURL(values.logo||'');document.querySelectorAll('.brand').forEach(n=>{const text=n.querySelector('.brand-name');if(text)text.hidden=!!logo;if(logo){const img=document.createElement('img');img.dataset.cmsLogo='';img.src=logo;img.alt=values.logoAlt||'Logo';img.style.cssText='max-width:200px;max-height:70px;object-fit:contain';n.prepend(img);}});
 document.title=typeof values.title==='string'?values.title.slice(0,180):baseline.title;
 const meta=document.querySelector('meta[name="description"]');if(meta)meta.content=typeof values.description==='string'?values.description.slice(0,500):baseline.description;
 for(const key of ['cocoa','terra','cream','ink']){const v=data.theme?.[key];if(/^#[0-9a-f]{6}$/i.test(v||''))document.documentElement.style.setProperty('--'+key,v);else document.documentElement.style.removeProperty('--'+key);}
 document.querySelectorAll('[data-cms-block]').forEach(n=>n.remove());
 for(const block of (Array.isArray(values.blocks)?values.blocks:[]).filter(b=>b&&typeof b==='object'&&!Array.isArray(b)).slice(0,30)){
 const section=document.createElement('section');section.dataset.cmsBlock='';section.className='section container';
 const h=document.createElement('h2');h.textContent=String(block.title||'').slice(0,300);section.append(h);
 if(imageURL(block.image||'')){const img=document.createElement('img');img.src=block.image;img.alt=String(block.title||'');img.loading='lazy';img.style.cssText='max-height:450px;object-fit:cover;border-radius:20px';section.append(img);}
 const p=document.createElement('p');p.textContent=String(block.text||'').slice(0,10000);p.style.whiteSpace='pre-line';section.append(p);
 if(linkURL(block.link||'')){const a=document.createElement('a');a.href=block.link;a.textContent=block.label||'En savoir plus';a.className='btn btn-dark';section.append(a);}
 document.querySelector('main')?.append(section);}
}
function snapshot(){return {fields:[...registry].map(([id,r])=>({id,kind:r.kind,label:r.label,value:r.original,section:r.section})),sections:[...sections].map(([id,s])=>({id,label:s.label})),...baseline};}
const preview=new URLSearchParams(location.search).get('cms-preview')==='1'&&window.parent!==window;
function announce(){window.parent.postMessage({type:'dv-cms-ready',page,snapshot:snapshot()},location.origin);}
if(preview){window.addEventListener('message',e=>{if(e.origin!==location.origin||e.source!==window.parent)return;if(e.data?.type==='dv-cms-apply')apply(e.data.value);if(e.data?.type==='dv-cms-request')announce();});announce();}
export function connectContent(db){unsubscribe?.();unsubscribe=onSnapshot(doc(db,'siteContent','published'),s=>{published=s.exists()?s.data():{pages:{home:'{}',student:'{}',admin:'{}'},theme:{}};if(!preview)apply(published);},()=>{/* Preserve original content when publication has not yet been configured. */});}
async function upload(file){
 if(!file||!/^image\/(png|jpeg|webp)$/.test(file.type)||file.size>15*1024*1024)throw Error('Choisissez une image PNG, JPG ou WebP de moins de 15 Mo.');
 const bitmap=await createImageBitmap(file);try{const canvas=document.createElement('canvas'),scale=Math.min(1,1200/Math.max(bitmap.width,bitmap.height));canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);let result;for(const quality of [.8,.65,.45,.25]){result=canvas.toDataURL('image/webp',quality);if(result.length<=100000)return result;}throw Error('Cette image reste trop volumineuse. Utilisez une image plus petite ou son adresse HTTPS.');}finally{bitmap.close();}}
export async function renderSiteEditor({db,user,allowed,target}){
 const generation=++editorGeneration;const alive=()=>generation===editorGeneration&&target.isConnected&&allowed();let data,version=null,dirty=false,active='home',catalogue,hydrating=false;
 target.innerHTML='<section class="panel"><h2>Éditer tout le site</h2><p role="status">Chargement du brouillon…</p></section>';
 try{const snap=await getDoc(doc(db,'siteContent','draft'));if(!alive())return;data=structuredClone(snap.exists()?snap.data():published);version=snap.exists()?snap.data().updatedAt?.toMillis()??null:null;}catch(err){if(!alive())return;target.innerHTML='<section class="panel"><h2>Éditeur en attente d’activation</h2><p>Les règles de publication du site doivent être activées dans Firebase avant de pouvoir sauvegarder vos modifications.</p><p>Les formations et les accès étudiants restent disponibles dans leurs onglets.</p></section>';return;}
 delete data.updatedAt;delete data.updatedBy;data.pages={home:'{}',student:'{}',admin:'{}',...data.pages};data.theme=data.theme||{};
 target.innerHTML='<section class="panel"><h2>Tout le contenu de votre site</h2><p>Modifiez les textes, images, logo, liens et couleurs. Enregistrez votre brouillon, vérifiez l’aperçu puis publiez pour vos visiteurs.</p><div class="actions"><label>Page <select id="cms-page"><option value="home">Accueil</option><option value="student">Espace étudiant</option><option value="admin">Administration</option></select></label><button class="btn btn-outline" id="cms-save">Enregistrer le brouillon</button><button class="btn btn-dark" id="cms-publish">Publier sur le site</button><button class="btn btn-outline" id="cms-export">Exporter une sauvegarde</button><label class="btn btn-outline">Importer une sauvegarde<input id="cms-import" type="file" accept="application/json" hidden></label><button class="btn btn-outline" id="cms-reset">Reprendre la version publiée</button></div><p id="cms-status" role="status" aria-live="polite"></p><div class="cms-layout"><div id="cms-fields"></div><div class="cms-preview"><p>Aperçu du brouillon</p><iframe id="cms-frame" title="Aperçu de la page" style="width:100%;height:75vh;border:1px solid #ddd;border-radius:16px;background:white"></iframe></div></div></section>';
 const $=s=>target.querySelector(s),state=$('#cms-status'),frame=$('#cms-frame');let edits=parsePage(data,active);
 function say(s){state.textContent=s;}
 function changed(){dirty=true;data.pages[active]=JSON.stringify(edits);frame.contentWindow?.postMessage({type:'dv-cms-apply',value:data},location.origin);say('Modifications non enregistrées.');}
 function input(label,value,handler,type='text'){const l=document.createElement('label');l.className='field';l.textContent=label;const n=document.createElement(type==='textarea'?'textarea':'input');if(type!=='textarea')n.type=type;n.value=value||'';n.maxLength=type==='textarea'?10000:2048;n.addEventListener('input',()=>handler(n.value));l.append(n);return l;}
 function imageInput(label,value,handler){const box=document.createElement('div');box.append(input(label+' — adresse HTTPS',value,handler));const file=document.createElement('input');file.type='file';file.accept='image/png,image/jpeg,image/webp';file.setAttribute('aria-label','Importer '+label);file.onchange=async()=>{try{const image=await upload(file.files[0]);if(!alive())return;handler(image);renderFields();}catch(e){say(e.message);}};box.append(file);if(imageURL(value||'')){const img=document.createElement('img');img.src=value;img.alt=label;img.style.cssText='max-width:160px;max-height:90px;object-fit:contain';box.append(img);}return box;}
 function renderFields(){
 const root=$('#cms-fields');root.replaceChildren();if(!catalogue)return;
 root.append(input('Titre de la page',edits.title??catalogue.title,v=>{edits.title=v;changed();}),input('Description pour les moteurs de recherche',edits.description??catalogue.description,v=>{edits.description=v;changed();},'textarea'),imageInput('Logo (vide pour le nom écrit)',edits.logo||'',v=>{edits.logo=v;for(const p of keys)if(p!==active){const other=parsePage(data,p);other.logo=v;data.pages[p]=JSON.stringify(other);}changed();}),input('Texte alternatif du logo',edits.logoAlt||'',v=>{edits.logoAlt=v;changed();}));
 const theme=document.createElement('details');theme.innerHTML='<summary>Couleurs du site</summary>';for(const [key,label,def]of [['cocoa','Couleur principale','#38231e'],['terra','Couleur d’accent','#b86f4d'],['cream','Fond','#fbf7f1'],['ink','Texte','#2e211d']])theme.append(input(label,data.theme[key]||def,v=>{data.theme[key]=v;changed();},'color'));root.append(theme);
 const groups=new Map();edits.fields=edits.fields||{};
 for(const f of catalogue.fields){if(!groups.has(f.section)){const details=document.createElement('details'),sum=document.createElement('summary');sum.textContent=f.section;details.append(sum);groups.set(f.section,details);root.append(details);}const set=v=>{edits.fields[f.id]=v;changed();};groups.get(f.section).append(f.kind==='image'?imageInput(f.label,edits.fields[f.id]??f.value,set):input((f.kind==='link'?'Lien : ':'')+f.label,edits.fields[f.id]??f.value,set,f.kind==='text'?'textarea':'text'));}
 const details=document.createElement('details');details.innerHTML='<summary>Ordre et visibilité des sections</summary>';edits.order=edits.order||catalogue.sections.map(s=>s.id);edits.hidden=edits.hidden||[];
 edits.order.forEach((id,i)=>{const sec=catalogue.sections.find(s=>s.id===id);if(!sec)return;const row=document.createElement('div'),check=document.createElement('input');check.type='checkbox';check.checked=!edits.hidden.includes(id);const label=document.createElement('label');label.textContent=sec.label.slice(0,90);label.prepend(check);check.onchange=()=>{edits.hidden=check.checked?edits.hidden.filter(x=>x!==id):[...edits.hidden,id];changed();};row.append(label);for(const [delta,text]of [[-1,'Monter'],[1,'Descendre']]){const b=document.createElement('button');b.type='button';b.textContent=text;b.disabled=i+delta<0||i+delta>=edits.order.length;b.onclick=()=>{const a=edits.order;[a[i],a[i+delta]]=[a[i+delta],a[i]];changed();renderFields();};row.append(b);}details.append(row);});root.append(details);
 const blocks=document.createElement('details');blocks.innerHTML='<summary>Sections supplémentaires : témoignages, contact, informations…</summary>';edits.blocks=edits.blocks||[];
 edits.blocks.forEach((b,i)=>{const item=document.createElement('fieldset');for(const key of ['title','text','link','label'])item.append(input(({title:'Titre',text:'Texte',link:'Lien',label:'Texte du bouton'})[key],b[key],v=>{b[key]=v;changed();},key==='text'?'textarea':'text'));item.append(imageInput('Image',b.image,v=>{b.image=v;changed();}));const remove=document.createElement('button');remove.textContent='Supprimer cette section';remove.onclick=()=>{edits.blocks.splice(i,1);changed();renderFields();};item.append(remove);blocks.append(item);});
 const add=document.createElement('button');add.className='btn btn-outline';add.textContent='Ajouter une section';add.disabled=edits.blocks.length>=30;add.onclick=()=>{edits.blocks.push({title:'Nouvelle section',text:'',image:'',link:'',label:''});changed();renderFields();};blocks.append(add);root.append(blocks);
 }
 function receive(e){if(!alive()){window.removeEventListener('message',receive);return;}if(e.origin!==location.origin||e.source!==frame.contentWindow||e.data?.type!=='dv-cms-ready'||e.data.page!==active)return;catalogue=e.data.snapshot;renderFields();frame.contentWindow.postMessage({type:'dv-cms-apply',value:data},location.origin);}
 window.addEventListener('message',receive);frame.onload=()=>frame.contentWindow?.postMessage({type:'dv-cms-request'},location.origin);
 function open(){catalogue=null;edits=parsePage(data,active);frame.src=paths[active]+'?cms-preview=1';}
 $('#cms-page').onchange=e=>{data.pages[active]=JSON.stringify(edits);active=e.target.value;open();};
 const before=e=>{if(alive()&&dirty){e.preventDefault();e.returnValue='';}else if(!alive())window.removeEventListener('beforeunload',before);};window.addEventListener('beforeunload',before);
 function validate(){
 data.pages[active]=JSON.stringify(edits);
 const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
 const fail=()=>{throw Error('Sauvegarde invalide : vérifiez les textes, images, liens et sections.');};
 if(!object(data.pages)||Object.keys(data.pages).some(p=>!keys.includes(p))||!object(data.theme))fail();
 for(const p of keys){
  if(typeof data.pages[p]!=='string'||data.pages[p].length>250000)throw Error('La page contient trop d’images. Utilisez des adresses HTTPS ou réduisez les images.');
  const v=JSON.parse(data.pages[p]);
  if(!object(v)||Object.keys(v).some(k=>!['fields','logo','logoAlt','title','description','hidden','order','blocks'].includes(k)))fail();
  for(const [key,max]of [['logo',100000],['logoAlt',300],['title',180],['description',500]])if(key in v&&(typeof v[key]!=='string'||v[key].length>max))fail();
  if(v.logo&&!imageURL(v.logo))fail();
  if('fields'in v){if(!object(v.fields)||Object.keys(v.fields).length>1000)fail();for(const [key,value]of Object.entries(v.fields)){if(!/^(text|link|image)-[0-9]+$/.test(key)||typeof value!=='string'||value.length>(key.startsWith('image-')?100000:key.startsWith('link-')?2048:10000))fail();if(key.startsWith('image-')&&value&&!imageURL(value))fail();if(key.startsWith('link-')&&value&&!linkURL(value))fail();}}
  for(const key of ['hidden','order'])if(key in v&&(!Array.isArray(v[key])||v[key].length>100||v[key].some(id=>typeof id!=='string'||!/^section-[0-9]+$/.test(id))))fail();
  if('blocks'in v){if(!Array.isArray(v.blocks)||v.blocks.length>30)fail();for(const b of v.blocks){if(!object(b)||Object.keys(b).some(k=>!['title','text','image','link','label'].includes(k)))fail();for(const [key,max]of [['title',300],['text',10000],['image',100000],['link',2048],['label',200]])if(key in b&&(typeof b[key]!=='string'||b[key].length>max))fail();if(b.image&&!imageURL(b.image)||b.link&&!linkURL(b.link))fail();}}
 }
 if(JSON.stringify(data).length>760000)throw Error('La sauvegarde est trop volumineuse. Réduisez les images.');
 for(const [k,v]of Object.entries(data.theme))if(!['cocoa','terra','cream','ink'].includes(k)||typeof v!=='string'||!/^#[0-9a-f]{6}$/i.test(v))throw Error('Couleur invalide.');
 }
 async function persist(publish){if(!alive())return;const buttons=target.querySelectorAll('button');buttons.forEach(b=>b.disabled=true);try{validate();const ref=doc(db,'siteContent','draft');await runTransaction(db,async tx=>{const old=await tx.get(ref);if((old.exists()?old.data().updatedAt?.toMillis()??null:null)!==version)throw Error('Le brouillon a été modifié dans une autre fenêtre. Rechargez la page avant de continuer.');if(!allowed())throw Error('Accès administrateur requis.');const payload={pages:data.pages,theme:data.theme,updatedAt:serverTimestamp(),updatedBy:user.uid};tx.set(ref,payload);if(publish)tx.set(doc(db,'siteContent','published'),payload);});const saved=await getDoc(ref),savedData=saved.data();if(!savedData||!keys.every(p=>savedData.pages?.[p]===data.pages[p])||!['cocoa','terra','cream','ink'].every(k=>savedData.theme?.[k]===data.theme[k]))throw Error('Le brouillon a été modifié dans une autre fenêtre. Rechargez la page avant de continuer.');version=savedData.updatedAt?.toMillis()??null;dirty=false;say(publish?'Le site a été publié. Vos visiteurs voient maintenant les modifications.':'Brouillon enregistré. Le site public reste inchangé.');}catch(e){say(e.code==='permission-denied'?'Publication non autorisée : vérifiez l’activation des règles de contenu et vos droits administrateur.':e.message);}finally{if(alive()){buttons.forEach(b=>b.disabled=false);renderFields();}}}
 $('#cms-save').onclick=()=>persist(false);$('#cms-publish').onclick=()=>{if(confirm('Publier ces modifications pour tous les visiteurs ?'))persist(true);};
 $('#cms-export').onclick=()=>{try{validate();const url=URL.createObjectURL(new Blob([JSON.stringify({format:'dulces-victoria-cms-v1',pages:data.pages,theme:data.theme},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='dulces-victoria-contenu-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){say(e.message);}};
 $('#cms-import').onchange=async e=>{try{const f=e.target.files[0];if(!f||f.size>1000000)throw Error('Sauvegarde trop volumineuse.');const v=JSON.parse(await f.text());if(v.format!=='dulces-victoria-cms-v1'||!v.pages||!v.theme)throw Error('Format de sauvegarde invalide.');const old=data;data={pages:v.pages,theme:v.theme};edits=parsePage(data,active);try{validate();}catch(e){data=old;edits=parsePage(data,active);throw e;}dirty=true;open();say('Sauvegarde importée dans le brouillon. Vérifiez puis enregistrez ou publiez.');}catch(err){say(err.message);}};
 $('#cms-reset').onclick=async()=>{if(!confirm('Remplacer votre brouillon par la dernière version publiée ?'))return;try{const snap=await getDoc(doc(db,'siteContent','published'));if(!alive())return;data=structuredClone(snap.exists()?snap.data():{pages:{home:'{}',student:'{}',admin:'{}'},theme:{}});delete data.updatedAt;delete data.updatedBy;dirty=true;open();say('Version publiée chargée. Enregistrez pour remplacer le brouillon.');}catch(e){say(e.message);}};
 open();
}

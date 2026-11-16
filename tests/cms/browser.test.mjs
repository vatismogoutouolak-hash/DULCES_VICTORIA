import {after,before,test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from 'playwright';

const origin='http://127.0.0.1:4173';
let server,browser,page,frame,snapshot;
const errors=[];
before(async()=>{
 server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','4173','--strictPort'],{stdio:'pipe'});
 let log=''; server.stdout.on('data',s=>log+=s);server.stderr.on('data',s=>log+=s);
 let ready=false;
 for(let i=0;i<100;i++){try{ready=(await fetch(origin)).ok;if(ready)break;}catch{}await delay(100);}
 assert.ok(ready,'Preview server did not start: '+log);
 browser=await chromium.launch();
 page=await browser.newPage();
 await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 await page.goto(origin,{waitUntil:'load'});
 snapshot=await page.evaluate(()=>new Promise((resolve,reject)=>{
  document.body.replaceChildren();
  const iframe=document.createElement('iframe');iframe.id='test-preview';
  const timeout=setTimeout(()=>reject(Error('CMS preview did not announce readiness')),20000);
  const receive=e=>{if(e.origin===location.origin&&e.source===iframe.contentWindow&&e.data?.type==='dv-cms-ready'){clearTimeout(timeout);window.removeEventListener('message',receive);resolve(e.data.snapshot);}};
  window.addEventListener('message',receive);
  iframe.src='/?cms-preview=1';document.body.append(iframe);
 }));
 frame=page.frames().find(f=>f!==page.mainFrame());
 assert.ok(frame);
 assert.ok(snapshot.fields.length>20,'Page content should be fully indexed');
 assert.ok(snapshot.sections.length>3,'Page sections should be indexed');
});
after(async()=>{await browser?.close();server?.kill('SIGTERM');});
async function apply(edits={},theme={}) {
 await page.evaluate(value=>document.querySelector('#test-preview').contentWindow.postMessage({type:'dv-cms-apply',value},location.origin),{pages:{home:JSON.stringify(edits),student:'{}',admin:'{}'},theme});
 await delay(120);
}
test('CMS preview changes and restores text without interpreting HTML',async()=>{
 const field=snapshot.fields.find(f=>f.kind==='text');
 const attack='<img src=x onerror="window.cmsInjected=true">Texte personnalisé';
 await apply({fields:{[field.id]:attack},title:'Titre personnalisé',description:'Description personnalisée'});
 assert.equal(await frame.title(),'Titre personnalisé');
 assert.equal(await frame.locator('meta[name="description"]').getAttribute('content'),'Description personnalisée');
 assert.equal(await frame.evaluate(()=>window.cmsInjected),undefined);
 assert.equal(await frame.locator('img[src="x"]').count(),0);
 assert.ok(await frame.evaluate(text=>document.body.textContent.includes(text),attack));
 await apply();
 assert.equal(await frame.title(),snapshot.title);
 assert.equal(await frame.locator('meta[name="description"]').getAttribute('content'),snapshot.description);
 assert.ok(await frame.evaluate(text=>document.body.textContent.includes(text),field.value));
});
test('logo, image and theme overrides restore their original appearance',async()=>{
 const image=snapshot.fields.find(f=>f.kind==='image');
 assert.ok(image,'Home page must expose its images');
 const logo='https://example.com/logo.png',photo='https://example.com/patisserie.webp';
 await apply({logo,logoAlt:'Mon logo',fields:{[image.id]:photo}},{cocoa:'#123456',terra:'#654321',cream:'#fafafa',ink:'#111111'});
 assert.ok(await frame.locator('[data-cms-logo]').count()>0);
 assert.equal(await frame.locator('[data-cms-logo]').first().getAttribute('src'),logo);
 assert.equal(await frame.locator('[data-cms-logo]').first().getAttribute('alt'),'Mon logo');
 assert.equal(await frame.evaluate(()=>document.documentElement.style.getPropertyValue('--cocoa')),'#123456');
 assert.ok(await frame.evaluate(url=>[...document.querySelectorAll('img')].some(n=>n.src===url)||[...document.querySelectorAll('.hero-photo,.method-photo')].some(n=>n.style.backgroundImage.includes(url)),photo));
 await apply();
 assert.equal(await frame.locator('[data-cms-logo]').count(),0);
 assert.equal(await frame.evaluate(()=>document.documentElement.style.getPropertyValue('--cocoa')),'');
 assert.equal(await frame.evaluate(()=>[...document.querySelectorAll('.brand-name')].some(n=>n.hidden)),false);
});
test('sections can be hidden, reordered, supplemented, and reset',async()=>{
 const order=snapshot.sections.map(s=>s.id).reverse();
 const original=await frame.locator('main > section').evaluateAll(nodes=>nodes.map(n=>n.id||n.className));
 await apply({order,hidden:[order[0]],blocks:[{title:'Nouveau témoignage',text:'Une élève satisfaite',image:'https://example.com/testimonial.webp',link:'https://example.com/contact',label:'Nous écrire'}]});
 const sections=await frame.locator('main > section:not([data-cms-block])').evaluateAll(nodes=>nodes.map(n=>n.id||n.className));
 assert.deepEqual(sections,[...original].reverse());
 assert.equal(await frame.locator('main > section:not([data-cms-block])').first().evaluate(n=>n.hidden),true);
 assert.equal(await frame.locator('[data-cms-block] h2').textContent(),'Nouveau témoignage');
 assert.equal(await frame.locator('[data-cms-block] a').getAttribute('href'),'https://example.com/contact');
 await apply();
 assert.equal(await frame.locator('[data-cms-block]').count(),0);
 assert.equal(await frame.locator('main > section').evaluateAll(nodes=>nodes.some(n=>n.hidden)),false);
 assert.deepEqual(await frame.locator('main > section').evaluateAll(nodes=>nodes.map(n=>n.id||n.className)),original);
});
test('unsafe image, link and theme values never become active content',async()=>{
 const image=snapshot.fields.find(f=>f.kind==='image'),link=snapshot.fields.find(f=>f.kind==='link');
 await apply({logo:'javascript:alert(1)',fields:{[image.id]:'data:image/svg+xml;base64,PHN2Zz4=',[link.id]:'javascript:alert(1)'},blocks:[{title:'<script>window.cmsInjected=true</script>',text:'<svg onload="window.cmsInjected=true">',image:'javascript:alert(1)',link:'javascript:alert(1)',label:'Unsafe'}]},{cocoa:'url(javascript:alert(1))'});
 assert.equal(await frame.locator('[data-cms-logo]').count(),0);
 assert.equal(await frame.locator('a[href^="javascript:"]').count(),0);
 assert.equal(await frame.locator('img[src^="javascript:"],img[src^="data:image/svg"]').count(),0);
 assert.equal(await frame.locator('[data-cms-block] script,[data-cms-block] svg,[data-cms-block] a').count(),0);
 assert.equal(await frame.evaluate(()=>window.cmsInjected),undefined);
 assert.equal(await frame.evaluate(()=>document.documentElement.style.getPropertyValue('--cocoa')),'');
 await apply();
});
test('messages from an unrelated same-origin frame cannot modify the preview',async()=>{
 await apply();
 await page.evaluate(()=>{
  const attacker=document.createElement('iframe');attacker.src='about:blank';document.body.append(attacker);
  attacker.contentWindow.eval("parent.document.querySelector('#test-preview').contentWindow.postMessage({type:'dv-cms-apply',value:{pages:{home:JSON.stringify({title:'FORGED TITLE'})},theme:{}}},parent.location.origin)");
 });
 await delay(120);
 assert.equal(await frame.title(),snapshot.title);
});

test('malformed preview data cannot crash rendering or create active content',async()=>{
 const failures=[];const capture=e=>failures.push(e.message);page.on('pageerror',capture);
 try {
  await apply({hidden:25,order:'invalid',logo:{url:'javascript:alert(1)'},blocks:[null,25,[],{title:'Valide',text:'Texte conservé',image:{url:'bad'},link:{url:'bad'}}]});
  assert.equal(await frame.locator('[data-cms-block] h2').textContent(),'Valide');
  assert.equal(await frame.locator('[data-cms-block] img,[data-cms-block] a').count(),0);
  await page.evaluate(()=>document.querySelector('#test-preview').contentWindow.postMessage({type:'dv-cms-apply',value:null},location.origin));
  await delay(120);
  assert.equal(await frame.title(),snapshot.title);
  assert.deepEqual(failures,[]);
 } finally {page.off('pageerror',capture);await apply();}
});

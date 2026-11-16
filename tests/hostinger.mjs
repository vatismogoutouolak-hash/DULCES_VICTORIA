import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp,mkdir,writeFile,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {createServer} from '../server/hostinger.mjs';
import {createLocalStorage} from '../server/local-storage.js';
import {signPlayback,bindPlaybackSession,validPlaybackSession} from '../server/video-access.js';

const fixture=await mkdtemp(join(tmpdir(),'dulces-hostinger-test-'));
const publicRoot=join(fixture,'public'),privateRoot=join(fixture,'private');
await mkdir(publicRoot);await mkdir(privateRoot);
await writeFile(join(publicRoot,'index.html'),'<!doctype html><title>Test public page</title>');
await writeFile(join(publicRoot,'style.css'),'body{color:#123}');
await writeFile(join(fixture,'secret.env'),'NEVER_PUBLIC_TEST_MARKER');
await symlink(join(fixture,'secret.env'),join(publicRoot,'app.js'));
await mkdir(join(publicRoot,'backend.js'));
await mkdir(join(privateRoot,'courses'),{recursive:true});
await writeFile(join(privateRoot,'courses','test.mp4'),'0123456789');
await symlink(join(fixture,'secret.env'),join(privateRoot,'courses','escape.mp4'));
const server=createServer({publicRoot});
server.listen(0,'127.0.0.1');await once(server,'listening');
const port=server.address().port;
function request(path,{method='GET',body,headers={},chunked=false}={}){
  return new Promise((resolve,reject)=>{
    const req=http.request({host:'127.0.0.1',port,path,method,headers},res=>{
      const parts=[];res.on('data',chunk=>parts.push(chunk));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,text:Buffer.concat(parts).toString()}));res.on('error',reject);
    });req.on('error',reject);
    if(chunked&&body){req.write(body.slice(0,8192));req.write(body.slice(8192));req.end();}else req.end(body);
  });
}
const envKeys=['FIREBASE_PRIVATE_KEY','FIREBASE_CLIENT_EMAIL','VIDEO_TOKEN_SECRET','VIDEO_STORAGE','HOSTINGER_MODE'];
const previous=Object.fromEntries(envKeys.map(key=>[key,process.env[key]]));
try {
  envKeys.forEach(key=>delete process.env[key]);
  const home=await request('/');assert.equal(home.status,200);assert.match(home.text,/Test public page/);
  assert.equal(home.headers['x-content-type-options'],'nosniff');
  assert.equal(home.headers['x-frame-options'],'DENY');
  assert.match(home.headers['content-security-policy'],/frame-ancestors 'none'/);
  const head=await request('/',{method:'HEAD'});assert.equal(head.status,200);assert.equal(head.text,'');
  assert.deepEqual(JSON.parse((await request('/health')).text),{status:'ok'});
  assert.equal((await request('/health',{method:'HEAD'})).text,'');
  assert.equal((await request('/health',{method:'POST'})).status,405);
  assert.equal((await request('/',{method:'POST'})).status,405);
  for(const path of ['/.env','/package.json','/server/hostinger.mjs','/server/video-access.js','/firebase/firestore.rules','/ops/hostinger/production.env.example','/courses/test.mp4','/private/courses/test.mp4','/app.js','/backend.js']){
    const result=await request(path);assert.equal(result.status,404,path);assert.ok(!result.text.includes('NEVER_PUBLIC_TEST_MARKER'));
  }
  for(const path of ['/%2e%2e/secret.env','/%252e%252e/secret.env','/..%2fsecret.env','/%2e%2e%2fsecret.env','/%5csecret.env','/%00secret.env','/%E0%A4%A']){
    const result=await request(path);assert.ok([400,404].includes(result.status),`${path}: ${result.status}`);assert.ok(!result.text.includes('NEVER_PUBLIC_TEST_MARKER'));
  }
  assert.equal((await request('/api/config')).status,200);
  assert.equal((await request('/api/config',{method:'POST'})).status,405);
  assert.equal((await request('/api/unknown')).status,404);
  assert.equal((await request('/api/stream?token=bad&asset=test.mp4')).status,401);
  assert.equal((await request('/api/stream?token=a&token=b&asset=test.mp4')).status,400);
  assert.equal((await request('/api/stream',{method:'POST'})).status,405);
  assert.equal((await request('/api/video',{method:'GET'})).status,405);
  assert.equal((await request('/api/video',{method:'POST',body:'{}',headers:{'Content-Type':'application/json'}})).status,503);
  assert.equal((await request('/api/video',{method:'POST',body:'{}'})).status,415);
  for(const body of ['{bad','null','[]','"string"'])assert.equal((await request('/api/video',{method:'POST',body,headers:{'Content-Type':'application/json'}})).status,400);
  const oversized='x'.repeat(17000);
  assert.equal((await request('/api/video',{method:'POST',body:oversized,headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(oversized)}})).status,413);
  assert.equal((await request('/api/video',{method:'POST',body:oversized,headers:{'Content-Type':'application/json'},chunked:true})).status,413);
  console.log('PASS: real HTTP local server allowlist, security headers, methods, encoded traversal, public symlink/directory denial, private source/env/media denial, JSON validation/body limits, anonymous video and duplicate parameters.');

  assert.throws(()=>createLocalStorage('relative/path'),/absolu/);
  const storage=createLocalStorage(privateRoot);
  const file=storage.bucket().file('courses/test.mp4');
  assert.equal((await file.getMetadata())[0].size,'10');
  assert.equal((await file.download())[0].toString(),'0123456789');
  const ranged=[];for await(const part of file.createReadStream({start:2,end:5}))ranged.push(part);
  assert.equal(Buffer.concat(ranged).toString(),'2345');
  for(const path of ['../secret.env','/courses/test.mp4','courses/../test.mp4','courses//test.mp4','courses/%2e%2e/test.mp4','courses/escape.mp4','courses','courses/missing.mp4']){
    await assert.rejects(storage.bucket().file(path).getMetadata(),undefined,path);
    await assert.rejects(storage.bucket().file(path).download(),undefined,path);
  }
  await assert.rejects(async()=>{for await(const chunk of storage.bucket().file('courses/escape.mp4').createReadStream())void chunk;});
  console.log('PASS: private filesystem adapter reads/ranges valid files and denies traversal, encoded paths, external symlinks, directories and missing files.');

  process.env.VIDEO_STORAGE='local';process.env.VIDEO_TOKEN_SECRET='unit-test-secret-value-at-least-32-characters';
  const issued={};const response={setHeader(name,value){issued[name]=value;}};
  const session=bindPlaybackSession({headers:{}},response);
  assert.match(issued['Set-Cookie'],/HttpOnly; Secure; SameSite=Strict/);
  assert.match(issued['Set-Cookie'],/Path=\/api/);
  const cookie=issued['Set-Cookie'].split(';')[0];
  assert.equal(validPlaybackSession({headers:{cookie}},{session}),true);
  assert.equal(validPlaybackSession({headers:{}},{session}),false);
  assert.equal(validPlaybackSession({headers:{cookie:cookie+'x'}},{session}),false);
  assert.equal(validPlaybackSession({headers:{cookie}},{session:'different'}),false);
  const repeat={};assert.equal(bindPlaybackSession({headers:{cookie}},{setHeader(name,value){repeat[name]=value;}}),session);assert.deepEqual(repeat,{});
  const now=Date.now(),token=signPlayback({uid:'test-user',courseId:'chantilly',lessonId:'test',path:'courses/chantilly/test.mp4',iat:now,exp:now+60_000,session});
  assert.equal((await request(`/api/stream?token=${encodeURIComponent(token)}&asset=test.mp4`)).status,403);
  console.log('PASS: local playback binds a signed HttpOnly/Secure/SameSite cookie; missing, altered or different cookies and copied video URLs are denied.');
}finally{
  for(const key of envKeys)previous[key]===undefined?delete process.env[key]:process.env[key]=previous[key];
  await new Promise(resolve=>server.close(resolve));
  await rm(fixture,{recursive:true,force:true});
}

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const { default: configHandler } = await import(pathToFileURL(path.join(root, 'api/config.js')));
const keys = ['FIREBASE_API_KEY', 'FIREBASE_AUTH_DOMAIN', 'FIREBASE_PROJECT_ID', 'FIREBASE_STORAGE_BUCKET', 'FIREBASE_APP_ID'];
const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
const previousSecret = process.env.FIREBASE_PRIVATE_KEY;
function call(method) {
  const result = { headers: {}, statusCode: 200 };
  const response = {
    setHeader(name, value) { result.headers[name.toLowerCase()] = value; return this; },
    status(code) { result.statusCode = code; return this; },
    json(body) { result.body = body; return this; }
  };
  configHandler({ method }, response);
  return result;
}
try {
  keys.forEach(key => delete process.env[key]);
  assert.deepEqual(call('GET').body, { configured: false, config: null });
  keys.slice(0, -1).forEach(key => process.env[key] = 'public-test-value');
  assert.equal(call('GET').body.configured, false, 'Partial configuration must stay disabled');
  process.env.FIREBASE_APP_ID = 'public-test-app';
  process.env.FIREBASE_PRIVATE_KEY = 'DO_NOT_EXPOSE';
  const ready = call('GET');
  assert.equal(ready.body.configured, true);
  assert.equal(Object.keys(ready.body.config).length, 5);
  assert.ok(!JSON.stringify(ready.body).includes('DO_NOT_EXPOSE'));
  assert.equal(ready.headers['cache-control'], 'no-store');
  assert.equal(ready.headers['x-content-type-options'], 'nosniff');
  for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) assert.equal(call(method).statusCode, 405);
  console.log('PASS: configuration disabled when missing/partial; only public config exposed; no caching; unsupported methods rejected.');
} finally {
  for (const key of keys) previous[key] === undefined ? delete process.env[key] : process.env[key] = previous[key];
  previousSecret === undefined ? delete process.env.FIREBASE_PRIVATE_KEY : process.env.FIREBASE_PRIVATE_KEY = previousSecret;
}

const config = JSON.parse(await readFile(path.join(root, 'firebase.json'), 'utf8'));
for (const field of ['firestore', 'storage']) {
  assert.ok(config[field].rules, `${field} rules path required`);
  const rules = await readFile(path.join(root, config[field].rules), 'utf8');
  assert.ok(rules.includes('request.auth'), `${field} must check authentication`);
  assert.ok(!/allow\s+(?:read|write|read,\s*write)\s*:\s*if\s+true/.test(rules), `${field} must not grant public blanket access`);
}
console.log('PASS: Firebase rules files exist and no unconditional blanket allow. Real authorization still requires emulator and deployed-service testing.');

const backend = await import(pathToFileURL(path.join(root, 'backend.js')));
for (const courseId of ['../admin', 'unknown', '', '<script>']) {
  await assert.rejects(backend.requestEnrollment(courseId), /Formation inconnue/);
  await assert.rejects(backend.getLessons(courseId), /Formation inconnue/);
}
const originalFetch = globalThis.fetch;
try {
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ configured: false, config: null }) });
  assert.equal(await backend.backendReady(), false);
  await assert.rejects(backend.login('student@example.test', 'unused'), /activation/);
  console.log('PASS: unknown courses rejected; disabled backend blocks authentication.');
} finally { globalThis.fetch = originalFetch; }

const { default: videoHandler } = await import(pathToFileURL(path.join(root, 'api/video.js')));
async function videoCall(method, body, authorization) {
  const result = { headers: {}, statusCode: 200 };
  await videoHandler({method,body,headers:{authorization}}, {
    setHeader(name,value) { result.headers[name.toLowerCase()] = value; },
    status(code) { result.statusCode = code; return this; },
    json(body) { result.body = body; return this; }
  });
  return result;
}
const oldPrivateKey = process.env.FIREBASE_PRIVATE_KEY;
const oldClientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const oldVideoSecret = process.env.VIDEO_TOKEN_SECRET;
try {
  delete process.env.FIREBASE_PRIVATE_KEY;
  delete process.env.FIREBASE_CLIENT_EMAIL;
  assert.equal((await videoCall('POST', {})).statusCode, 503);
  assert.equal((await videoCall('GET', {})).statusCode, 405);
  process.env.FIREBASE_PRIVATE_KEY = 'fake-test-key-never-used';
  process.env.FIREBASE_CLIENT_EMAIL = 'fake@example.test';
  process.env.VIDEO_TOKEN_SECRET = 'unit-test-secret-value-at-least-32-characters';
  assert.equal((await videoCall('POST', {})).statusCode, 401);
  for (const body of [{courseId:'../admin',lessonId:'valid'}, {courseId:'chantilly',lessonId:'../secret'}, {courseId:'chantilly',lessonId:123}, {}, null]) {
    assert.equal((await videoCall('POST', body, 'Bearer test')).statusCode, 400);
  }
  console.log('PASS: video endpoint rejects unavailable setup, unsupported methods, missing auth, unknown course and unsafe lesson identifiers.');
} finally {
  oldPrivateKey === undefined ? delete process.env.FIREBASE_PRIVATE_KEY : process.env.FIREBASE_PRIVATE_KEY = oldPrivateKey;
  oldClientEmail === undefined ? delete process.env.FIREBASE_CLIENT_EMAIL : process.env.FIREBASE_CLIENT_EMAIL = oldClientEmail;
  oldVideoSecret === undefined ? delete process.env.VIDEO_TOKEN_SECRET : process.env.VIDEO_TOKEN_SECRET = oldVideoSecret;
}

const {signPlayback,verifyPlayback,safeAsset,rewriteManifest,authorizePlayback} = await import(pathToFileURL(path.join(root,'server/video-access.js')));
try {
  process.env.VIDEO_TOKEN_SECRET = 'unit-test-secret-value-at-least-32-characters';
  const now = Date.now();
  const payload = {uid:'student',courseId:'chantilly',lessonId:'genoise',path:'courses/chantilly/videos/master.m3u8',iat:now,exp:now+60_000};
  const token = signPlayback(payload);
  assert.deepEqual(verifyPlayback(token),payload);
  assert.throws(()=>verifyPlayback(`${token}x`),/Jeton invalide/);
  assert.throws(()=>verifyPlayback(signPlayback({...payload,exp:now-1})),/expirée/);
  for(const asset of ['../secret.mp4','/private.ts','https://example.test/x.ts','a//b.ts','x/./b.ts','x%2fb.ts','x.js','']) assert.equal(safeAsset(asset),false,asset);
  assert.equal(safeAsset('quality-720/segment_001.ts'),true);
  const manifest = rewriteManifest('#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key.key"\nsegment.ts\n','quality/index.m3u8',token);
  assert.ok(manifest.includes('asset=quality%2Fkey.key'));
  assert.ok(manifest.includes('asset=quality%2Fsegment.ts'));
  assert.throws(()=>rewriteManifest('#EXTM3U\nhttps://example.test/a.ts','index.m3u8',token),/non autorisé/);
  const services = (user,status,path=payload.path) => ({auth:{getUser:async()=>user},db:{doc:id=>({get:async()=>({data:()=>id.startsWith('enrollments/')?{status}:{videoPath:path}})})}});
  await authorizePlayback(services({disabled:false},'approved'),payload);
  await assert.rejects(authorizePlayback(services({disabled:true},'approved'),payload),/suspendu/);
  await assert.rejects(authorizePlayback(services({disabled:false},'suspended'),payload),/suspendu/);
  await assert.rejects(authorizePlayback(services({disabled:false,tokensValidAfterTime:new Date(now+1000).toISOString()},'approved'),payload),/suspendu/);
  await assert.rejects(authorizePlayback(services({disabled:false},'approved','courses/chantilly/changed.m3u8'),payload),/suspendu/);
  console.log('PASS: playback signature, expiry, path restrictions, HLS manifest rewriting, suspension, revocation and lesson-change authorization.');
} finally {
  oldVideoSecret === undefined ? delete process.env.VIDEO_TOKEN_SECRET : process.env.VIDEO_TOKEN_SECRET = oldVideoSecret;
}

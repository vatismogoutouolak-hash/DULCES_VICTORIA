import test from 'node:test';import assert from 'node:assert/strict';
import {planMigration,assetId} from './migration-plan.mjs';import {encode,decode} from './data-codec.mjs';
const now={$type:'timestamp',seconds:123,nanoseconds:456};
test('migration preserves approval and never grants pending/suspended requests',()=>{
 const statuses=['approved','pending','rejected','suspended'];
 const backup={projectId:'demo',authUsers:statuses.map((_,i)=>({uid:`u${i}`})),documents:statuses.map((status,i)=>({path:`enrollments/u${i}_chantilly`,data:{uid:`u${i}`,courseId:'chantilly',status,createdAt:now},updateTime:now}))};
 const plan=planMigration(backup,now),enrollments=plan.writes.filter(w=>w.path.startsWith('enrollments/'));
 assert.deepEqual(enrollments.map(w=>w.data.status),['active','revoked','revoked','revoked']);
 assert.equal(enrollments[0].data.userId,'u0');assert.equal(plan.warnings.length,1);
 assert.ok(plan.writes.filter(w=>w.path.startsWith('courses/')).every(w=>w.data.status==='hidden'&&w.data.price===null));
});
test('existing current schema remains untouched and lesson mapping is deterministic',()=>{
 const data={projectId:'demo',authUsers:[],documents:[{path:'courses/chantilly',data:{status:'published'}},{path:'enrollments/u_chantilly',data:{userId:'u',status:'active'}},{path:'courses/chantilly/lessons/l1',data:{title:'Génoise',order:1,videoPath:'courses/chantilly/file.mp4'},updateTime:now}]};
 const p=planMigration(data,now);assert.equal(p.writes.some(w=>w.path==='courses/chantilly'),false);assert.equal(p.writes.some(w=>w.path.startsWith('enrollments/')),false);
 assert.match(p.videoMappings[0].videoAssetId,/^[a-zA-Z0-9_-]+$/);assert.equal(p.videoMappings[0].videoAssetId,assetId('chantilly','l1','courses/chantilly/file.mp4'));
 assert.equal(p.writes.find(w=>w.path.endsWith('/l1')).expectedUpdateTime,now);
});
test('typed timestamp/bytes values survive backup encoding',()=>{
 class Timestamp{constructor(seconds,nanoseconds){Object.assign(this,{seconds,nanoseconds});}toMillis(){return this.seconds*1000;}}
 class GeoPoint{constructor(latitude,longitude){Object.assign(this,{latitude,longitude});}}
 const raw={at:new Timestamp(123,456),bytes:Buffer.from([1,2]),point:new GeoPoint(1,2)};
 const round=decode(encode(raw),{Timestamp,GeoPoint,db:{doc:path=>({path})}});
 assert.equal(round.at.nanoseconds,456);assert.deepEqual(round.bytes,raw.bytes);assert.equal(round.point.longitude,2);
 const unusual=decode(encode({number:Infinity,map:{$type:'timestamp',seconds:'ordinary-user-map'}}),{Timestamp,GeoPoint,db:{}});
 assert.equal(unusual.number,Infinity);assert.equal(unusual.map.seconds,'ordinary-user-map');
});

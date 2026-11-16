import {test,after,before} from 'node:test';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,updateDoc,serverTimestamp} from 'firebase/firestore';
let env;
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-dulces',firestore:{rules:await readFile(new URL('../../firestore.rules',import.meta.url),'utf8')}}); await env.withSecurityRulesDisabled(async c=>{const db=c.firestore();for(const uid of ['alice','bob','admin'])await setDoc(doc(db,'users',uid),{name:uid,email:uid+'@example.com',telephone:'123',country:'CM',role:'student',status:'active',createdAt:new Date(),updatedAt:new Date()});await setDoc(doc(db,'admins/admin'),{active:true});await setDoc(doc(db,'courses/cake'),{status:'published'});await setDoc(doc(db,'courses/secret'),{status:'hidden'});await setDoc(doc(db,'courses/cake/lessons/one'),{videoAssetId:'cake1'});await setDoc(doc(db,'enrollments/alice_cake'),{userId:'alice',courseId:'cake',status:'active'});});});
after(async()=>env?.cleanup());
const db=uid=>env.authenticatedContext(uid,{email:uid+'@example.com'}).firestore();
test('public catalogue excludes hidden documents',async()=>{const d=env.unauthenticatedContext().firestore();await assertSucceeds(getDoc(doc(d,'courses/cake')));await assertFails(getDoc(doc(d,'courses/secret')));});
test('private profiles and administrator membership protected',async()=>{await assertFails(getDoc(doc(db('bob'),'users/alice')));await assertFails(setDoc(doc(db('bob'),'admins/bob'),{}));await assertFails(updateDoc(doc(db('bob'),'users/bob'),{role:'admin',updatedAt:serverTimestamp()}));});
test('enrollment grants lesson access; other users denied',async()=>{await assertSucceeds(getDoc(doc(db('alice'),'courses/cake/lessons/one')));await assertFails(getDoc(doc(db('bob'),'courses/cake/lessons/one')));await assertFails(setDoc(doc(db('bob'),'enrollments/bob_cake'),{userId:'bob',courseId:'cake',status:'active'}));});
test('profile update validates bounded schema',async()=>{await assertSucceeds(updateDoc(doc(db('bob'),'users/bob'),{name:'Bob',updatedAt:serverTimestamp()}));await assertFails(updateDoc(doc(db('bob'),'users/bob'),{name:'x'.repeat(121),updatedAt:serverTimestamp()}));await assertFails(updateDoc(doc(db('bob'),'users/bob'),{extra:'x',updatedAt:serverTimestamp()}));});
test('suspension immediately prevents enrolled access and self-reactivation',async()=>{await env.withSecurityRulesDisabled(c=>updateDoc(doc(c.firestore(),'users/alice'),{status:'suspended'}));await assertFails(getDoc(doc(db('alice'),'courses/cake/lessons/one')));await assertFails(updateDoc(doc(db('alice'),'users/alice'),{status:'active',updatedAt:serverTimestamp()}));});
test('signup validates identity, role and status',async()=>{
 const profile={name:'New student',email:'new@example.com',telephone:'123',country:'CM',role:'student',status:'active',createdAt:serverTimestamp(),updatedAt:serverTimestamp()};
 const d=db('new');
 await assertFails(setDoc(doc(d,'users/new'),{...profile,role:'admin'}));
 await assertFails(setDoc(doc(d,'users/new'),{...profile,status:'suspended'}));
 await assertFails(setDoc(doc(d,'users/new'),{...profile,email:'alice@example.com'}));
 await assertFails(setDoc(doc(d,'users/another'),profile));
 await assertSucceeds(setDoc(doc(d,'users/new'),profile));
});
test('administrator complete course, lesson, enrollment and suspension workflow',async()=>{
 const d=db('admin');
 const course={title:'Tarte',description:'Cours de tarte',category:'Tartes',level:'Débutant',duration:'2 heures',price:null,image:'',status:'hidden',createdAt:serverTimestamp(),updatedAt:serverTimestamp()};
 await assertSucceeds(setDoc(doc(d,'courses/tarte'),course));
 await assertSucceeds(updateDoc(doc(d,'courses/tarte'),{status:'published',updatedAt:serverTimestamp()}));
 await assertFails(updateDoc(doc(d,'courses/tarte'),{price:-1,updatedAt:serverTimestamp()}));
 const lesson={title:'Pâte',module:'Module 1',order:1,duration:'15 minutes',videoAssetId:'tarte_pate',createdAt:serverTimestamp(),updatedAt:serverTimestamp()};
 await assertSucceeds(setDoc(doc(d,'courses/tarte/lessons/pate'),lesson));
 await assertSucceeds(updateDoc(doc(d,'courses/tarte/lessons/pate'),{title:'Pâte sablée',updatedAt:serverTimestamp()}));
 await assertFails(updateDoc(doc(d,'courses/tarte/lessons/pate'),{videoAssetId:'../secret',updatedAt:serverTimestamp()}));
 const enrollment={userId:'bob',courseId:'tarte',status:'active',createdAt:serverTimestamp(),updatedAt:serverTimestamp()};
 await assertSucceeds(setDoc(doc(d,'enrollments/bob_tarte'),enrollment));
 await assertSucceeds(getDoc(doc(db('bob'),'courses/tarte/lessons/pate')));
 await assertSucceeds(updateDoc(doc(d,'enrollments/bob_tarte'),{status:'revoked',updatedAt:serverTimestamp()}));
 await assertFails(getDoc(doc(db('bob'),'courses/tarte/lessons/pate')));
 await assertSucceeds(updateDoc(doc(d,'users/bob'),{status:'suspended',updatedAt:serverTimestamp()}));
 await assertFails(updateDoc(doc(db('bob'),'users/bob'),{status:'active',updatedAt:serverTimestamp()}));
 await assertSucceeds(updateDoc(doc(d,'users/bob'),{status:'active',updatedAt:serverTimestamp()}));
});
test('student queries scoped own active enrollments; cross-user lists denied',async()=>{
 const {collection,query,where,getDocs}=await import('firebase/firestore');
 const d=db('bob');
 await assertSucceeds(getDocs(query(collection(d,'enrollments'),where('userId','==','bob'),where('status','==','active'))));
 await assertFails(getDocs(collection(d,'enrollments')));
 await assertFails(getDocs(query(collection(d,'enrollments'),where('userId','==','alice'))));
});

const cmsValue = uid => ({
 pages: {home: '{}', student: '{}', admin: '{}'},
 theme: {cocoa: '#38231e', terra: '#b86f4d'},
 updatedBy: uid, updatedAt: serverTimestamp()
});
test('only active administrators write CMS drafts and published content',async()=>{
 const d=db('admin');
 for(const id of ['draft','published']) {
  await assertFails(setDoc(doc(env.unauthenticatedContext().firestore(),'siteContent',id),cmsValue('admin')));
  await assertFails(setDoc(doc(db('bob'),'siteContent',id),cmsValue('bob')));
  await assertSucceeds(setDoc(doc(d,'siteContent',id),cmsValue('admin')));
 }
 await assertFails(setDoc(doc(d,'siteContent/private'),cmsValue('admin')));
 await env.withSecurityRulesDisabled(async c=>{
  await setDoc(doc(c.firestore(),'users/suspended-admin'),{status:'suspended'});
  await setDoc(doc(c.firestore(),'admins/suspended-admin'),{source:'test'});
 });
 await assertFails(setDoc(doc(db('suspended-admin'),'siteContent/draft'),cmsValue('suspended-admin')));
});
test('published CMS is public while drafts and collection queries stay private',async()=>{
 const {collection,getDocs}=await import('firebase/firestore');
 const d=db('admin'), anonymous=env.unauthenticatedContext().firestore();
 await assertSucceeds(setDoc(doc(d,'siteContent/published'),cmsValue('admin')));
 await assertSucceeds(setDoc(doc(d,'siteContent/draft'),cmsValue('admin')));
 await assertSucceeds(getDoc(doc(anonymous,'siteContent/published')));
 await assertFails(getDoc(doc(anonymous,'siteContent/draft')));
 await assertFails(getDoc(doc(db('bob'),'siteContent/draft')));
 await assertSucceeds(getDoc(doc(d,'siteContent/draft')));
 await assertFails(getDocs(collection(anonymous,'siteContent')));
 await assertFails(getDocs(collection(db('bob'),'siteContent')));
});
test('CMS create and update enforce bounded schema, colors and editor identity',async()=>{
 const d=db('admin'), value=cmsValue('admin');
 const invalid=[
  {...value,updatedBy:'bob'},
  {...value,updatedAt:new Date(0)},
  {...value,extra:'unrecognized'},
  {...value,pages:{home:'{}',student:'{}'}},
  {...value,pages:{...value.pages,private:'{}'}},
  {...value,pages:{...value.pages,home:25}},
  {...value,pages:{...value.pages,home:'x'.repeat(250001)}},
  {...value,theme:{cocoa:'url(javascript:alert(1))'}},
  {...value,theme:{...value.theme,arbitrary:'red'}},
 ];
 for(const bad of invalid) await assertFails(setDoc(doc(d,'siteContent/draft'),bad));
 await assertSucceeds(setDoc(doc(d,'siteContent/draft'),value));
 for(const bad of invalid) await assertFails(updateDoc(doc(d,'siteContent/draft'),bad));
 await assertSucceeds(updateDoc(doc(d,'siteContent/draft'),{pages:{home:'{"title":"Nouveau titre"}',student:'{}',admin:'{}'},updatedBy:'admin',updatedAt:serverTimestamp()}));
});

const VERSION = '12.6.0';
let setup;
const allowedCourses = ['chantilly', 'creme-au-beurre', 'gateaux-en-pot'];
export async function backendReady() {
  if (!setup) setup = (async () => {
    try {
      const response = await fetch('/api/config', { cache: 'no-store' });
      if (!response.ok) return null;
      const result = await response.json();
      if (!result.configured) return null;
      const [app, auth, db, storage] = await Promise.all(['firebase-app', 'firebase-auth', 'firebase-firestore', 'firebase-storage'].map(name => import(`https://www.gstatic.com/firebasejs/${VERSION}/${name}.js`)));
      const instance = app.initializeApp(result.config);
      return { auth, db, storage, a: auth.getAuth(instance), d: db.getFirestore(instance), s: storage.getStorage(instance) };
    } catch { return null; }
  })();
  return !!(await setup);
}
async function services() {
  if (!(await backendReady())) throw new Error('Les inscriptions seront ouvertes après activation de l’espace formation.');
  return setup;
}
async function current() {
  const s = await services();
  await s.a.authStateReady();
  if (!s.a.currentUser) throw new Error('Connectez-vous pour continuer.');
  return { ...s, user: s.a.currentUser };
}
function courseCheck(id) { if (!allowedCourses.includes(id)) throw new Error('Formation inconnue.'); }
export async function watchAuth(callback) {
  if (!(await backendReady())) { callback(null, { isAdmin: false }); return () => {}; }
  const s = await setup;
  return s.auth.onAuthStateChanged(s.a, async user => {
    let admin = false;
    if (user) admin = (await user.getIdTokenResult()).claims.admin === true;
    callback(user, { isAdmin: admin });
  });
}
export async function signup(name, email, password) {
  if (!name?.trim() || name.trim().length > 100) throw new Error('Saisissez votre nom (100 caractères maximum).');
  const s = await services();
  const credential = await s.auth.createUserWithEmailAndPassword(s.a, email, password);
  await s.auth.updateProfile(credential.user, { displayName: name.trim() });
  await s.auth.sendEmailVerification(credential.user);
  return credential.user;
}
export async function login(email, password) { const s = await services(); return s.auth.signInWithEmailAndPassword(s.a, email, password); }
export async function loginGoogle() { const s = await services(); return s.auth.signInWithPopup(s.a, new s.auth.GoogleAuthProvider()); }
export async function logout() { const s = await services(); return s.auth.signOut(s.a); }
export async function resetPassword(email) { const s = await services(); return s.auth.sendPasswordResetEmail(s.a, email); }
export async function requestEnrollment(courseId) {
  courseCheck(courseId);
  const s = await current();
  const ref = s.db.doc(s.d, 'enrollments', `${s.user.uid}_${courseId}`);
  const existing = await s.db.getDoc(ref);
  if (existing.exists()) return existing.data();
  const value = { uid: s.user.uid, courseId, status: 'pending', displayName: (s.user.displayName || '').slice(0,100), email: s.user.email || '', createdAt: s.db.serverTimestamp(), updatedAt: s.db.serverTimestamp() };
  await s.db.setDoc(ref, value);
  return value;
}
export async function getStudentData() {
  const s = await current();
  const [enrollments, progress] = await Promise.all([
    s.db.getDocs(s.db.query(s.db.collection(s.d, 'enrollments'), s.db.where('uid', '==', s.user.uid))),
    s.db.getDocs(s.db.collection(s.d, 'users', s.user.uid, 'progress'))
  ]);
  const result = {};
  progress.forEach(d => { const p = d.data(); if (p.completed) (result[p.courseId] ||= []).push(p.lessonId); });
  return { enrollments: enrollments.docs.map(d => ({id:d.id,...d.data()})), progress:result };
}
export async function getLessons(courseId) {
  courseCheck(courseId); const s = await current();
  const docs = await s.db.getDocs(s.db.collection(s.d, 'courses', courseId, 'lessons'));
  return docs.docs.map(d => ({id:d.id,...d.data()})).sort((a,b)=>a.order-b.order);
}
export async function saveProgress(courseId, lessonId, completed) {
  courseCheck(courseId); const s = await current();
  await s.db.setDoc(s.db.doc(s.d, 'users', s.user.uid, 'progress', `${courseId}_${lessonId}`), {courseId,lessonId,completed:!!completed,updatedAt:s.db.serverTimestamp()});
}
export async function getLessonVideo(courseId, lessonId) {
  courseCheck(courseId); const s = await current();
  const response = await fetch('/api/video', {method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${await s.user.getIdToken()}`},body:JSON.stringify({courseId,lessonId})});
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Vidéo indisponible.');
  return result;
}

async function adminServices() { const s = await current(); if ((await s.user.getIdTokenResult()).claims.admin !== true) throw new Error('Accès administrateur requis.'); return s; }
export async function adminGetData() {
  const s = await adminServices();
  const docs = await s.db.getDocs(s.db.collection(s.d, 'enrollments'));
  return { enrollments:docs.docs.map(d=>({id:d.id,...d.data()})), courses:allowedCourses.map(id=>({id})) };
}
export async function adminUpdateEnrollment(id, status) {
  if (!['approved','rejected','pending','suspended'].includes(status)) throw new Error('Statut invalide.');
  const s = await adminServices();
  await s.db.updateDoc(s.db.doc(s.d,'enrollments',id), {status,updatedAt:s.db.serverTimestamp()});
}
export async function adminSaveLesson(courseId, lesson) {
  courseCheck(courseId); const s = await adminServices();
  if (!/^[a-z0-9-]{1,80}$/.test(lesson.id) || !lesson.title?.trim() || lesson.title.length > 160 || !Number.isInteger(Number(lesson.order)) || Number(lesson.order)<0 || Number(lesson.order)>999 || !lesson.videoPath?.startsWith(`courses/${courseId}/`) || lesson.videoPath.length>500 || lesson.videoPath.includes('..')) throw new Error('Vérifiez les informations de la leçon et le chemin vidéo.');
  await s.db.setDoc(s.db.doc(s.d,'courses',courseId,'lessons',lesson.id), {title:lesson.title.trim(),order:Number(lesson.order),videoPath:lesson.videoPath,updatedAt:s.db.serverTimestamp()});
}

import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { createVideoApp } from './app.js';

const { FIREBASE_PROJECT_ID: projectId, VIDEO_SIGNING_SECRET: secret, VIDEO_ROOT: root, APP_ORIGIN: origin } = process.env;
if (!projectId || !root || !origin || process.env.FIREBASE_AUTH_EMULATOR_HOST || process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('Production Firebase/video settings are missing or point to an emulator');
}
if (!origin.startsWith('https://') || new URL(origin).origin !== origin) throw new Error('APP_ORIGIN must be an HTTPS origin');
initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();
const app = createVideoApp({
  auth: getAuth(), secret, root, origin,
  ttlSeconds: Number(process.env.GRANT_TTL_SECONDS || 300),
  maxSessions: Number(process.env.MAX_SESSIONS || 500),
  loadAccess: async (uid, courseId, lessonId) => {
    const refs = [db.doc(`users/${uid}`), db.doc(`enrollments/${uid}_${courseId}`), db.doc(`courses/${courseId}`), db.doc(`courses/${courseId}/lessons/${lessonId}`)];
    const [user, enrollment, course, lesson] = await db.getAll(...refs);
    return { user: user.data(), enrollment: enrollment.data(), course: course.data(), lesson: lesson.data() };
  }
});
const server = app.listen(Number(process.env.PORT || 8081), process.env.HOST || '127.0.0.1', () => console.info('Private video service ready'));
process.on('SIGTERM', () => server.close(() => process.exit(0)));

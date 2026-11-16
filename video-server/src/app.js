import express from 'express';
import { readFile } from 'node:fs/promises';
import { HttpError, validId, randomId, signGrant, verifyGrant, cookieValue, resolvePrivateFile, rewriteManifest, assertAccess } from './security.js';

const COOKIE = '__Secure-dv-playback';

// Dependencies are injectable so authorization failures can be tested without
// production credentials. No development bypass exists in the production entrypoint.
export function createVideoApp({ auth, loadAccess, secret, root, origin, ttlSeconds = 300, maxSessions = 500, secure = true, now = Date.now }) {
  if (!secret || secret.length < 64 || !origin || !root || !Number.isInteger(ttlSeconds) || ttlSeconds < 30 || ttlSeconds > 900 ||
      !Number.isInteger(maxSessions) || maxSessions < 1 || maxSessions > 10000) {
    throw new Error('Invalid private-video configuration');
  }
  const app = express();
  const sessions = new Map();
  const attempts = new Map();
  app.disable('x-powered-by');
  // Only a local reverse proxy may supply the client IP. Nginx must overwrite,
  // rather than append, X-Forwarded-For as in the supplied configuration.
  app.set('trust proxy', 'loopback');
  app.use((req, res, next) => {
    res.set({ 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cross-Origin-Resource-Policy': 'same-origin' });
    next();
  });
  app.use(express.json({ limit: '2kb', strict: true }));
  const purge = () => {
    const time = now();
    for (const [sid, session] of sessions) if (session.exp <= time) sessions.delete(sid);
    for (const [key, attempt] of attempts) if (attempt.reset <= time) attempts.delete(key);
  };
  const limiter = (key, max) => {
    purge();
    const current = attempts.get(key) || { count: 0, reset: now() + 60000 };
    if (++current.count > max) throw new HttpError(429, 'too_many_requests');
    // Bound memory under unauthenticated traffic as well as normal usage.
    if (!attempts.has(key) && attempts.size >= 10000) throw new HttpError(429, 'too_many_requests');
    attempts.set(key, current);
  };
  async function verifyIdentity(token) {
    try { return await auth.verifyIdToken(token, true); }
    catch { throw new HttpError(401, 'authentication_required'); }
  }
  app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));
  app.post('/api/video/playback', async (req, res) => {
    if (req.get('origin') !== origin) throw new HttpError(403, 'invalid_origin');
    limiter(`issue-ip:${req.ip}`, 30);
    const match = /^Bearer ([A-Za-z0-9._-]+)$/.exec(req.get('authorization') || '');
    if (!match) throw new HttpError(401, 'authentication_required');
    const { courseId, lessonId } = req.body || {};
    if (!validId(courseId) || !validId(lessonId)) throw new HttpError(400, 'invalid_request');
    const token = match[1];
    const claims = await verifyIdentity(token);
    limiter(`issue-user:${claims.uid}`, 15);
    const assetId = assertAccess(await loadAccess(claims.uid, courseId, lessonId), claims.uid, courseId, now());
    // Fail before granting access if the lesson has not actually been provisioned.
    await resolvePrivateFile(root, assetId, 'index.m3u8');
    const exp = Math.min(now() + ttlSeconds * 1000, claims.exp * 1000);
    if (exp <= now()) throw new HttpError(401, 'authentication_required');
    purge();
    for (const [sid, session] of sessions) if (session.uid === claims.uid) sessions.delete(sid);
    if (sessions.size >= maxSessions) throw new HttpError(503, 'temporarily_unavailable');
    const sid = randomId();
    const grant = signGrant({ sid, uid: claims.uid, courseId, lessonId, assetId, exp }, secret);
    sessions.set(sid, { uid: claims.uid, token, exp });
    res.cookie(COOKIE, sid, { httpOnly: true, secure, sameSite: 'strict', path: '/api/video', maxAge: exp - now() });
    res.json({ url: `/api/video/hls/${grant}/index.m3u8`, expiresAt: exp });
  });
  app.delete('/api/video/playback', (req, res) => {
    if (req.get('origin') !== origin) throw new HttpError(403, 'invalid_origin');
    const sid = cookieValue(req.get('cookie'), COOKIE);
    if (sid) sessions.delete(sid);
    res.clearCookie(COOKIE, { httpOnly: true, secure, sameSite: 'strict', path: '/api/video' });
    res.status(204).end();
  });
  app.get(/^\/api\/video\/hls\/([^/]+)\/(.+)$/, async (req, res) => {
    const [grant, file] = [req.params[0], req.params[1]];
    const claims = verifyGrant(grant, secret, now());
    const sid = cookieValue(req.get('cookie'), COOKIE);
    const session = sid && sessions.get(sid);
    if (sid !== claims.sid || !session || session.uid !== claims.uid || session.exp <= now()) throw new HttpError(401, 'authentication_required');
    limiter(`hls:${claims.uid}`, 240);
    await verifyIdentity(session.token);
    const assetId = assertAccess(await loadAccess(claims.uid, claims.courseId, claims.lessonId), claims.uid, claims.courseId, now());
    if (assetId !== claims.assetId) throw new HttpError(403, 'access_denied');
    const resolved = await resolvePrivateFile(root, assetId, file);
    if (file.endsWith('.m3u8')) {
      const manifest = await readFile(resolved, 'utf8');
      res.type('application/vnd.apple.mpegurl').send(rewriteManifest(manifest, file, `/api/video/hls/${grant}/`));
    } else {
      res.type(file.endsWith('.ts') ? 'video/mp2t' : file.endsWith('.vtt') ? 'text/vtt' : 'application/octet-stream');
      res.sendFile(resolved, { acceptRanges: false, cacheControl: false, lastModified: false, dotfiles: 'deny' });
    }
  });
  app.use((_req, _res, next) => next(new HttpError(404, 'not_found')));
  app.use((error, _req, res, _next) => {
    // Never log authorization headers, playback URLs, tokens, cookies or SDK errors.
    const status = error instanceof HttpError ? error.status : error.type === 'entity.parse.failed' ? 400 : error.type === 'entity.too.large' ? 413 : 503;
    if (res.headersSent) { res.end(); return; }
    res.status(status).json({ error: error instanceof HttpError ? error.code : status === 400 || status === 413 ? 'invalid_request' : 'temporarily_unavailable' });
  });
  return app;
}

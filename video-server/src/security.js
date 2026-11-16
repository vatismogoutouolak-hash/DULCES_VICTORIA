import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { realpath } from 'node:fs/promises';

export class HttpError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}

export const validId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
export const randomId = () => randomBytes(32).toString('base64url');

export function signGrant(claims, secret) {
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`;
}

export function verifyGrant(value, secret, now = Date.now()) {
  if (typeof value !== 'string' || value.length > 2400) throw new HttpError(401, 'invalid_playback');
  const parts = value.split('.');
  if (parts.length !== 2 || !parts.every(p => /^[A-Za-z0-9_-]+$/.test(p))) throw new HttpError(401, 'invalid_playback');
  const expected = createHmac('sha256', secret).update(parts[0]).digest();
  const supplied = Buffer.from(parts[1], 'base64url');
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) throw new HttpError(401, 'invalid_playback');
  let claims;
  try { claims = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')); }
  catch { throw new HttpError(401, 'invalid_playback'); }
  if (!claims || !validId(claims.courseId) || !validId(claims.lessonId) || !validId(claims.assetId) ||
      typeof claims.uid !== 'string' || typeof claims.sid !== 'string' || !Number.isSafeInteger(claims.exp) || claims.exp <= now) {
    throw new HttpError(401, 'expired_playback');
  }
  return claims;
}

export function cookieValue(header, name) {
  if (!header) return null;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (part.slice(0, separator).trim() === name) return part.slice(separator + 1).trim();
  }
  return null;
}

function validateRelativeFile(file) {
  if (typeof file !== 'string' || file.length > 512 || !/^[A-Za-z0-9_./-]+$/.test(file) ||
      file.startsWith('/') || file.split('/').some(s => !s || s === '.' || s === '..') ||
      !/\.(m3u8|ts|key|vtt)$/.test(file)) throw new HttpError(404, 'video_not_found');
}

export async function resolvePrivateFile(root, assetId, file) {
  if (!validId(assetId)) throw new HttpError(404, 'video_not_found');
  validateRelativeFile(file);
  try {
    const canonicalRoot = await realpath(root);
    const canonicalAsset = await realpath(path.join(canonicalRoot, assetId));
    if (!canonicalAsset.startsWith(canonicalRoot + path.sep)) throw new HttpError(404, 'video_not_found');
    const canonicalFile = await realpath(path.join(canonicalAsset, file));
    if (!canonicalFile.startsWith(canonicalAsset + path.sep)) throw new HttpError(404, 'video_not_found');
    return canonicalFile;
  } catch { throw new HttpError(404, 'video_not_found'); }
}

// All manifest references remain behind the same authorization endpoint. External
// resources, parent traversal and unknown containers fail closed.
export function rewriteManifest(source, currentFile, prefix) {
  if (source.length > 1024 * 1024 || !source.startsWith('#EXTM3U')) throw new HttpError(422, 'invalid_manifest');
  const rewrite = ref => {
    if (!/^[A-Za-z0-9_./-]+$/.test(ref) || ref.startsWith('/') || ref.split('/').some(s => !s || s === '..' || s === '.')) {
      throw new HttpError(422, 'invalid_manifest');
    }
    const relative = path.posix.join(path.posix.dirname(currentFile), ref);
    validateRelativeFile(relative);
    return prefix + relative.split('/').map(encodeURIComponent).join('/');
  };
  return source.split(/\r?\n/).map(line => {
    if (!line || /^\s+$/.test(line)) return '';
    if (!line.startsWith('#')) return rewrite(line.trim());
    // ffmpeg manifests use quoted URI attributes. Reject unquoted URI syntax.
    if (/URI\s*=/.test(line) && !/URI="[^"]+"/.test(line)) throw new HttpError(422, 'invalid_manifest');
    return line.replace(/URI="([^"]+)"/g, (_match, ref) => `URI="${rewrite(ref)}"`);
  }).join('\n');
}

export function assertAccess({ user, enrollment, course, lesson }, uid, courseId, now = Date.now()) {
  if (!user || user.status !== 'active' || !enrollment || enrollment.status !== 'active' ||
      enrollment.userId !== uid || enrollment.courseId !== courseId ||
      !course || course.status !== 'published' || !lesson || !validId(lesson.videoAssetId)) {
    throw new HttpError(403, 'access_denied');
  }
  if (enrollment.expiresAt) {
    const expiry = typeof enrollment.expiresAt.toMillis === 'function' ? enrollment.expiresAt.toMillis() : NaN;
    if (!Number.isFinite(expiry) || expiry <= now) throw new HttpError(403, 'access_denied');
  }
  return lesson.videoAssetId;
}

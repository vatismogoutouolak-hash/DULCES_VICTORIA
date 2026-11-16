import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { validId, signGrant, verifyGrant, resolvePrivateFile, rewriteManifest, assertAccess } from '../src/security.js';

const secret = 'a'.repeat(64);
const claims = { uid: 'student', sid: 'session', courseId: 'cake', lessonId: 'base', assetId: 'cake-base', exp: 2000 };
const access = () => ({ user: { status: 'active' }, enrollment: { userId: 'student', courseId: 'cake', status: 'active' }, course: { status: 'published' }, lesson: { videoAssetId: 'cake-base' } });

test('resource identifiers align with the 128-character metadata limit', () => {
  assert.equal(validId('a'.repeat(128)), true);
  assert.equal(validId('a'.repeat(129)), false);
  assert.equal(validId('../asset'), false);
});

test('a valid grant cannot be tampered with, used after expiry or signed by another server', () => {
  const token = signGrant(claims, secret);
  assert.deepEqual(verifyGrant(token, secret, 1000), claims);
  assert.throws(() => verifyGrant(token, secret, 2000), /expired/);
  assert.throws(() => verifyGrant(token, 'b'.repeat(64), 1000), /invalid/);
  const altered = Buffer.from(JSON.stringify({ ...claims, uid: 'attacker' })).toString('base64url') + '.' + token.split('.')[1];
  assert.throws(() => verifyGrant(altered, secret, 1000), /invalid/);
});

test('access requires matching enrollment, active user, published course and unexpired access', () => {
  assert.equal(assertAccess(access(), 'student', 'cake', 1000), 'cake-base');
  for (const mutate of [
    x => { x.user.status = 'suspended'; },
    x => { x.enrollment.status = 'revoked'; },
    x => { x.enrollment.userId = 'other'; },
    x => { x.enrollment.courseId = 'other'; },
    x => { x.course.status = 'draft'; },
    x => { x.enrollment.expiresAt = { toMillis: () => 999 }; },
    x => { x.enrollment.expiresAt = 'invalid'; },
    x => { x.lesson.videoAssetId = '../secret'; }
  ]) {
    const sample = access(); mutate(sample);
    assert.throws(() => assertAccess(sample, 'student', 'cake', 1000), /access_denied/);
  }
});

test('manifests rewrite nested playlists, segment URLs and private keys; remote/traversal references fail closed', () => {
  const manifest = '#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key.key"\n#EXTINF:6,\npart00001.ts\n';
  const rewritten = rewriteManifest(manifest, 'variant/index.m3u8', '/private/');
  assert.match(rewritten, /URI="\/private\/variant\/key.key"/);
  assert.match(rewritten, /\/private\/variant\/part00001.ts/);
  for (const uri of ['https://evil.example/video.ts', '../video.ts', '/video.ts', 'video.mp4', 'video.ts?token=x', '%2e%2e/video.ts']) {
    assert.throws(() => rewriteManifest(`#EXTM3U\n${uri}\n`, 'index.m3u8', '/private/'));
  }
  assert.throws(() => rewriteManifest('#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI=key.key\n', 'index.m3u8', '/private/'));
});

test('private file resolution blocks parent traversal, unsupported originals and symlink escapes', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'dv-private-'));
  try {
    const root = path.join(directory, 'hls');
    await mkdir(path.join(root, 'asset'), { recursive: true });
    await writeFile(path.join(root, 'asset', 'index.m3u8'), '#EXTM3U');
    await writeFile(path.join(directory, 'secret.ts'), 'secret');
    await symlink(path.join(directory, 'secret.ts'), path.join(root, 'asset', 'escape.ts'));
    await symlink(directory, path.join(root, 'outside'));
    assert.equal(await resolvePrivateFile(root, 'asset', 'index.m3u8'), path.join(root, 'asset', 'index.m3u8'));
    for (const [asset, file] of [['asset','../secret.ts'], ['asset','original.mp4'], ['asset','escape.ts'], ['outside','secret.ts'], ['../','secret.ts']]) {
      await assert.rejects(resolvePrivateFile(root, asset, file), /video_not_found/);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

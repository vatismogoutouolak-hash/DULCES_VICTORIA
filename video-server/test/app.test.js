import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createVideoApp } from '../src/app.js';

const origin = 'https://school.example';

async function fixture(run) {
  const root = await mkdtemp(path.join(tmpdir(), 'dv-api-'));
  await mkdir(path.join(root, 'cake-base'));
  await writeFile(path.join(root, 'cake-base', 'index.m3u8'), '#EXTM3U\n#EXTINF:6,\npart00001.ts\n');
  await writeFile(path.join(root, 'cake-base', 'part00001.ts'), 'test segment bytes');
  let state = { suspended: false, revoked: false, tokenRevoked: false, assetChanged: false };
  const app = createVideoApp({ root, origin, secret: 's'.repeat(64), secure: false,
    auth: { verifyIdToken: async (token, checkRevoked) => {
      assert.equal(checkRevoked, true);
      if (token !== 'valid-token' || state.tokenRevoked) throw new Error('invalid');
      return { uid: 'student', exp: Math.floor(Date.now() / 1000) + 3600 };
    } },
    loadAccess: async () => ({ user: { status: state.suspended ? 'suspended' : 'active' },
      enrollment: { userId: 'student', courseId: 'cake', status: state.revoked ? 'revoked' : 'active' },
      course: { status: 'published' }, lesson: { videoAssetId: state.assetChanged ? 'other-asset' : 'cake-base' } })
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const issue = (headers = {}) => fetch(`${base}/api/video/playback`, { method: 'POST', headers: { Origin: origin, Authorization: 'Bearer valid-token', 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ courseId: 'cake', lessonId: 'base' }) });
  try { await run({ base, issue, state }); }
  finally { await new Promise(resolve => server.close(resolve)); await rm(root, { recursive: true, force: true }); }
}

test('grant requires origin and a valid Firebase token', async () => fixture(async ({ issue }) => {
  assert.equal((await issue({ Origin: 'https://attacker.example' })).status, 403);
  assert.equal((await issue({ Authorization: 'Bearer wrong-token' })).status, 401);
}));

test('copied URL is rejected without its cookie; authorized playlist and segment work', async () => fixture(async ({ base, issue }) => {
  const response = await issue(); assert.equal(response.status, 200);
  const cookie = response.headers.get('set-cookie').split(';')[0];
  assert.match(response.headers.get('set-cookie'), /HttpOnly/);
  const { url } = await response.json();
  assert.equal((await fetch(base + url)).status, 401);
  const manifest = await fetch(base + url, { headers: { Cookie: cookie } });
  assert.equal(manifest.status, 200);
  assert.equal(manifest.headers.get('cache-control'), 'private, no-store');
  const segment = (await manifest.text()).split('\n').find(line => line.startsWith('/api/'));
  const video = await fetch(base + segment, { headers: { Cookie: cookie } });
  assert.equal(video.status, 200); assert.equal(await video.text(), 'test segment bytes');
  assert.equal((await fetch(base + '/private-hls/cake-base/part00001.ts')).status, 404);
}));

test('suspension, revoked enrollment, revoked identity and changed assets stop an existing playback', async () => {
  for (const condition of ['suspended', 'revoked', 'tokenRevoked', 'assetChanged']) {
    await fixture(async ({ base, issue, state }) => {
      const response = await issue(); const cookie = response.headers.get('set-cookie').split(';')[0];
      const { url } = await response.json(); state[condition] = true;
      assert.equal((await fetch(base + url, { headers: { Cookie: cookie } })).status, condition === 'tokenRevoked' ? 401 : 403);
    });
  }
});

test('new playback invalidates the earlier session and logout invalidates the current one', async () => fixture(async ({ base, issue }) => {
  const first = await issue(); const firstCookie = first.headers.get('set-cookie').split(';')[0]; const firstData = await first.json();
  const second = await issue(); const secondCookie = second.headers.get('set-cookie').split(';')[0]; const secondData = await second.json();
  assert.equal((await fetch(base + firstData.url, { headers: { Cookie: firstCookie } })).status, 401);
  assert.equal((await fetch(base + secondData.url, { headers: { Cookie: secondCookie } })).status, 200);
  assert.equal((await fetch(base + '/api/video/playback', { method: 'DELETE', headers: { Origin: origin, Cookie: secondCookie } })).status, 204);
  assert.equal((await fetch(base + secondData.url, { headers: { Cookie: secondCookie } })).status, 401);
}));

import test from 'node:test';
import assert from 'node:assert/strict';
import { scanDirectory, ensureReadPermission } from '../docs/library.js';
import { entries, selectTrack, step, setPlaybackOrder } from '../docs/model.js';
const file = name => ({ kind: 'file', name, getFile() { throw new Error('Scanning must not read bytes'); } });
const dir = (name, children) => ({ name, kind: 'directory', async *values() { yield* children; } });
test('MP3の参照だけを再帰取得、空フォルダ・親直下・同名別曲を区別', async () => {
  const library = await scanDirectory(dir('音楽', [file('直下.MP3'), file('text.txt'), dir('歌手A', [file('曲10.mp3'), file('曲2.mp3'), dir('アルバム', [file('曲2.mp3')])]), dir('空', [])]));
  assert.equal(library.members.length, 4);
  assert.equal(new Set(library.members.map(item => item.id)).size, 4);
  assert.ok(library.folders.includes(''));
  assert.ok(library.folders.includes('空'));
  assert.deepEqual(entries(library, '歌手A').map(item => item.name), ['曲2.mp3', '曲10.mp3']);
  assert.equal(entries(library, '歌手A/アルバム').length, 1);
});
test('起動時は権限照会のみ、再許可は読み取り専用', async () => {
  const calls = [], handle = {
    async queryPermission(options) { calls.push(['query', options]); return 'prompt'; },
    async requestPermission(options) { calls.push(['request', options]); return 'granted'; },
  };
  assert.equal(await ensureReadPermission(handle), false);
  assert.equal(await ensureReadPermission(handle, true), true);
  assert.deepEqual(calls, [['query', { mode: 'read' }], ['request', { mode: 'read' }]]);
});
test('権限拒否と走査中の切断を成功として扱わない', async () => {
  assert.equal(await ensureReadPermission({ requestPermission: async () => 'denied' }, true), false);
  await assert.rejects(scanDirectory({ async *values() { throw new DOMException('disconnected', 'NotFoundError'); } }));
});
test('フォルダシャッフルは重複なく1周し、前後で循環、切替は一時停止を保持', () => {
  const library = { folders: ['A', 'B'], members: [1,2,3,4].map(i => ({ id: String(i), name: `${i}.mp3`, folder: i === 4 ? 'B' : 'A' })) };
  const player = { ...selectTrack(library, 'A', '2', 'shuffle', () => 0), playing: false };
  let walked = player; const seen = [];
  for (let i = 0; i < 3; i++) { seen.push(walked.queue[walked.index].id); walked = step(walked, 1); }
  assert.deepEqual(seen.slice().sort(), ['1','2','3']);
  assert.equal(walked.index, player.index);
  assert.equal(step(step(player, -1), 1).index, player.index);
  const ordered = setPlaybackOrder(player, 'ordered');
  assert.equal(ordered.queue[ordered.index].id, '2');
  assert.equal(ordered.playing, false);
});

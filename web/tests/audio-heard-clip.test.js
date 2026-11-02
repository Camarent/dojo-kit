'use strict';
const test = require('node:test');
const assert = require('node:assert');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const BYTES = Buffer.from(Uint8Array.from({ length: 40 }, (_, i) => i + 1));
const MANIFEST = { v: 1, packs: [{ file: 'p0.bin', bytes: 40, enc: 'raw' }], clips: { 'a-1': { pack: 0, off: 4, len: 8, ms: 700, mime: 'audio/wav' } } };
const fetchFn = async (url) => (url.endsWith('manifest.json')
  ? { ok: true, json: async () => MANIFEST }
  : { ok: true, arrayBuffer: async () => BYTES.buffer.slice(BYTES.byteOffset, BYTES.byteOffset + BYTES.length) });
const win = {
  Audio: class { play() { setImmediate(() => this.onended && this.onended()); return Promise.resolve(); } pause() {} },
  Blob: class {},
  URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} }
};

function realAudio() {
  delete require.cache[require.resolve('../audio.js')];
  const A = require('../audio.js');
  A.configure({ win, fetch: fetchFn });
  return A;
}

const h = (type, props, ...kids) => ({ type, props: props || {}, kids: kids.flat() });
const htmMod = (() => { const m = { exports: {} }; vm.runInNewContext(read('vendor/htm.umd.js'), { module: m, exports: m.exports, self: {} }); return m.exports.default || m.exports; })();
const find = (n, id) => { if (!n || typeof n !== 'object') return null; if (n.props['data-testid'] === id) return n; for (const k of n.kids) { const r = find(k, id); if (r) return r; } return null; };

test('real DojoAudio: played clip is heard after mark and the flag button renders', async () => {
  const A = realAudio();
  const sandbox = { preact: { h }, htm: htmMod, console, DojoAudio: A };
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(read('ui/session-feedback.js'), sandbox);
  const mark = A.mark();
  const id = A.pick('st', ['a-1'], () => 0);
  assert.strictEqual(A.heardClip('st', mark), null);
  await A.play(id);
  assert.strictEqual(A.heardClip('st', mark), 'a-1');
  const engine = { flagClip() {}, isClipFlagged: () => false, flaggedClips: () => [] };
  const host = { state: {}, isExam: () => false, setState() {} };
  const s = { cur: { stimulus: { id: 'st' } }, result: { correct: false }, audioMark: mark };
  const btn = sandbox.DojoSessionFeedback.flagButton(host, { t: (k) => k, engine, session: {} }, s);
  assert.ok(find(btn, 'btn-flag-clip'));
});

test('a session object without flagClip (as the app passes it) must not be the flag target', () => {
  const sandbox = { preact: { h }, htm: htmMod, console, DojoAudio: { heardClip: () => 'a-1' } };
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(read('ui/session-feedback.js'), sandbox);
  const host = { state: {}, isExam: () => false, setState() {} };
  const s = { cur: { stimulus: { id: 'st' } }, result: { correct: false }, audioMark: 0 };
  const eng = { flagClip() {}, isClipFlagged: () => false };
  assert.ok(find(sandbox.DojoSessionFeedback.flagButton(host, { t: (k) => k, engine: eng, session: {} }, s), 'btn-flag-clip'));
  assert.strictEqual(sandbox.DojoSessionFeedback.flagButton(host, { t: (k) => k, session: eng }, s), null);
});

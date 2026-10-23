'use strict';
const test = require('node:test');
const assert = require('node:assert');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const sandbox = { preact: { h: (type, props, ...kids) => ({ type, props: props || {}, kids: kids.flat() }) }, console };
sandbox.self = sandbox;
vm.createContext(sandbox);
vm.runInContext(read('ui/clip-text.js'), sandbox);
const CT = sandbox.DojoClipText;
const AudioMod = (() => { const m = { exports: {} }; vm.runInNewContext(read('audio.js'), { module: m, self: {}, console, setTimeout, clearTimeout }); return m.exports; })();

const t = (k) => k;
const text = (n) => (n == null ? '' : typeof n === 'string' ? n : n.kids.map(text).join(''));
const find = (n, id) => { if (!n || typeof n !== 'object') return null; if (n.props['data-testid'] === id) return n; for (const k of n.kids) { const r = find(k, id); if (r) return r; } return null; };
const fake = (meta, heard = 'c1') => ({ heardClip: () => heard, clipMeta: () => meta });
const S = { result: { correct: true }, cur: { stimulus: { id: 'st' } }, audioMark: 0 };

test('correct, wrong and timed-out show text and translation', () => {
  for (const result of [{ correct: true }, { correct: false }, { timedOut: true }]) {
    const n = CT.render({ ...S, result }, t, 'ru', fake({ text: 'Trois', tr: { ru: 'Три' } }));
    assert.strictEqual(text(find(n, 'clip-text')), 'session.clipText Trois');
    assert.strictEqual(text(find(n, 'clip-tr')), 'session.clipTr Три');
  }
});
test('mt flag switches the label', () => {
  const n = CT.render(S, t, 'ru', fake({ text: 'a', tr: { ru: 'б' }, mt: true }));
  assert.strictEqual(text(find(n, 'clip-tr-label')), 'session.clipTrMachine');
});
test('no fallback to another language', () => {
  const n = CT.render(S, t, 'en', fake({ text: 'a', tr: { ru: 'б' } }));
  assert.ok(find(n, 'clip-text'));
  assert.strictEqual(find(n, 'clip-tr'), null);
});
test('no fields, no result, no stimulus, not heard: nothing', () => {
  assert.strictEqual(CT.render(S, t, 'ru', fake({})), null);
  assert.strictEqual(CT.render(S, t, 'ru', fake(null)), null);
  assert.strictEqual(CT.render({ ...S, result: null }, t, 'ru', fake({ text: 'a' })), null);
  assert.strictEqual(CT.render(S, t, 'ru', fake({ text: 'a' }, null)), null);
});
test('html in text stays literal text', () => {
  const n = CT.render(S, t, 'ru', fake({ text: '<b>x</b>', tr: { ru: '<i>y</i>' } }));
  assert.strictEqual(text(find(n, 'clip-text')), 'session.clipText <b>x</b>');
  assert.strictEqual(find(n, 'clip-text').kids.length, 2);
});
test('session-feedback renders clip lines only in the non-exam branch', () => {
  const src = read('ui/session-feedback.js');
  const exam = src.indexOf("t('session.recorded')");
  const hook = src.indexOf('DojoClipText.render');
  assert.ok(exam > 0 && hook > exam);
  assert.ok(src.indexOf('} else if (res) {') < hook);
});

function audioEnv() {
  const win = {
    setTimeout, clearTimeout,
    AudioContext: class {
      constructor() { this.state = 'running'; this.destination = {}; }
      decodeAudioData(ab, ok) { ok({}); }
      createBufferSource() { return { connect() {}, start() { setImmediate(() => this.onended()); }, stop() {} }; }
    }
  };
  const manifest = { v: 1, packs: [{ file: 'p', bytes: 4, enc: 'raw' }], clips: { a: { pack: 0, off: 0, len: 1, ms: 5, mime: 'x', text: 'T', tr: { ru: 'Т' }, mt: true } } };
  AudioMod.configure({ manifest, win, fetch: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) }) });
  return AudioMod;
}
test('heardClip is null before playback started; clipMeta reads the manifest', () => {
  const A = audioEnv();
  A.pick('s', ['a'], () => 0);
  assert.strictEqual(A.heardClip('s', A.mark()), null);
  assert.strictEqual(JSON.stringify(A.clipMeta('a')), JSON.stringify({ text: 'T', tr: { ru: 'Т' }, mt: true }));
  assert.strictEqual(A.clipMeta('zz'), null);
});
test('a clip heard in an earlier item does not leak into the next', async () => {
  const A = audioEnv();
  const m1 = A.mark();
  A.pick('s', ['a'], () => 0);
  await A.play('a');
  assert.strictEqual(A.heardClip('s', m1), 'a');
  const m2 = A.mark();
  assert.strictEqual(A.heardClip('s', m2), null);
  await A.play('a');
  assert.strictEqual(A.heardClip('s', m2), 'a');
});

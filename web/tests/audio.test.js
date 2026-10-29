'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { loadBundle } = require('./load-bundle.js');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const BYTES = Uint8Array.from({ length: 40 }, (_, i) => i + 1);
const MANIFEST = {
  v: 1,
  packs: [{ file: 'p0.bin', bytes: 40, enc: 'raw' }, { file: 'p1.b64', bytes: 40, enc: 'base64' }],
  clips: {
    'a-1': { pack: 0, off: 4, len: 8, ms: 700, mime: 'audio/wav' },
    'a-2': { pack: 0, off: 20, len: 5, ms: 500, mime: 'audio/wav' },
    'b-1': { pack: 1, off: 10, len: 6, ms: 300, mime: 'audio/wav' }
  }
};

function env(opts = {}) {
  const e = { fetched: [], decoded: [], started: 0, resumed: 0 };
  e.fetch = async (url) => {
    e.fetched.push(url);
    if (opts.fail) return { ok: false, status: 404 };
    const buf = Buffer.from(BYTES);
    if (url.endsWith('manifest.json')) return { ok: true, json: async () => MANIFEST };
    if (url.endsWith('.b64')) return { ok: true, text: async () => buf.toString('base64') };
    return { ok: true, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length) };
  };
  e.win = {
    AudioContext: opts.noCtx ? undefined : class {
      constructor() { this.state = 'suspended'; this.destination = {}; }
      resume() { e.resumed++; this.state = 'running'; }
      decodeAudioData(ab, ok) { e.decoded.push(Array.from(new Uint8Array(ab))); ok({}); }
      createBufferSource() { return { connect() {}, start() { e.started++; setImmediate(() => this.onended()); }, stop() {} }; }
    },
    Audio: class { constructor(url) { e.elUrl = url; } play() { setImmediate(() => this.onended && this.onended()); } pause() {} },
    Blob: class { constructor(parts, o) { e.blob = Array.from(parts[0]); e.mime = o.type; } },
    URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} }
  };
  return e;
}

function fresh(e, extra = {}) {
  delete require.cache[require.resolve('../audio.js')];
  const A = require('../audio.js');
  A.configure(Object.assign({ win: e.win, fetch: e.fetch }, extra));
  return A;
}

test('base precedence: override > base > default', async () => {
  for (const [cfg, want] of [[{}, 'data/audio/'], [{ base: 'https://c/x' }, 'https://c/x/'], [{ base: 'https://c/x/', override: 'r2/' }, 'r2/']]) {
    const e = env();
    await fresh(e, cfg).play('a-1');
    assert.deepStrictEqual(e.fetched, [want + 'manifest.json', want + 'p0.bin']);
  }
});

test('one fetch per pack, even for concurrent plays', async () => {
  const e = env();
  const A = fresh(e);
  await Promise.all([A.play('a-1'), A.play('a-2')]);
  await A.play('a-1');
  assert.strictEqual(e.fetched.filter((u) => u.endsWith('p0.bin')).length, 1);
  assert.strictEqual(e.fetched.filter((u) => u.endsWith('manifest.json')).length, 1);
});

test('decode gets exactly the off/len slice and play resolves {ms}', async () => {
  const e = env();
  const r = await fresh(e).play('a-1');
  assert.deepStrictEqual(r, { ms: 700 });
  assert.deepStrictEqual(e.decoded[0], Array.from(BYTES.slice(4, 12)));
});

test('base64 pack is decoded to the same byte slice', async () => {
  const e = env();
  await fresh(e, { manifest: MANIFEST }).play('b-1');
  assert.deepStrictEqual(e.decoded[0], Array.from(BYTES.slice(10, 16)));
  assert.ok(!e.fetched.some((u) => u.endsWith('manifest.json')));
});

test('without AudioContext falls back to Audio + Blob URL', async () => {
  const e = env({ noCtx: true });
  const r = await fresh(e).play('a-2');
  assert.deepStrictEqual(r, { ms: 500 });
  assert.deepStrictEqual(e.blob, Array.from(BYTES.slice(20, 25)));
  assert.strictEqual(e.mime, 'audio/wav');
});

test('pick never repeats the last variant for a stimulus', () => {
  const A = fresh(env());
  const ids = ['x', 'y', 'z'];
  let prev = null;
  for (let i = 0; i < 30; i++) {
    const id = A.pick('s', ids, () => 0);
    assert.notStrictEqual(id, prev);
    prev = id;
  }
  assert.strictEqual(A.pick('t', ['only'], () => 0.9), 'only');
  assert.strictEqual(A.pick('t', ['only'], () => 0.9), 'only');
});

test('failures reject, never throw synchronously; unlock resumes the context', async () => {
  const e = env({ fail: true });
  const A = fresh(e);
  await assert.rejects(A.play('a-1'));
  await assert.rejects(fresh(env(), { manifest: MANIFEST }).play('nope'));
  const e2 = env();
  const B = fresh(e2, { manifest: MANIFEST });
  B.unlock();
  assert.strictEqual(e2.resumed, 1);
});

test('bundled after speech.js; i18n keys exist', () => {
  const b = JSON.parse(read('bundle.json')).scripts;
  assert.strictEqual(b.indexOf('audio.js'), b.indexOf('speech.js') + 1);
  for (const l of ['en', 'ru']) {
    const d = JSON.parse(read('i18n/' + l + '.json'));
    assert.ok(d['audio.failed'] && d['audio.loading']);
  }
});

function sandboxUi(audio) {
  const sb = { console };
  loadBundle(sb, { only: ['vendor/preact.min.js', 'vendor/htm.umd.js'] });
  vm.runInContext("self.DojoExt = { text: function (s) { return s; } };", sb);
  if (audio) sb.DojoAudio = audio;
  vm.runInContext(read('ui/play-button.js'), sb, { filename: 'ui/play-button.js' });
  vm.runInContext(read('ui/common.js'), sb, { filename: 'ui/common.js' });
  vm.runInContext(read('ui/stimulus.js'), sb, { filename: 'ui/stimulus.js' });
  return sb;
}

function findProp(v, key) {
  if (!v || typeof v !== 'object') return null;
  if (v.props && v.props[key]) return v;
  const ch = v.props && v.props.children;
  for (const c of [].concat(ch === undefined ? [] : ch)) { const f = findProp(c, key); if (f) return f; }
  return null;
}

const UI_AUDIO = (over) => Object.assign({ t: (k) => k, win: {}, cfg: {}, exam: false, played: {}, status: 'ok', onFail() {} }, over);

test('stimulus with audio and configured DojoAudio gets a clip Playback; without audio it is unchanged', () => {
  const on = sandboxUi({ ready: () => true });
  const S = on.DojoStimulus.create().Stimulus;
  const st = { id: 's', hideText: true, text: 'secret', audio: ['a-1', 'a-2'] };
  const v = S({ stimulus: st, audio: UI_AUDIO() });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(findProp(v, 'clip').props.clip)), { sid: 's', ids: ['a-1', 'a-2'] });
  assert.strictEqual(findProp(v, 'testid') && findProp(S({ stimulus: st, audio: UI_AUDIO() }), 'data-testid') !== null, true);
  const plain = S({ stimulus: { id: 's', text: 'hi' }, audio: UI_AUDIO() });
  assert.strictEqual(findProp(plain, 'clip'), null);
  const off = sandboxUi(null).DojoStimulus.create().Stimulus;
  assert.strictEqual(findProp(off({ stimulus: st, audio: UI_AUDIO() }), 'clip'), null);
});

test('clip failure shows audio.failed and falls back to speech when lines exist', async () => {
  const calls = [];
  const sb = sandboxUi({ ready: () => true, unlock() {}, stop() {}, pick: (s, ids) => ids[0], play: () => Promise.reject(new Error('x')) });
  sb.DojoSpeech = { play: (lines) => { calls.push(lines); return { ok: true }; }, stop() {} };
  vm.runInContext(read('ui/play-button.js'), sb, { filename: 'ui/play-button.js' });
  vm.runInContext(read('ui/common.js'), sb, { filename: 'ui/common.js' });
  const C = sb.DojoCommon;
  const vn = C.Playback({ audio: UI_AUDIO(), lines: [{ text: 'hi' }], clip: { sid: 's', ids: ['a-1'] }, testid: 'p', pid: 's:s' });
  const btn = new vn.type(vn.props);
  btn.setState = function (s) { Object.assign(this.state, s); };
  btn.click();
  await new Promise((r) => setImmediate(r));
  assert.strictEqual(btn.state.failed, true);
  assert.strictEqual(calls.length, 1);
  assert.ok(findProp(btn.render(vn.props, btn.state), 'data-testid') || JSON.stringify(btn.render(vn.props, btn.state)).includes('p-failed'));
});

test('clip failure without speech lines reports onFail; hidden text stays hidden when status is unavailable', async () => {
  const sb = sandboxUi({ ready: () => true, unlock() {}, stop() {}, pick: (s, ids) => ids[0], play: () => Promise.reject(new Error('x')) });
  let failed = 0;
  const a = UI_AUDIO({ onFail() { failed++; } });
  const vn = sb.DojoCommon.Playback({ audio: a, lines: [], clip: { sid: 's', ids: ['a-1'] }, testid: 'p', pid: 's:s' });
  const btn = new vn.type(vn.props);
  btn.setState = function (s) { Object.assign(this.state, s); };
  btn.click();
  await new Promise((r) => setImmediate(r));
  assert.strictEqual(failed, 1);
  const S = sb.DojoStimulus.create().Stimulus;
  const st = { id: 's', hideText: true, text: 'secret', audio: ['a-1'] };
  assert.strictEqual(findProp(S({ stimulus: st, audio: UI_AUDIO() }), 'data-testid') && JSON.stringify(S({ stimulus: st, audio: UI_AUDIO() })).includes('stimulus-text'), false);
  assert.strictEqual(JSON.stringify(S({ stimulus: st, audio: UI_AUDIO({ status: 'unavailable' }) })).includes('stimulus-text'), false);
});

function stickySetup() {
  const real = require('../audio.js');
  const played = [];
  const sb = sandboxUi({ ready: () => true, unlock() {}, stop() {}, pick: real.pick, play: (id) => { played.push(id); return Promise.resolve({}); } });
  const mk = (ids) => {
    const vn = sb.DojoCommon.Playback({ audio: UI_AUDIO(), lines: [], clip: { sid: 's', ids }, testid: 'p', pid: 's:s' });
    const btn = new vn.type(vn.props);
    btn.setState = function (s) { Object.assign(this.state, s); };
    return btn;
  };
  return { played, mk };
}

test('replay of one question plays the same clip every time', async () => {
  const { played, mk } = stickySetup();
  const btn = mk(['a', 'b', 'c']);
  for (let i = 0; i < 3; i++) { btn.click(); await new Promise((r) => setImmediate(r)); }
  assert.strictEqual(played.length, 3);
  assert.strictEqual(new Set(played).size, 1);
});

test('a new question instance may pick another clip', async () => {
  const { played, mk } = stickySetup();
  const ids = ['a', 'b', 'c'];
  for (let i = 0; i < 4; i++) { mk(ids).click(); await new Promise((r) => setImmediate(r)); }
  assert.ok(new Set(played).size > 1);
});

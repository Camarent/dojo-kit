'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { loadBundle } = require('./load-bundle.js');
const QT = require('../ui/question-timer.js');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const tick = () => new Promise((r) => setImmediate(r));

function mkAudio(o = {}) {
  const e = { started: 0, urls: [], resumed: 0 };
  const manifest = { v: 1, packs: [{ file: 'p.mp3', bytes: 10 }], clips: { c: { pack: 0, off: 0, len: 10, ms: o.ms === undefined ? 0 : o.ms, mime: 'audio/mpeg' } } };
  const win = {
    navigator: { userAgent: o.ua || 'Mozilla/5.0 Chrome/120 Safari/537' },
    setTimeout: o.hang ? (fn) => { e.timeoutFn = fn; return 1; } : setTimeout,
    clearTimeout: () => {},
    AudioContext: class {
      constructor() { this.state = 'suspended'; this.destination = {}; }
      resume() { e.resumed++; }
      decodeAudioData(ab, ok, bad) {
        e.decodeCalls = (e.decodeCalls || 0) + 1;
        if (o.defer) { e.ok = ok; e.bad = bad; return undefined; }
        if (o.twice) { ok({ duration: 1 }); ok({ duration: 1 }); return undefined; }
        if (o.hang) return undefined;
        if (o.decodeFail) { const er = Object.assign(new Error('x'), { name: 'EncodingError' }); bad(er); return o.promiseStyle ? Promise.reject(er) : undefined; }
        const buf = { duration: 1.5 };
        ok(buf);
        return o.promiseStyle ? Promise.resolve(buf) : undefined;
      }
      createBufferSource() { const src = { connect() {}, start() { e.started++; if (!o.longClip) setImmediate(() => src.onended()); }, stop() { e.stopped = (e.stopped || 0) + 1; setImmediate(() => src.onended()); } }; return src; }
    },
    Audio: class { constructor() { (e.els = e.els || []).push(this); } play() { e.plays = (e.plays || 0) + 1; e.urls.push(this.src); if (o.allFail) return Promise.reject(Object.assign(new Error('n'), { name: 'NotAllowedError' })); if (o.blobBlocked && this.src.startsWith('blob:')) return Promise.reject(Object.assign(new Error('b'), { name: 'NotSupportedError' })); setImmediate(() => this.onended && this.onended()); return Promise.resolve(); } pause() { this.paused = (this.paused || 0) + 1; } },
    Blob: class {},
    URL: { createObjectURL: () => 'blob:x', revokeObjectURL() { e.revoked = (e.revoked || 0) + 1; } },
    btoa: (s) => Buffer.from(s, 'binary').toString('base64')
  };
  if (o.webkitOnly) { win.webkitAudioContext = win.AudioContext; win.AudioContext = undefined; }
  e.win = win;
  const fetch = async (url) => (url.endsWith('manifest.json') ? { ok: true, json: async () => manifest }
    : { ok: true, arrayBuffer: async () => new Uint8Array(10).buffer });
  delete require.cache[require.resolve('../audio.js')];
  const A = require('../audio.js');
  A.configure({ win, fetch });
  return { A, e };
}

test('viaContext starts the clip once when decodeAudioData both calls back and returns a promise', async () => {
  const { A, e } = mkAudio({ promiseStyle: true });
  await A.play('c');
  assert.strictEqual(e.started, 1);
});

test('manifest ms 0 -> duration measured from the decoded buffer, exposed by play, onStart and duration()', async () => {
  const { A } = mkAudio({ ms: 0 });
  let started = null;
  const r = await A.play('c', { onStart: (i) => { started = i.ms; } });
  assert.strictEqual(r.ms, 1500);
  assert.strictEqual(started, 1500);
  assert.strictEqual(A.duration('c'), 1500);
});

test('manifest ms wins when present', async () => {
  const { A } = mkAudio({ ms: 700 });
  assert.strictEqual((await A.play('c')).ms, 700);
});

test('decode failure falls back to Audio element; blocked blob: falls back to a data: URL', async () => {
  const { A, e } = mkAudio({ decodeFail: true, promiseStyle: true, blobBlocked: true });
  await A.play('c');
  assert.strictEqual(e.urls[0].slice(0, 5), 'blob:');
  assert.strictEqual(e.urls[1].slice(0, 5), 'data:');
  const s = A.status();
  assert.strictEqual(s.decodeError, 'EncodingError');
  assert.strictEqual(s.playError, 'NotSupportedError');
});

test('unlock creates and resumes the context and primes an Audio element in the tap', async () => {
  const { A, e } = mkAudio();
  A.unlock();
  assert.strictEqual(e.resumed, 1);
  assert.strictEqual(e.urls.length, 1);
  await tick();
  assert.strictEqual(A.status().ctx, 'suspended');
});

test('preload fetches manifest and packs; status reports them', async () => {
  const { A } = mkAudio();
  await A.preload();
  const s = A.status();
  assert.strictEqual(s.manifest, 'ok');
  assert.strictEqual(s.packs, '0:ok');
});

function ui(audio) {
  const sb = { console };
  loadBundle(sb, { only: ['vendor/preact.min.js', 'vendor/htm.umd.js'] });
  vm.runInContext("self.DojoExt = { text: function (s) { return s; } };", sb);
  sb.DojoAudio = audio;
  vm.runInContext(read('ui/play-button.js'), sb, { filename: 'ui/play-button.js' });
  vm.runInContext(read('ui/common.js'), sb, { filename: 'ui/common.js' });
  return sb;
}
const A0 = (over) => Object.assign({ t: (k) => k, win: {}, cfg: {}, exam: false, played: {}, status: 'ok', onFail() {} }, over);

function button(sb, audio) {
  const vn = sb.DojoCommon.Playback({ audio, lines: [], clip: { sid: 's', ids: ['c'] }, testid: 'p', pid: 's:s' });
  const btn = new vn.type(vn.props);
  btn.setState = function (s) { Object.assign(this.state, s); };
  return { btn, vn };
}
const json = (x) => JSON.stringify(x);

test('timer starts when the clip ends, not when it starts; replay does not restart it', async () => {
  let release;
  const sb = ui({ unlock() {}, stop() {}, pick: (s, ids) => ids[0], play: (id, o) => new Promise((res) => { o.onStart({ ms: 2000 }); release = res; }) });
  const audio = A0();
  const { btn } = button(sb, audio);
  let t = 0, starts = 0;
  const ctl = QT.controller({ now: () => t, limitMs: 5000, canStart: () => !!audio.played['s:s'], onStart: () => { starts++; }, onExpire() {} });
  btn.click();
  await tick();
  ctl.poll();
  assert.strictEqual(starts, 0, 'clip is playing');
  release({ ms: 2000 });
  await tick();
  t = 100;
  ctl.poll();
  assert.strictEqual(starts, 1);
  btn.state.playing = false;
  btn.click(); // replay
  await tick();
  t = 300;
  ctl.poll();
  assert.strictEqual(starts, 1);
  assert.strictEqual(ctl.state().left, 4800);
});

test('clip error releases the timer at once', async () => {
  const sb = ui({ unlock() {}, stop() {}, pick: (s, ids) => ids[0], play: () => Promise.reject(new Error('x')) });
  const audio = A0();
  const { btn } = button(sb, audio);
  btn.click();
  await tick();
  assert.strictEqual(audio.played['s:s'], true);
});

test('playback track: progressbar with aria values while a clip plays', () => {
  const sb = ui({});
  const { btn, vn } = button(sb, A0());
  btn.state.playing = true;
  btn.state.track = { ms: 4000, at: 1000 };
  btn.state.now = 2500;
  const out = json(btn.render(vn.props, btn.state));
  assert.ok(out.includes('"role":"progressbar"'));
  assert.ok(out.includes('"aria-valuenow":1.5'));
  assert.ok(out.includes('"aria-valuemax":4'));
  assert.ok(out.includes('1.5 / 4.0 s'));
  btn.state.playing = false;
  assert.ok(!json(btn.render(vn.props, btn.state)).includes('play-track'));
});

test('debug status line only with the debug flag', () => {
  const sb = ui({ status: () => ({ manifest: 'ok', packs: '0:ok', ctx: 'running', decodeError: 'EncodingError', playError: '' }) });
  const { btn, vn } = button(sb, A0());
  assert.ok(!json(btn.render(vn.props, btn.state)).includes('audio-debug'));
  const d = button(sb, A0({ debug: true }));
  const out = json(d.btn.render(d.vn.props, d.btn.state));
  assert.ok(out.includes('audio-debug') && out.includes('EncodingError') && out.includes('running'));
});

const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605 Version/17 Mobile Safari/604';

test('iOS Safari: Audio element + Blob URL is the primary path, decodeAudioData is never called', async () => {
  const { A, e } = mkAudio({ ua: IOS });
  await A.play('c');
  assert.strictEqual(e.decodeCalls || 0, 0);
  assert.strictEqual(e.urls[0].slice(0, 5), 'blob:');
  assert.strictEqual(A.status().path, 'blob');
});

test('desktop Chrome keeps the Web Audio path', async () => {
  const { A, e } = mkAudio();
  await A.play('c');
  assert.strictEqual(e.decodeCalls, 1);
  assert.strictEqual(A.status().path, 'webaudio');
});

test('with manifest and pack preloaded, play() reaches Audio.play() synchronously (inside the tap)', async () => {
  const { A, e } = mkAudio({ ua: IOS });
  await A.preload();
  const p = A.play('c');
  assert.strictEqual(e.urls.length, 1, 'Audio.play ran before any await');
  await p;
});

test('a decodeAudioData that never answers falls back to the Audio element after the timeout', async () => {
  const { A, e } = mkAudio({ hang: true });
  const p = A.play('c');
  await tick(); await tick(); await tick();
  assert.ok(e.timeoutFn, 'timeout armed');
  assert.strictEqual(e.urls.length, 0);
  e.timeoutFn();
  await p;
  assert.strictEqual(e.urls[0].slice(0, 5), 'blob:');
  assert.strictEqual(A.status().decodeError, 'DecodeTimeout');
});

test('status reports the last step and error', async () => {
  const { A } = mkAudio({ decodeFail: true });
  await A.play('c');
  const s = A.status();
  assert.strictEqual(s.step, 'ended');
  assert.ok(/^EncodingError/.test(s.err));
  assert.strictEqual(s.path, 'blob');
});

test('the same clip requested while active shares one playback (single start)', async () => {
  const { A, e } = mkAudio({ ua: IOS, hang: false });
  await A.preload();
  const a = A.play('c');
  const b = A.play('c');
  assert.strictEqual(a, b);
  assert.strictEqual(e.plays, 1);
  await a;
});

test('a new play stops and releases the previous element (pause, currentTime 0)', async () => {
  const { A, e } = mkAudio({ ua: IOS });
  e.mf = null;
  await A.preload();
  // second clip id shares pack
  const first = A.play('c');
  const el = e.els[e.els.length - 1];
  A.stop();
  await first;
  assert.ok(el.paused >= 1);
  assert.strictEqual(el.currentTime, 0);
});

test('different clip while one plays stops the first (web audio)', async () => {
  const { A, e } = mkAudio({ longClip: true });
  const m = { v: 1, packs: [{ file: 'p.mp3', bytes: 10 }], clips: { c: { pack: 0, off: 0, len: 5, ms: 0, mime: 'audio/mpeg' }, d: { pack: 0, off: 5, len: 5, ms: 0, mime: 'audio/mpeg' } } };
  delete require.cache[require.resolve('../audio.js')];
  const B = require('../audio.js');
  B.configure({ win: e.win, fetch: async (u) => (u.endsWith('.json') ? { ok: true, json: async () => m } : { ok: true, arrayBuffer: async () => new Uint8Array(10).buffer }) });
  const wait = () => new Promise((r) => setTimeout(r, 30));
  const p1 = B.play('c');
  await wait();
  const p2 = B.play('d');
  await wait();
  assert.strictEqual(e.stopped, 1);
  assert.strictEqual(e.started, 2);
  await p1;
  B.stop();
  await p2;
});

test('a play superseded while its pack loads never starts', async () => {
  const { A, e } = mkAudio({ ua: IOS });
  const p = A.play('c');
  A.stop();
  const r = await p;
  assert.strictEqual(r.superseded, true);
  assert.strictEqual(e.started, 0);
  assert.ok(!e.plays);
});

test('unlock priming element is paused after its silent play and the clip uses a fresh element when preloaded', async () => {
  const { A, e } = mkAudio({ ua: IOS });
  A.unlock();
  await tick(); await tick();
  const prime = e.els[0];
  assert.ok(prime.paused >= 1);
  await A.preload();
  await A.play('c');
  assert.ok(e.els.length >= 2 && e.els[1] !== prime);
});

test('decode callback invoked twice starts the clip once', async () => {
  const { A, e } = mkAudio({ twice: true });
  await A.play('c');
  assert.strictEqual(e.started, 1);
});

test('iPhone UA without a Safari token is element-first', async () => {
  const { A, e } = mkAudio({ ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605 Mobile' });
  await A.play('c');
  assert.strictEqual(e.decodeCalls || 0, 0);
});

test('webkitAudioContext-only engine is element-first', async () => {
  const { A, e } = mkAudio({ webkitOnly: true });
  await A.play('c');
  assert.strictEqual(e.decodeCalls || 0, 0);
  assert.strictEqual(A.status().path, 'blob');
});

test('stop releases the Blob URL and detaches the element handlers', async () => {
  const { A, e } = mkAudio({ ua: IOS });
  await A.preload();
  const p = A.play('c');
  const el = e.els[e.els.length - 1];
  A.stop();
  await p;
  assert.ok(e.revoked >= 1);
  assert.strictEqual(el.onended, null);
  assert.strictEqual(el.onerror, null);
});

test('a decode result that arrives after stop() never starts', async () => {
  const { A, e } = mkAudio({ defer: true });
  const p = A.play('c');
  await new Promise((r) => setTimeout(r, 20));
  A.stop();
  e.ok({ duration: 1 });
  await p;
  assert.strictEqual(e.started, 0);
});

test('a decode failure after stop() does not start the Audio fallback', async () => {
  const { A, e } = mkAudio({ defer: true });
  const p = A.play('c');
  await new Promise((r) => setTimeout(r, 20));
  A.stop();
  e.bad(new Error('late'));
  const r = await p;
  assert.strictEqual(r.superseded, true);
  assert.ok(!e.plays);
});

test('blob and data both rejected: rejects after exactly two attempts', async () => {
  const { A, e } = mkAudio({ ua: IOS, allFail: true });
  await assert.rejects(A.play('c'));
  assert.strictEqual(e.plays, 2);
});

test('onStart of a superseded element play is not delivered', async () => {
  const { A } = mkAudio({ ua: IOS });
  await A.preload();
  let n = 0;
  const p = A.play('c', { onStart: () => { n++; } });
  A.stop();
  await p;
  await tick();
  assert.strictEqual(n, 0);
});

test('unlock starts preload of manifest and packs', async () => {
  const { A } = mkAudio();
  A.unlock();
  await new Promise((r) => setTimeout(r, 20));
  assert.strictEqual(A.status().manifest, 'ok');
  assert.strictEqual(A.status().packs, '0:ok');
});

test('superseded clip does not mark played; failed exam clip releases the timer without the once-lock', async () => {
  let res;
  const sb = ui({ unlock() {}, stop() {}, pick: (s, ids) => ids[0], play: () => new Promise((r) => { res = r; }) });
  const audio = A0();
  const { btn } = button(sb, audio);
  btn.click();
  res({ ms: 0, superseded: true });
  await tick();
  assert.strictEqual(audio.played['s:s'], undefined);
  const sb2 = ui({ unlock() {}, stop() {}, pick: (s, ids) => ids[0], play: () => Promise.reject(new Error('x')) });
  const ex = A0({ exam: true });
  button(sb2, ex).btn.click();
  await tick();
  assert.strictEqual(ex.played['s:s'], undefined);
  assert.strictEqual(ex.released['s:s'], true);
});

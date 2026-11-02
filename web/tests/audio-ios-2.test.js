'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { loadBundle } = require('./load-bundle.js');
require('../ui/question-timer.js');

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
(x) => JSON.stringify(x);



const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605 Version/17 Mobile Safari/604';

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

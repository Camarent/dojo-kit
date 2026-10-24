'use strict';
const test = require('node:test');
const assert = require('node:assert');
const H = require('./app-harness.js');

const en = JSON.parse(H.read('i18n/en.json'));

function make(opts) {
  const C = H.loadApp().DojoCommon;
  const t = (k) => en[k] || k;
  const audio = Object.assign({ t, played: {}, win: {}, cfg: {}, onFail() {}, status: 'ok' }, opts.audio || {});
  const props = Object.assign({ pid: 'p', lines: [], testid: 'p', audio }, opts.props || {});
  const b = new C.PlayButton(props);
  b.state = Object.assign({ playing: false, played: false }, opts.state || {});
  return { b, props, view: () => H.expand(b.render(b.props, b.state)) };
}

test('idle non-clip button shows the play glyph and the play label', () => {
  const v = make({}).view();
  const btn = H.find(v, 'p');
  assert.strictEqual(btn.props['aria-label'], en['speech.play']);
  assert.strictEqual(btn.props.disabled, false);
  assert.match(H.text(btn), /▶/);
});

test('playing non-exam button shows the stop glyph and the stop label', () => {
  const btn = H.find(make({ state: { playing: true } }).view(), 'p');
  assert.strictEqual(btn.props['aria-label'], en['speech.stop']);
  assert.match(H.text(btn), /■/);
});

test('playing clip shows progressbar track and loading label until the track starts', () => {
  const v = make({ props: { clip: { sid: 's1', ids: ['c1'] } }, state: { playing: true } }).view();
  assert.strictEqual(H.find(v, 'p').props['aria-label'], en['audio.loading']);
  assert.ok(H.find(v, 'play-spin'), 'spinner glyph present');
});

test('failed clip renders the failed notice next to the button', () => {
  const v = make({ props: { clip: { sid: 's1', ids: ['c1'] } }, state: { failed: true } }).view();
  const notice = H.find(v, 'p-failed');
  assert.ok(notice, 'failed notice present');
  assert.strictEqual(H.text(notice), en['audio.failed']);
});

test('exam played-once lock disables the button with the played label', () => {
  const v = make({ audio: { exam: true }, state: { played: true } }).view();
  const btn = H.find(v, 'p');
  assert.strictEqual(btn.props.disabled, true);
  assert.strictEqual(btn.props['aria-label'], en['speech.played']);
});

test('exam lock also applies when the shared played map has the id', () => {
  const v = make({ audio: { exam: true, played: { p: true } } }).view();
  assert.strictEqual(H.find(v, 'p').props.disabled, true);
});

test('non-exam played map does not lock the button', () => {
  const v = make({ audio: { exam: false, played: { p: true } } }).view();
  assert.strictEqual(H.find(v, 'p').props.disabled, false);
});

function clipButton(play, state) {
  const app = H.loadApp();
  app.DojoAudio = { unlock() {}, pick: (sid, ids) => ids[0], play, stop() {} };
  const t = (k) => en[k] || k;
  const audio = { t, played: {}, win: {}, cfg: {}, onFail() {}, status: 'ok' };
  const b = new app.DojoPlayButton.PlayButton({ pid: 'p', lines: [], testid: 'p', clip: { sid: 's1', ids: ['c1'] }, audio });
  b.state = Object.assign({ playing: false, played: false }, state || {});
  b.setState = function (s) { this.state = Object.assign({}, this.state, s); };
  return b;
}
const flush = () => new Promise((r) => setImmediate(r));

test('clip that fails keeps an earlier played state and shows failed', async () => {
  const b = clipButton(() => Promise.reject(new Error('boom')), { played: true });
  b.click();
  await flush();
  assert.strictEqual(b.state.failed, true);
  assert.strictEqual(b.state.played, true);
  assert.strictEqual(b.state.playing, false);
});

test('clip that plays to the end marks the button played and not failed', async () => {
  const b = clipButton(() => Promise.resolve({ ms: 1 }));
  b.click();
  await flush();
  assert.strictEqual(b.state.played, true);
  assert.strictEqual(b.state.failed, false);
});

'use strict';
const test = require('node:test');
const assert = require('node:assert');
const H = require('./app-harness.js');
const Dictation = require('../ui/dictation.js');

const LISTEN = { id: 's1', text: 'x', hideText: true, audio: ['c1'] };
const en = JSON.parse(H.read('i18n/en.json'));
const ru = JSON.parse(H.read('i18n/ru.json'));

function fakeAudio() {
  return { ready: () => true, pick: (s, ids) => ids[0], stop() {}, unlock() {}, play: () => Promise.resolve({ ms: 1 }) };
}
function button(replays, status) {
  const C = H.loadApp().DojoCommon;
  const t = H.loadApp().DojoApp._makeT({ en, ru }, 'en');
  const dict = Dictation.create({ win: { navigator: { userActivation: { hasBeenActive: true } } }, audio: fakeAudio() });
  dict.open({ stimulus: LISTEN, timer: { replays } });
  const audio = { t, played: {}, win: {}, cfg: {}, onFail() {}, status: status || 'ok' };
  const b = new C.PlayButton({ clip: { sid: 's1', ids: ['c1'] }, lines: [], pid: 'p', audio, testid: 'p', dict });
  b.setState = function (s) { this.state = Object.assign({}, this.state, s); };
  return { b, dict, view: () => H.expand(b.render(b.props, b.state)) };
}

test('replays:1 shows 1 left, one replay leaves 0 and the button disabled with the noreplay label', () => {
  const { b, dict, view } = button(1);
  assert.match(H.text(H.find(view(), 'play-replays')), /Replays: 1/);
  assert.strictEqual(dict.take(), true);
  const v = view();
  assert.match(H.text(H.find(v, 'play-replays')), /Replays: 0/);
  const btn = H.find(v, 'p');
  assert.strictEqual(btn.props.disabled, true);
  assert.strictEqual(btn.props['aria-label'], en['audio.noreplay']);
  assert.strictEqual(btn.props.title, en['audio.noreplay']);
});

test('replays:2 shows 2 then 1 left', () => {
  const { dict, view } = button(2);
  assert.match(H.text(H.find(view(), 'play-replays')), /Replays: 2/);
  dict.take();
  assert.match(H.text(H.find(view(), 'play-replays')), /Replays: 1/);
});

test('russian counter is plural-aware and has the noreplay text', () => {
  const t = H.loadApp().DojoApp._makeT({ en, ru }, 'ru');
  assert.strictEqual(t('audio.replays', { n: 1 }), 'Повтор: 1');
  assert.strictEqual(t('audio.replays', { n: 2 }), 'Повтора: 2');
  assert.strictEqual(t('audio.replays', { n: 0 }), 'Повторов: 0');
  assert.strictEqual(t('audio.noreplay'), 'Повторов больше нет');
});

test('no counter without a replay limit', () => {
  const C = H.loadApp().DojoCommon;
  const audio = { t: (k) => k, played: {}, win: {}, cfg: {}, onFail() {}, status: 'ok' };
  const b = new C.PlayButton({ lines: ['x'], pid: 'p', audio, testid: 'p' });
  b.state = {};
  assert.strictEqual(H.find(H.expand(b.render(b.props, b.state)), 'play-replays'), null);
});

test('loading state renders the spinner and the loading aria-label', () => {
  const { b, view } = button(1);
  b.setState({ playing: true, track: null });
  const v = view();
  assert.ok(H.find(v, 'play-spin'));
  assert.strictEqual(H.find(v, 'p').props['aria-label'], en['audio.loading']);
  b.setState({ track: { ms: 1, at: 0 } });
  assert.strictEqual(H.find(view(), 'play-spin'), null);
  assert.ok(/\.spin\b/.test(H.read('styles/app.css')) && /prefers-reduced-motion: no-preference\) \{ \.spin/.test(H.read('styles/app.css')));
});

test('clip stimulus without text gets a centred big-play button', () => {
  const sb = H.loadApp();
  sb.DojoAudio = { ready: () => true, unlock() {}, stop() {}, pick: (s, ids) => ids[0], play: () => Promise.resolve({}) };
  const audio = { status: 'ok', t: (k) => k, played: {}, win: {}, cfg: {}, exam: false, onFail() {} };
  const tree = H.expand(sb.DojoApp._Stimulus({ stimulus: LISTEN, audio }));
  let node = null;
  H.walk(tree, (n) => { if (n.props.pid === 's:s1') node = n; });
  assert.ok(node);
  const inst = new node.type(node.props);
  inst.state = {};
  const btn = H.find(H.expand(inst.render(inst.props, inst.state)), 'play-stimulus');
  assert.ok(btn);
  assert.match(btn.props.class, /\bbig-play\b/);
  let centred = false;
  H.walk(tree, (n) => { if (n.props && /\bqline centred\b/.test(n.props.class || '')) centred = true; });
  assert.ok(centred);
  assert.match(H.read('styles/app.css'), /\.btn\.play\.big-play \{[^}]*min-width: 64px/);
});

'use strict';
const test = require('node:test');
const assert = require('node:assert');
const vm = require('node:vm');
const { loadBundle } = require('./load-bundle.js');

function loadApp(audioReady) {
  const sandbox = { console };
  loadBundle(sandbox, { skip: ['boot.js'] });
  vm.runInContext('self.DojoAudio = { ready: function () { return ' + !!audioReady + '; } };', sandbox);
  return sandbox;
}

function find(v, id) {
  if (!v || typeof v !== 'object') return null;
  if (v.props && v.props['data-testid'] === id) return v;
  const ch = v.props && v.props.children;
  for (const c of [].concat(ch === undefined ? [] : ch)) { const f = find(c, id); if (f) return f; }
  return null;
}
function findPb(v) {
  if (!v || typeof v !== 'object') return null;
  if (v.props && v.props.testid === 'play-stimulus') return v;
  const ch = v.props && v.props.children;
  for (const c of [].concat(ch === undefined ? [] : ch)) { const f = findPb(c); if (f) return f; }
  return null;
}
function text(v) {
  if (v === null || v === undefined || typeof v === 'boolean') return '';
  if (typeof v !== 'object') return String(v);
  if (Array.isArray(v)) return v.map(text).join('');
  return text(v.props && v.props.children);
}

const audioWith = (status) => ({ t: (k) => k, status, played: {}, exam: false, cfg: { lang: 'fr' }, onFail() {} });
const CLIP = { id: 's', text: 'hello world', hideText: true, audio: ['c1'] };
const SPEECH = { id: 'p', text: 'hello world', hideText: true, speak: { lines: [{ text: 'hello world' }] } };

test('hideText + clip + status unavailable: no stimulus-text', () => {
  const sb = loadApp(true);
  assert.strictEqual(find(sb.DojoApp._Stimulus({ stimulus: CLIP, audio: audioWith('unavailable') }), 'stimulus-text'), null);
});

test('hideText speech-only + no_voice: notice speech.novoice, no text', () => {
  const sb = loadApp(false);
  const v = sb.DojoApp._Stimulus({ stimulus: SPEECH, audio: audioWith('no_voice') });
  assert.strictEqual(find(v, 'stimulus-text'), null);
  const pb = findPb(v);
  assert.ok(pb);
  const n = pb.type(pb.props);
  assert.strictEqual(text(find(n, 'play-stimulus-notice')), 'speech.novoice');
});

test('hideText speech-only + API missing: notice speech.unavailable, no text', () => {
  const sb = loadApp(false);
  const v = sb.DojoApp._Stimulus({ stimulus: SPEECH, audio: audioWith('unavailable') });
  assert.strictEqual(find(v, 'stimulus-text'), null);
  const n = findPb(v).type(findPb(v).props);
  assert.strictEqual(text(find(n, 'play-stimulus-notice')), 'speech.unavailable');
});

function timerEl(sb, stimulus) {
  const self = { played: {}, released: {}, timeout() {} };
  const session = { timerLimit: () => 5000, timerStart() {} };
  const s = { cur: { item: { id: 'i1' }, stimulus, position: 1 } };
  return sb.DojoApp._SessionScreen.prototype.renderQTimer.call(self, { session, now: () => 0, t: (k) => k }, s, audioWith('ok'));
}

test('hideText, no playable source (clips flagged away): no text, notice, canStart true', () => {
  const sb = loadApp(true);
  const st = { id: 'f', text: 'hello world', hideText: true, audio: [] };
  const v = sb.DojoApp._Stimulus({ stimulus: st, audio: audioWith('ok') });
  assert.strictEqual(find(v, 'stimulus-text'), null);
  assert.ok(find(v, 'stimulus-nosource-notice'));
  assert.strictEqual(timerEl(sb, st).props.canStart(), true);
});

test('hideText clip with DojoAudio not ready: no text, notice, canStart true', () => {
  const sb = loadApp(false);
  const v = sb.DojoApp._Stimulus({ stimulus: CLIP, audio: audioWith('ok') });
  assert.strictEqual(find(v, 'stimulus-text'), null);
  assert.ok(find(v, 'stimulus-nosource-notice'));
  assert.strictEqual(timerEl(sb, CLIP).props.canStart(), true);
});

test('timer canStart is false for an unplayable hideText speech item', () => {
  const sb = loadApp(false);
  const self = { played: {}, released: {}, timeout() {} };
  const session = { timerLimit: () => 5000, timerStart() {} };
  const s = { cur: { item: { id: 'i1' }, stimulus: SPEECH, position: 1 } };
  const el = sb.DojoApp._SessionScreen.prototype.renderQTimer.call(self, { session, now: () => 0, t: (k) => k }, s, audioWith('unavailable'));
  assert.strictEqual(el.props.canStart(), false);
  self.played['s:p'] = true;
  assert.strictEqual(el.props.canStart(), true);
});

'use strict';
const test = require('node:test');
const assert = require('node:assert');
const vm = require('node:vm');
const { loadBundle } = require('./load-bundle.js');

function loadApp(audioReady) {
  const sandbox = { console };
  loadBundle(sandbox, { skip: ['boot.js'] });
  vm.runInContext('self.DojoAudio = { ready: function () { return ' + !!audioReady + '; } };', sandbox);
  return sandbox.DojoApp;
}

function find(v, id) {
  if (!v || typeof v !== 'object') return null;
  if (v.props && v.props['data-testid'] === id) return v;
  const ch = v.props && v.props.children;
  for (const c of [].concat(ch === undefined ? [] : ch)) { const f = find(c, id); if (f) return f; }
  return null;
}

const audioWith = (status, extra) => Object.assign({ t: (k) => k, status, played: {}, exam: false, cfg: {}, onFail() {} }, extra || {});
const ST = { id: 's', text: 'deux', hideText: true, audio: ['c1'] };

test('hidden stimulus text stays hidden while speech status is ok (clip pack ready)', () => {
  const { _Stimulus: Stimulus } = loadApp(true);
  assert.strictEqual(find(Stimulus({ stimulus: ST, audio: audioWith('ok') }), 'stimulus-text'), null);
});

test('hidden stimulus text stays hidden when speech voices are missing but the clip pack plays', () => {
  const { _Stimulus: Stimulus } = loadApp(true);
  assert.strictEqual(find(Stimulus({ stimulus: ST, audio: audioWith('no_voice') }), 'stimulus-text'), null);
});

test('hidden stimulus text stays hidden when speech is unavailable (clip item)', () => {
  const { _Stimulus: Stimulus } = loadApp(true);
  assert.strictEqual(find(Stimulus({ stimulus: ST, audio: audioWith('unavailable') }), 'stimulus-text'), null);
});

function qtimerGate(status, played) {
  const app = loadApp(true);
  const self = { played: played || {}, released: {}, timeout() {} };
  const session = { timerLimit: () => 5000, timerStart() {} };
  const item = { id: 'i1' };
  const s = { cur: { item, stimulus: ST, position: 1 } };
  const el = app._SessionScreen.prototype.renderQTimer.call(self, { session, now: () => 0, t: (k) => k }, s, audioWith(status));
  return { canStart: el.props.canStart, self };
}

for (const status of ['ok', 'no_voice']) {
  test('timer waits for the clip end with speech status ' + status, () => {
    const g = qtimerGate(status);
    assert.strictEqual(g.canStart(), false);
    g.self.played['s:s'] = true;
    assert.strictEqual(g.canStart(), true);
  });
}

test('timer starts at once when the clip failed (released)', () => {
  const g = qtimerGate('ok');
  g.self.released['s:s'] = true;
  assert.strictEqual(g.canStart(), true);
});

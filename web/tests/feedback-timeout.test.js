'use strict';
// Mutation coverage: dropping the !timedOut guard on override fails the override test; dropping revealedLine fails the reveal tests.
const test = require('node:test');
const assert = require('node:assert');
const H = require('./app-harness.js');

const LISTEN = { id: 's1', text: 'sample words', hideText: true, audio: ['c1'] };
const PLAIN = { id: 's2', text: 'visible', audio: ['c1'] };
const T1 = { baseMs: 8000, adaptive: true, replays: 1 };

async function start(stim, mode, answer) {
  const items = [{ id: 'n1', unit: 'u1', type: 'numeric', prompt: 'How many?', answer: 87, stimulus: stim.id }];
  const m = await H.mount({ items, stimuli: [stim], course: { units: [{ id: 'u1', title: 'U1' }], timer: T1 } });
  m.app.startMode(mode || 'practice', { types: ['numeric'] });
  const ss = m.screen(m.sb.DojoApp._SessionScreen);
  return { m: m, ss: ss };
}

test('timeout: verdict is time-up, no notice, no override, one feedback box, expected once', async () => {
  const { ss } = await start(LISTEN);
  ss.props.session.canOverride = () => true;
  ss.state.qstate = { text: '12' };
  ss.timeout();
  const v = ss.view();
  assert.strictEqual(H.text(H.find(v, 'verdict')), 'Time is up');
  assert.strictEqual(H.find(v, 'timed-out'), null);
  assert.strictEqual(H.find(v, 'btn-override'), null);
  let boxes = 0;
  H.walk(v, (n) => { if (n.props && n.props['data-testid'] === 'feedback') boxes++; });
  assert.strictEqual(boxes, 1);
  assert.ok(H.find(v, 'expected'));
});

test('wrong typed answer keeps override when allowed', async () => {
  const { ss } = await start(PLAIN);
  ss.props.session.canOverride = () => true;
  ss.answer({ text: '12' }, '12');
  assert.ok(H.find(ss.view(), 'btn-override'));
});

test('hideText stimulus is revealed for correct, wrong and timed-out results', async () => {
  for (const kind of ['correct', 'wrong', 'timeout']) {
    const { ss } = await start(LISTEN);
    if (kind === 'timeout') { ss.state.qstate = { text: '' }; ss.timeout(); } else { const a = kind === 'correct' ? '87' : '12'; ss.answer({ text: a }, a); }
    const r = H.find(ss.view(), 'revealed-text');
    assert.ok(r, kind);
    assert.ok(H.text(r).includes('sample words'), kind);
  }
});

test('no reveal without hideText', async () => {
  const { ss } = await start(PLAIN);
  ss.answer({ text: '12' }, '12');
  assert.strictEqual(H.find(ss.view(), 'revealed-text'), null);
});

test('no reveal in exam mode', async () => {
  const { ss } = await start(LISTEN);
  ss.isExam = () => true;
  ss.answer({ text: '12' }, '12');
  assert.strictEqual(H.find(ss.view(), 'revealed-text'), null);
});

test('"Your answer" only for wrong answers whose parsed value differs from the typed text', async () => {
  const cases = [['12', false], ['  12 ', false], ['0012', true], ['87', false], ['087', false]];
  for (const [txt, shown] of cases) {
    const { ss } = await start(PLAIN);
    ss.state.qstate = { text: txt };
    ss.answer({ text: txt }, txt);
    const e = H.find(ss.view(), 'numeric-readAs');
    assert.strictEqual(!!e, shown, txt);
    if (e) assert.ok(H.text(e).startsWith('Your answer: 12'));
  }
});

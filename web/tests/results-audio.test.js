'use strict';
// Mutation: dropping timedOut in run-view recordGrade fails the label + guard tests.
const test = require('node:test');
const assert = require('node:assert');
const H = require('./app-harness.js');

const LISTEN = { id: 's1', text: 'sample words', hideText: true, speak: { lines: [{ text: 'sample words' }] } };
const T1 = { baseMs: 8000, adaptive: true, replays: 1 };
const item = { id: 'n1', unit: 'u1', type: 'numeric', prompt: 'How many?', answer: 87, stimulus: 's1' };
const course = { units: [{ id: 'u1', title: 'U1' }], timer: T1 };

async function render(review) {
  const m = await H.mount({ items: [item], stimuli: [LISTEN], course });
  const summary = { mode: 'practice', raw: 0, total: 1, pct: 0, durationMs: 0, review, skipped: [], fraction: 0, correct: 0, answered: 1 };
  return m.sb.DojoApp._Results({ t: m.t, byId: { n1: item }, stimuli: [LISTEN], course: { id: 'c', title: 'C', uiLanguage: 'en' }, go() {}, onAgain() {}, summary });
}

test('missed listening item renders a play control (button or notice)', async () => {
  const v = await render([{ id: 'n1', correct: false, given: '12', expected: '87' }]);
  assert.ok(H.find(v, 'missed-n1'));
  assert.ok(H.find(v, 'play-missed-wrap-n1'));
});

test('timed-out empty answer shows results.timed_out', async () => {
  const v = await render([{ id: 'n1', correct: false, given: '', expected: '87', timedOut: true }]);
  assert.strictEqual(H.text(H.find(v, 'timed-out-label')), 'time ran out, no answer');
  const v2 = await render([{ id: 'n1', correct: false, given: '', expected: '87' }]);
  assert.strictEqual(H.find(v2, 'timed-out-label'), null);
});

test('typed text survives timeout in summary.review with timedOut flag', async () => {
  const plain = { id: 'n1', unit: 'u1', type: 'numeric', prompt: 'How many?', answer: 87 };
  const m = await H.mount({ items: [plain], course });
  m.app.startMode('practice', { types: ['numeric'] });
  const ss = m.screen(m.sb.DojoApp._SessionScreen);
  ss.state.qstate = { text: '30' };
  ss.timeout();
  const sum = ss.props.session.finish();
  const r = sum.review.filter((e) => e.id === 'n1')[0];
  assert.strictEqual(String(r.given), '30');
  assert.strictEqual(r.timedOut, true);
});

// Mutation: dropping the isClipFlagged filter in results.js fails the flagged-clip test.
const CLIPS = { id: 's2', text: 'x', hideText: true, audio: ['c1', 'c2'], speak: { lines: [{ text: 'x' }] } };
async function renderClips(engine, review) {
  const m = await H.mount({ items: [item], stimuli: [CLIPS], course });
  m.sb.DojoAudio = { ready: () => true };
  const it = Object.assign({}, item, { stimulus: 's2' });
  const summary = { mode: 'practice', raw: 0, total: 1, pct: 0, durationMs: 0, review, skipped: [], fraction: 0, correct: 0, answered: 1 };
  const p = { t: m.t, byId: { n1: it }, stimuli: [CLIPS], engine, course: { id: 'c', title: 'C', uiLanguage: 'en' }, go() {}, onAgain() {}, summary };
  return { m, v: H.expand(m.sb.DojoApp._Results(p)) };
}
const REV = [{ id: 'n1', correct: false, given: '12', expected: '87' }];
const playNode = (v) => { let r = null; H.walk(v, (n) => { if (n.props.clip !== undefined && n.props.pid) r = n; }); return r; };

test('flagged clip excluded from Results play control', async () => {
  const { v } = await renderClips({ isClipFlagged: (id) => id === 'c1' }, REV);
  assert.deepStrictEqual(Array.from(playNode(v).props.clip.ids), ['c2']);
  const all = await renderClips({ isClipFlagged: () => true }, REV);
  const n = playNode(all.v);
  assert.ok(!n || !n.props.clip);
});

test('status failed renders audio.failed, unavailable stays speech.unavailable', async () => {
  const m = await H.mount({ items: [item], stimuli: [LISTEN], course });
  const P = m.sb.DojoCommon.Playback;
  const mk = (status) => H.text(H.expand(P({ audio: { status, t: m.t, cfg: {} }, lines: [], clip: null, testid: 'x' })));
  assert.strictEqual(mk('failed'), 'Audio could not be played.');
  assert.notStrictEqual(mk('unavailable'), mk('failed'));
});

test('two Results renders share no failed/played state', async () => {
  const a = await renderClips({ isClipFlagged: () => false }, REV);
  playNode(a.v).props.audio.onFail();
  playNode(a.v).props.audio.played.x = true;
  const b = await renderClips({ isClipFlagged: () => false }, REV);
  assert.notStrictEqual(playNode(b.v).props.audio.status, 'failed');
  assert.strictEqual(Object.keys(playNode(b.v).props.audio.played).length, 0);
});

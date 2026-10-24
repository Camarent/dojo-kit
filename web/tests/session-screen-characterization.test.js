'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const DojoWasm = require('../dojo-wasm.js');
const DojoSession = require('../session.js');
const { checkWasmFresh } = require('./loader.js');
const vm = require('node:vm');
const { loadBundle } = require('./load-bundle.js');

const NOW = 1760000000000;
const ITEMS = [
  { id: 'c1', unit: 'u', type: 'choice', prompt: 'Pick', options: ['A', 'B', 'C'], answer: 1, explanation: 'Because B', tags: ['t1'] },
  { id: 'g1', unit: 'u', type: 'gap', prompt: 'Fill', answers: ['x', 'xy'] }
];

function loadApp() {
  const sb = { console };
  loadBundle(sb, { skip: ['boot.js'] });
  return sb.DojoApp;
}
async function setup(type) {
  const App = loadApp();
  const dojo = await DojoWasm.load(fs.readFileSync(checkWasmFresh()));
  const doc = { v: 1, t: 0, items: {}, stats: { days: {}, newByDay: {} }, settings: {}, exams: {} };
  const store = { doc, status: 'ok', update(fn) { fn(doc); }, flush() {}, noteAnswer() {} };
  const course = { id: 'c', title: 'C', units: [{ id: 'u', title: 'U' }], dontKnow: true };
  const content = { v: 1, version: 't', lock: ITEMS.map((i) => i.id), items: ITEMS, course };
  const engine = DojoSession.createEngine({ dojo, store, content, now: () => NOW, today: () => '2025-10-09', random: () => 0.5 });
  const t = (k, v) => k + (v ? JSON.stringify(v) : '');
  const session = engine.start('practice', { types: [type] });
  const win = { addEventListener() {}, removeEventListener() {}, document: {} };
  const props = { t, session, now: () => NOW, win, course, byId: {}, dojo: null, content, store };
  const sc = new App._SessionScreen(props);
  sc.setState = function (p) { this.state = Object.assign({}, this.state, typeof p === 'function' ? p(this.state) : p); };
  sc.state = Object.assign({}, sc.state, { cur: session.current() });
  return { sc, session };
}
function ids(n, out) {
  out = out || [];
  if (Array.isArray(n)) { n.forEach((c) => ids(c, out)); return out; }
  if (!n || typeof n !== 'object' || !n.props) return out;
  if (n.props['data-testid']) out.push(n.props['data-testid']);
  ids(n.props.children, out);
  return out;
}
function txt(n) {
  if (Array.isArray(n)) return n.map(txt).join('');
  if (typeof n === 'string' || typeof n === 'number') return String(n);
  return n && n.props ? txt(n.props.children) : '';
}
function find(n, id) {
  if (Array.isArray(n)) { for (const c of n) { const r = find(c, id); if (r) return r; } return null; }
  if (!n || typeof n !== 'object' || !n.props) return null;
  return n.props['data-testid'] === id ? n : find(n.props.children, id);
}
const view = (sc) => sc.render(sc.props, sc.state);
const fb = (sc) => ids(sc.renderFeedback(sc.props, sc.state)).join(',');
const key = (k, extra) => Object.assign({ key: k, preventDefault() { this.prevented = true; }, target: {}, type: 'keydown' }, extra);

test('choice correct answer: feedback right, no override, no dont-know', async () => {
  const { sc } = await setup('choice');
  assert.ok(ids(view(sc)).includes('btn-dont-know'));
  sc.answer({ index: 1 }, 1);
  assert.strictEqual(sc.state.result.correct, true);
  assert.strictEqual(sc.state.answered, 1);
  assert.strictEqual(fb(sc), 'feedback,verdict,explanation');
  assert.strictEqual(txt(find(sc.renderFeedback(sc.props, sc.state), 'verdict')), 'session.correct');
  assert.ok(!ids(view(sc)).includes('btn-dont-know'));
});

test('choice wrong answer: expected, explanation, detail with tags', async () => {
  const { sc } = await setup('choice');
  sc.answer({ index: 0 }, 0);
  assert.strictEqual(sc.state.result.correct, false);
  assert.strictEqual(fb(sc), 'feedback,verdict,expected,explanation,feedback-detail,feedback-tags');
  assert.strictEqual(txt(find(sc.renderFeedback(sc.props, sc.state), 'feedback-tags')), 'T1');
  assert.strictEqual(txt(find(sc.renderFeedback(sc.props, sc.state), 'verdict')), 'session.wrong');
  assert.strictEqual(txt(find(sc.renderFeedback(sc.props, sc.state), 'expected')), 'session.expected B');
  const again = sc.state.answered;
  sc.answer({ index: 1 }, 1);
  assert.strictEqual(sc.state.answered, again);
});

test('gap wrong answer offers override; override marks correct once', async () => {
  const { sc, session } = await setup('gap');
  sc.answer({ text: 'xz' }, undefined);
  assert.strictEqual(sc.state.result.correct, false);
  assert.strictEqual(fb(sc), 'feedback,verdict,expected,btn-override');
  sc.overrideAnswer();
  assert.strictEqual(sc.state.result.correct, true);
  assert.strictEqual(fb(sc), 'feedback,verdict');
  assert.strictEqual(session.canOverride(), false);
  const r = sc.state.result;
  sc.overrideAnswer();
  assert.strictEqual(sc.state.result, r);
});

test('gap dont-know: wrong, no override button, button hidden afterwards', async () => {
  const { sc } = await setup('gap');
  assert.ok(ids(view(sc)).includes('btn-dont-know'));
  sc.dontKnowAnswer();
  assert.strictEqual(sc.state.result.correct, false);
  assert.strictEqual(sc.state.answered, 1);
  assert.strictEqual(fb(sc), 'feedback,verdict,expected');
  assert.ok(!ids(view(sc)).includes('btn-dont-know'));
  sc.dontKnowAnswer();
  assert.strictEqual(sc.state.answered, 1);
});

test('empty feedback slot without result; retry slot', async () => {
  const { sc } = await setup('gap');
  assert.strictEqual(fb(sc), '');
  sc.setState({ retry: true });
  assert.strictEqual(fb(sc), 'feedback-retry,retry-message');
  assert.strictEqual(ids(view(sc)).includes('btn-dont-know'), false);
});

test('keyboard: digit answers a choice; Enter/ArrowRight advance after a result', async () => {
  const { sc, session } = await setup('choice');
  const e = key('2');
  sc.onKey(e);
  assert.strictEqual(e.prevented, true);
  assert.strictEqual(sc.state.result.correct, true);
  const first = sc.state.cur;
  const arrow = key('ArrowDown');
  sc.onKey(arrow);
  assert.strictEqual(sc.state.cur, first);
  for (const k of ['ArrowRight', 'Enter']) {
    const s2 = await setup('choice');
    s2.sc.onKey(key('1'));
    const before = s2.sc.state.cur;
    const ev = key(k);
    s2.sc.onKey(ev);
    assert.strictEqual(ev.prevented, true, k);
    assert.ok(s2.sc.state.cur !== before || s2.sc.finishing, k);
  }
});

test('keyboard: Enter on a BUTTON or ArrowRight in INPUT does not advance', async () => {
  const { sc } = await setup('gap');
  sc.answer({ text: 'xz' });
  const cur = sc.state.cur;
  sc.onKey(key('Enter', { target: { tagName: 'BUTTON' } }));
  sc.onKey(key('ArrowRight', { target: { tagName: 'INPUT' } }));
  assert.strictEqual(sc.state.cur, cur);
});

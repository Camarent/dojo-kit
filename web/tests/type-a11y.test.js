'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadBundle } = require('./load-bundle.js');

const sb = { console };
sb.self = sb;
loadBundle(sb, { only: ['vendor/preact.min.js', 'vendor/htm.umd.js', 'types/registry.js', 'types/choice.js', 'types/multi.js', 'types/match.js', 'types/order.js', 'types/card.js', 'types/gap.js', 'types/numeric.js', 'types/cloze.js'] });

const t = (k) => k;
function walk(n, fn) {
  if (Array.isArray(n)) n.forEach((c) => walk(c, fn));
  else if (n && typeof n === 'object' && n.props) { fn(n); walk(n.props.children, fn); }
}
const marked = (v, attr) => { const o = []; walk(v, (n) => { if (n.props[attr] !== undefined) o.push(n); }); return o; };
const tid = (n) => n.props['data-testid'];

function q(type, view, state, extra) {
  const def = sb.DojoTypes.get(type);
  return def.Question(Object.assign({
    item: { answer: 0 }, view, result: null, picked: null, exam: false, t,
    state: state || def.initialState(view), setState() {}, onSubmit() {}, onReveal() {}
  }, extra));
}
const opts = { options: [{ index: 0, id: 'a', label: 'A' }, { index: 1, id: 'b', label: 'B' }] };

test('choice and multi autofocus the first option', () => {
  for (const type of ['choice', 'multi']) {
    const m = marked(q(type, opts), 'data-autofocus');
    assert.deepStrictEqual(m.map(tid), ['option-0']);
  }
});

test('match autofocuses the first select and labels every select', () => {
  const view = { lefts: [{ id: 0, label: 'L0' }, { id: 1, label: 'L1' }], rights: [{ id: 0, label: 'R0' }, { id: 1, label: 'R1' }] };
  const v = q('match', view);
  assert.deepStrictEqual(marked(v, 'data-autofocus').map(tid), ['match-select-0']);
  view.lefts.forEach((l, i) => {
    const s = []; walk(v, (n) => { if (tid(n) === 'match-select-' + i) s.push(n); });
    assert.strictEqual(s[0].props['aria-label'], l.label);
  });
});

const ov = { steps: [{ label: 'F', id: 'a' }, { label: 'S', id: 'b' }, { label: 'T', id: 'c' }] };
test('order: one autofocus initially; refocus follows placement', () => {
  assert.deepStrictEqual(marked(q('order', ov), 'data-autofocus').map(tid), ['order-item-0']);
  const re = (placed) => marked(q('order', ov, { placed, total: 3 }), 'data-refocus').map(tid);
  assert.deepStrictEqual(re(['a']), ['order-item-1']);
  assert.deepStrictEqual(re(['a', 'b']), ['order-item-2']);
  assert.deepStrictEqual(re(['a', 'b', 'c']), ['btn-submit']);
  assert.deepStrictEqual(marked(q('order', ov, { placed: ['a', 'b', 'c'], total: 3 }, { result: { correct: true } }), 'data-refocus').map(tid), ['order-placed-0']);
});

test('card: show button autofocus, again button refocus after reveal', () => {
  assert.deepStrictEqual(marked(q('card', {}), 'data-autofocus').map(tid), ['btn-show']);
  assert.deepStrictEqual(marked(q('card', { back: 'x' }), 'data-refocus').map(tid), ['btn-again']);
});

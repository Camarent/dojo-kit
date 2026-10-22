'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const fs = require('fs');
const vm = require('vm');

const web = path.join(__dirname, '..');
const sandbox = {};
sandbox.self = sandbox;
vm.createContext(sandbox);
['vendor/preact.min.js', 'vendor/htm.umd.js', 'types/registry.js', 'types/multi.js'].forEach((f) =>
  vm.runInContext(fs.readFileSync(path.join(web, f), 'utf8'), sandbox, { filename: f }));
const def = sandbox.DojoTypes.get('multi');

const view = { options: [
  { id: 0, label: 'A' }, { id: 1, label: 'B' }, { id: 2, label: 'C' }, { id: 3, label: 'D' }
] };
const same = (a, b) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), b);
const t = (k) => k;

function props(over) {
  return Object.assign({ item: {}, view, result: null, picked: null, exam: false, t,
    state: { selected: [] }, setState() {}, onSubmit() {} }, over);
}
function find(v, pred, out) {
  out = out || [];
  if (Array.isArray(v)) { v.forEach((c) => find(c, pred, out)); return out; }
  if (!v || typeof v !== 'object') return out;
  if (v.props && pred(v)) out.push(v);
  if (v.props) find(v.props.children, pred, out);
  return out;
}
const byId = (v, id) => find(v, (n) => n.props['data-testid'] === id)[0];
const text = (v) => JSON.stringify(v);

test('initialState and canSubmit need a selection', () => {
  same(def.initialState(view), { selected: [] });
  assert.strictEqual(def.canSubmit({ selected: [] }), false);
  assert.strictEqual(def.canSubmit({ selected: [2] }), true);
});

test('renders container, options, hint and submit', () => {
  const v = def.Question(props());
  assert.ok(byId(v, 'options'));
  for (let i = 0; i < 4; i++) assert.strictEqual(byId(v, 'option-' + i).props['aria-pressed'], 'false');
  assert.ok(byId(v, 'multi-hint'));
  assert.ok(text(v).includes('q.multi.hint'));
  const b = byId(v, 'btn-submit');
  assert.strictEqual(b.props.disabled, true);
  assert.ok(text(v).includes('session.check'));
});

test('tap toggles via setState and marks pressed with a visible check', () => {
  let patch = null;
  const v = def.Question(props({ state: { selected: [1] }, setState: (p) => { patch = p; } }));
  byId(v, 'option-0').props.onClick();
  same(patch, { selected: [1, 0] });
  byId(v, 'option-1').props.onClick();
  same(patch, { selected: [] });
  assert.strictEqual(byId(v, 'option-1').props['aria-pressed'], 'true');
  assert.ok(text(byId(v, 'option-1')).includes('✓'));
  assert.ok(!text(byId(v, 'option-0')).includes('✓'));
  assert.strictEqual(byId(v, 'btn-submit').props.disabled, false);
});

test('submit sends {ids} with the selected position ids', () => {
  let got = null;
  const v = def.Question(props({ state: { selected: [2, 0] }, onSubmit: (i, p) => { got = [i, p]; } }));
  byId(v, 'btn-submit').props.onClick();
  same(got, [{ ids: [2, 0] }, [2, 0]]);
});

test('digit keys toggle options and never submit', () => {
  let patch = null;
  const p = props({ state: { selected: [0] }, setState: (x) => { patch = x; } });
  assert.strictEqual(def.onKey({ key: '2', target: {} }, p), null);
  same(patch, { selected: [0, 1] });
  def.onKey({ key: '1', target: {} }, p);
  same(patch, { selected: [] });
  patch = null;
  def.onKey({ key: '9', target: {} }, p);
  def.onKey({ key: 'a', target: {} }, p);
  def.onKey({ key: '1', target: { tagName: 'INPUT' } }, p);
  def.onKey({ key: '1', target: {} }, props({ result: { correct: true } }));
  assert.strictEqual(patch, null);
});

const result = { correct: false, detail: { missing: ['C'], extra: ['B'] } };

test('answered: read-only, selection kept, right and wrong marked', () => {
  const v = def.Question(props({ result, state: { selected: [0, 1] }, picked: [0, 1] }));
  assert.strictEqual(byId(v, 'multi-hint'), undefined);
  assert.strictEqual(byId(v, 'option-0').props.disabled, true);
  assert.strictEqual(byId(v, 'btn-submit').props.disabled, true);
  assert.strictEqual(byId(v, 'option-0').props['aria-pressed'], 'true');
  assert.ok(byId(v, 'option-0').props.class.includes('right'));
  assert.ok(byId(v, 'option-1').props.class.includes('wrong'));
  assert.ok(byId(v, 'option-2').props.class.includes('right'));
  assert.ok(!/right|wrong/.test(byId(v, 'option-3').props.class));
});

test('exam mode shows only the selection', () => {
  const v = def.Question(props({ exam: true, result: { recorded: true }, state: { selected: [1] } }));
  assert.ok(byId(v, 'option-1').props.class.includes('picked'));
  assert.ok(!/right|wrong/.test(text([0, 1, 2, 3].map((i) => byId(v, 'option-' + i).props.class))));
});

test('Extra lists missing and extra only when non-empty', () => {
  const v = def.Extra({ result, t });
  assert.ok(text(v).includes('q.result.missing') && text(v).includes('q.result.extra'));
  const none = def.Extra({ result: { detail: { missing: [], extra: [] } }, t });
  assert.ok(!text(none).includes('q.result'));
  assert.ok(!text(def.Extra({ result: { detail: { missing: ['C'], extra: [] } }, t })).includes('q.result.extra'));
});

test('no vnode uses dangerouslySetInnerHTML', () => {
  assert.ok(!text(def.Question(props({ result, state: { selected: [0] } }))).includes('dangerouslySetInnerHTML'));
});

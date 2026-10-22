'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { loadBundle } = require('./load-bundle.js');

const web = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(web, p), 'utf8');
const en = JSON.parse(read('i18n/en.json'));

const sandbox = { console };
loadBundle(sandbox, { only: ['vendor/preact.min.js', 'vendor/htm.umd.js', 'types/registry.js', 'types/cloze.js'] });
const def = sandbox.DojoTypes.get('cloze');

const same = (a, b) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), b);
const t = (k, v) => String(en[k]).replace(/\{(\w+)\}/g, (_, n) => v[n]);
const view = { segments: [{ text: 'A ' }, { blank: 0 }, { text: ' and ' }, { blank: 1 }], blanks: 2 };

function props(extra) {
  return Object.assign({ item: { type: 'cloze' }, view, result: null, picked: null, exam: false, t,
    state: def.initialState(view), setState() {}, onSubmit() {}, onReveal() {}, inputRef() {} }, extra);
}
function find(node, pred, out) {
  out = out || [];
  if (Array.isArray(node)) node.forEach((c) => find(c, pred, out));
  else if (node && node.props) {
    if (pred(node)) out.push(node);
    find(node.props.children, pred, out);
  }
  return out;
}
const byTestId = (node, id) => find(node, (n) => n.props['data-testid'] === id);
const inputs = (node) => find(node, (n) => n.type === 'input');
const marks = (node) => find(node, (n) => n.props.role === 'img');
const enter = (id) => ({ key: 'Enter', target: { id, ownerDocument: { getElementById: (i) => { enter.focused = i; return { focus() { enter.focused = i; } }; } } }, preventDefault() {} });

test('registered with state sized to blanks and canSubmit needing every blank', () => {
  same(def.initialState(view), { inputs: ['', ''] });
  assert.strictEqual(def.canSubmit({ inputs: ['a', ' '] }), false);
  assert.strictEqual(def.canSubmit({ inputs: ['a', 'b'] }), true);
});

test('renders text segments, hint and one attribute-complete input per blank', () => {
  const v = def.Question(props());
  const ins = inputs(v);
  assert.deepStrictEqual(ins.map((i) => i.props['data-testid']), ['cloze-input-0', 'cloze-input-1']);
  assert.deepStrictEqual(ins.map((i) => i.props['aria-label']), ['Blank 1', 'Blank 2']);
  const p0 = ins[0].props;
  assert.strictEqual(p0.autocomplete, 'off');
  assert.strictEqual(p0.autocapitalize, 'off');
  assert.strictEqual(p0.autocorrect, 'off');
  assert.strictEqual(p0.spellcheck, false);
  assert.strictEqual(byTestId(v, 'cloze').length, 1);
  assert.strictEqual(find(v, (n) => n.props.children === en['q.cloze.hint']).length, 1);
  assert.strictEqual(find(v, (n) => n.type === 'span' && n.props.children === 'A ').length, 1);
});

test('input width grows with content', () => {
  const short = inputs(def.Question(props()))[0].props.style.width;
  const long = inputs(def.Question(props({ state: { inputs: ['x'.repeat(30), ''] } })))[0].props.style.width;
  assert.ok(parseInt(long, 10) > parseInt(short, 10));
});

test('typing updates only that blank through setState', () => {
  let patch = null;
  const v = def.Question(props({ state: { inputs: ['a', 'b'] }, setState(p) { patch = p; } }));
  inputs(v)[1].props.onInput({ target: { value: 'z' } });
  same(patch, { inputs: ['a', 'z'] });
});

test('submit button sends {inputs} and is disabled until all blanks are filled', () => {
  let got = null;
  const empty = byTestId(def.Question(props()), 'btn-submit')[0];
  assert.strictEqual(empty.props.disabled, true);
  const v = def.Question(props({ state: { inputs: ['a', 'b'] }, onSubmit(i, p) { got = [i, p]; } }));
  const btn = byTestId(v, 'btn-submit')[0];
  assert.strictEqual(btn.props.disabled, false);
  btn.props.onClick();
  same(got, [{ inputs: ['a', 'b'] }, ['a', 'b']]);
});

test('answered non-exam: read-only inputs with labelled right/wrong marks', () => {
  const v = def.Question(props({ state: { inputs: ['a', 'b'] }, result: { correct: false, expected: 'x', detail: { results: [true, false] } } }));
  assert.ok(inputs(v).every((i) => i.props.readOnly === true));
  assert.deepStrictEqual(marks(v).map((m) => m.props['aria-label']), [en['q.result.blankRight'], en['q.result.blankWrong']]);
  assert.deepStrictEqual(marks(v).map((m) => m.props.children), ['✓', '✗']);
  assert.strictEqual(byTestId(v, 'btn-submit').length, 0);
});

test('answered exam: read-only inputs and no marks', () => {
  const v = def.Question(props({ exam: true, result: { recorded: true } }));
  assert.ok(inputs(v).every((i) => i.props.readOnly === true));
  assert.strictEqual(marks(v).length, 0);
});

test('Enter in a blank focuses the next one, in the last submits only when all filled', () => {
  assert.strictEqual(def.onKey(enter('cloze-input-0'), props()), null);
  assert.strictEqual(enter.focused, 'cloze-input-1');
  assert.strictEqual(def.onKey(enter('cloze-input-1'), props()), null);
  const hit = def.onKey(enter('cloze-input-1'), props({ state: { inputs: ['a', 'b'] } }));
  same(hit, { input: { inputs: ['a', 'b'] }, picked: ['a', 'b'] });
});

test('onKey ignores other keys, other targets and answered questions', () => {
  const full = { state: { inputs: ['a', 'b'] } };
  assert.strictEqual(def.onKey(Object.assign(enter('cloze-input-1'), { key: 'a' }), props(full)), null);
  assert.strictEqual(def.onKey(enter('other'), props(full)), null);
  assert.strictEqual(def.onKey(enter('cloze-input-1'), props(Object.assign({ result: { correct: true } }, full))), null);
});

test('cloze registers no Extra block (the expected text comes from the shared feedback)', () => {
  assert.strictEqual(def.Extra, undefined);
});

test('two-blank cloze renders two .cloze-group elements, each containing exactly one input', () => {
  const view2 = { segments: [{ text: 'A ' }, { blank: 0 }, { text: ' B ' }, { blank: 1 }], blanks: 2 };
  const v = def.Question(props({ view: view2, state: def.initialState(view2) }));
  const groups = find(v, (n) => n.props && n.props.class === 'cloze-group');
  assert.strictEqual(groups.length, 2);
  const groupInputs = groups.map((g) => find(g, (n) => n.type === 'input').length);
  assert.deepStrictEqual(groupInputs, [1, 1]);
});

test('one-blank cloze still renders one p.cloze-sentence with no .cloze-group nesting change', () => {
  const view1 = { segments: [{ text: 'A ' }, { blank: 0 }, { text: ' B' }], blanks: 1 };
  const v = def.Question(props({ view: view1, state: def.initialState(view1) }));
  const sentences = find(v, (n) => n.type === 'p' && n.props.class === 'cloze-sentence');
  assert.strictEqual(sentences.length, 1);
  const groups = find(v, (n) => n.props && n.props.class === 'cloze-group');
  assert.strictEqual(groups.length, 0);
});

test('CSS text contains max-width:100% for .cloze-field and flex-wrap on the group rule', () => {
  const css = read('styles/types-cloze.css');
  assert.ok(css.includes('.cloze-field {') || css.includes('\n.cloze-field {'));
  assert.ok(css.includes('max-width:100%') || css.includes('max-width: 100%'));
  assert.ok(css.includes('min-width: 6ch') || css.includes('min-width:6ch'));
  assert.ok(css.includes('.cloze-group'));
  assert.ok(css.includes('flex-wrap'));
});

test('Enter moves focus from input 0 to input 1 (still works)', () => {
  const view2 = { segments: [{ text: 'A ' }, { blank: 0 }, { text: ' B ' }, { blank: 1 }], blanks: 2 };
  const result = def.onKey(enter('cloze-input-0'), props({ view: view2, state: def.initialState(view2) }));
  assert.strictEqual(result, null);
  assert.strictEqual(enter.focused, 'cloze-input-1');
});

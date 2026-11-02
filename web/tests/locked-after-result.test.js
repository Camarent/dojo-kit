'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadBundle } = require('./load-bundle.js');

// Load type components directly
function loadType(typeName) {
  const sb = { console };
  loadBundle(sb, { only: ['vendor/preact.min.js', 'vendor/htm.umd.js', 'types/registry.js', `types/${typeName}.js`] });
  return sb.DojoTypes.get(typeName);
}

// Helper to find a node with a specific testid in the vnode tree
function findTestId(vnode, testid) {
  if (!vnode || typeof vnode !== 'object') return null;
  if (vnode.props && vnode.props['data-testid'] === testid) return vnode;
  if (vnode.props && vnode.props.children) {
    const children = Array.isArray(vnode.props.children) ? vnode.props.children : [vnode.props.children];
    for (const child of children) {
      const found = findTestId(child, testid);
      if (found) return found;
    }
  }
  return null;
}

// Helper to find all nodes with a specific testid pattern
function findAllTestId(vnode, testidPattern) {
  const results = [];
  if (!vnode || typeof vnode !== 'object') return results;
  if (vnode.props && vnode.props['data-testid'] && testidPattern.test(vnode.props['data-testid'])) {
    results.push(vnode);
  }
  if (vnode.props && vnode.props.children) {
    const children = Array.isArray(vnode.props.children) ? vnode.props.children : [vnode.props.children];
    for (const child of children) {
      results.push(...findAllTestId(child, testidPattern));
    }
  }
  return results;
}

const t = (k, v) => 'translated-' + k + (v ? JSON.stringify(v) : '');

test('gap item answered -> input readOnly true and aria-readonly true, no btn-submit, btn-next present', () => {
  const def = loadType('gap');
  const state = { text: 'test' };
  const setState = () => {};
  const onSubmit = () => {};
  const result = { correct: true };
  const props = { view: {}, result, exam: false, t, state, setState, onSubmit, inputRef: null };
  const vnode = def.Question(props);
  
  // After result, input should be readOnly and have aria-readonly
  const gapInput = findTestId(vnode, 'gap-input');
  assert.ok(gapInput, 'gap-input should exist');
  assert.strictEqual(gapInput.props.readOnly, true, 'gap input should be readOnly after result');
  assert.strictEqual(gapInput.props['aria-readonly'], 'true', 'gap input should have aria-readonly="true" after result');
  
  // Check button should not be present
  assert.strictEqual(findTestId(vnode, 'btn-submit'), null, 'btn-submit should not be present after result');
});

test('gap item unanswered -> input editable, btn-submit present', () => {
  const def = loadType('gap');
  const state = { text: '' };
  const setState = () => {};
  const onSubmit = () => {};
  const result = null;
  const props = { view: {}, result, exam: false, t, state, setState, onSubmit, inputRef: null };
  const vnode = def.Question(props);
  
  const gapInput = findTestId(vnode, 'gap-input');
  assert.ok(gapInput, 'gap-input should exist');
  assert.strictEqual(gapInput.props.readOnly, false, 'gap input should be editable when unanswered');
  assert.ok(findTestId(vnode, 'btn-submit'), 'btn-submit should be present when unanswered');
});

test('numeric item answered -> input readOnly true and aria-readonly true, no btn-submit', () => {
  const def = loadType('numeric');
  const state = { text: '4' };
  const setState = () => {};
  const onSubmit = () => {};
  const result = { correct: true };
  const props = { view: { unitLabel: null }, result, exam: false, t, state, setState, onSubmit, inputRef: null };
  const vnode = def.Question(props);
  
  // After result, input should be readOnly and have aria-readonly
  const numInput = findTestId(vnode, 'numeric-input');
  assert.ok(numInput, 'numeric-input should exist');
  assert.strictEqual(numInput.props.readOnly, true, 'numeric input should be readOnly after result');
  assert.strictEqual(numInput.props['aria-readonly'], 'true', 'numeric input should have aria-readonly="true" after result');
  
  // Check button should not be present
  assert.strictEqual(findTestId(vnode, 'btn-submit'), null, 'btn-submit should not be present after result for numeric');
});

test('numeric item unanswered -> input editable, btn-submit present', () => {
  const def = loadType('numeric');
  const state = { text: '' };
  const setState = () => {};
  const onSubmit = () => {};
  const result = null;
  const props = { view: { unitLabel: null }, result, exam: false, t, state, setState, onSubmit, inputRef: null };
  const vnode = def.Question(props);
  
  const numInput = findTestId(vnode, 'numeric-input');
  assert.ok(numInput, 'numeric-input should exist');
  assert.strictEqual(numInput.props.readOnly, false, 'numeric input should be editable when unanswered');
  assert.ok(findTestId(vnode, 'btn-submit'), 'btn-submit should be present when unanswered for numeric');
});

test('cloze item answered -> inputs readOnly true and aria-readonly true, no btn-submit', () => {
  const def = loadType('cloze');
  const state = { inputs: ['A', 'B'] };
  const setState = () => {};
  const onSubmit = () => {};
  const result = { correct: true, detail: { results: [true, true] } };
  const props = { view: { segments: [{ text: 'Fill: ' }, { blank: 0 }, { text: ' and ' }, { blank: 1 }], blanks: 2 }, result, exam: false, t, state, setState, onSubmit, inputRef: null };
  const vnode = def.Question(props);
  
  // After result, inputs should be readOnly and have aria-readonly
  const clozeInputs = findAllTestId(vnode, /^cloze-input-/);
  assert.ok(clozeInputs.length > 0, 'cloze inputs should exist after result');
  assert.strictEqual(clozeInputs[0].props.readOnly, true, 'cloze input should be readOnly after result');
  assert.strictEqual(clozeInputs[0].props['aria-readonly'], 'true', 'cloze input should have aria-readonly="true" after result');
  
  // Check button should not be present
  assert.strictEqual(findTestId(vnode, 'btn-submit'), null, 'btn-submit should not be present after result for cloze');
});

test('cloze item unanswered -> inputs editable, btn-submit present', () => {
  const def = loadType('cloze');
  const state = { inputs: ['', ''] };
  const setState = () => {};
  const onSubmit = () => {};
  const result = null;
  const props = { view: { segments: [{ text: 'Fill: ' }, { blank: 0 }, { text: ' and ' }, { blank: 1 }], blanks: 2 }, result, exam: false, t, state, setState, onSubmit, inputRef: null };
  const vnode = def.Question(props);
  
  const clozeInputs = findAllTestId(vnode, /^cloze-input-/);
  assert.ok(clozeInputs.length > 0, 'cloze inputs should exist');
  assert.strictEqual(clozeInputs[0].props.readOnly, false, 'cloze input should be editable when unanswered');
  assert.ok(findTestId(vnode, 'btn-submit'), 'btn-submit should be present when unanswered for cloze');
});

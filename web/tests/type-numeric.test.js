'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const web = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(web, p), 'utf8');

function load() {
  const sandbox = { console };
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  ['vendor/preact.min.js', 'vendor/htm.umd.js', 'types/registry.js', 'types/numeric.js'].forEach((f) => vm.runInContext(read(f), sandbox, { filename: f }));
  return sandbox.DojoTypes.get('numeric');
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

// Helper to find all nodes with a specific testid
function findAllTestId(vnode, testid) {
  const results = [];
  if (!vnode || typeof vnode !== 'object') return results;
  if (vnode.props && vnode.props['data-testid'] === testid) results.push(vnode);
  if (vnode.props && vnode.props.children) {
    const children = Array.isArray(vnode.props.children) ? vnode.props.children : [vnode.props.children];
    for (const child of children) {
      results.push(...findAllTestId(child, testid));
    }
  }
  return results;
}

// Helper to check if vnode has a specific prop with a value
function hasProp(vnode, prop, value) {
  if (!vnode || !vnode.props) return false;
  if (value === undefined) return Object.prototype.hasOwnProperty.call(vnode.props, prop);
  return vnode.props[prop] === value;
}

test('initialState returns empty text', () => {
  const def = load();
  const state = def.initialState({ unitLabel: null });
  assert.ok(state.text === '', 'text should be empty string');
});

test('canSubmit returns false when text is empty or whitespace', () => {
  const def = load();
  assert.strictEqual(def.canSubmit({ text: '' }), false);
  assert.strictEqual(def.canSubmit({ text: '   ' }), false);
});

test('canSubmit returns true when text is non-empty after trim', () => {
  const def = load();
  assert.strictEqual(def.canSubmit({ text: '42' }), true);
  assert.strictEqual(def.canSubmit({ text: ' 42 ' }), true);
  assert.strictEqual(def.canSubmit({ text: '3.14' }), true);
});

test('Question renders numeric-input with correct attributes', () => {
  const def = load();
  const t = (k, v) => 'translated-' + k + (v ? JSON.stringify(v) : '');
  const state = { text: '' };
  const setState = () => {};
  const onSubmit = () => {};
  const props = { view: { unitLabel: null }, result: null, exam: false, t, state, setState, onSubmit, inputRef: null };
  const vnode = def.Question(props);
  
  const input = findTestId(vnode, 'numeric-input');
  assert.ok(input, 'numeric-input not found');
  assert.strictEqual(input.type, 'input');
  assert.strictEqual(input.props.inputmode, 'decimal');
  assert.strictEqual(input.props.autocomplete, 'off');
  assert.strictEqual(input.props.autocapitalize, 'off');
  assert.strictEqual(input.props.autocorrect, 'off');
  assert.strictEqual(input.props.spellcheck, false);
  assert.strictEqual(input.props['aria-label'], 'translated-session.your_answer');
});

test('Question renders unit label when present', () => {
  const def = load();
  const t = (k, v) => 'translated-' + k;
  const state = { text: '' };
  const setState = () => {};
  const onSubmit = () => {};
  const props = { view: { unitLabel: 'kg' }, result: null, exam: false, t, state, setState, onSubmit, inputRef: null };
  const vnode = def.Question(props);
  
  // Find the unit label span
  const hasUnitLabel = findInVnode(vnode, (n) => {
    return n && n.type === 'span' && n.props && n.props.children && n.props.children.includes('kg');
  });
  assert.ok(hasUnitLabel, 'unit label not rendered');
});

test('Question does not render unit label when null', () => {
  const def = load();
  const t = (k, v) => 'translated-' + k;
  const state = { text: '' };
  const setState = () => {};
  const onSubmit = () => {};
  const props = { view: { unitLabel: null }, result: null, exam: false, t, state, setState, onSubmit, inputRef: null };
  const vnode = def.Question(props);
  
  // Check that no span with unit-label class exists
  const hasUnitLabel = findInVnode(vnode, (n) => {
    return n && n.type === 'span' && n.props && n.props.class && n.props.class.includes('unit-label');
  });
  assert.strictEqual(hasUnitLabel, null, 'unit label should not be rendered when null');
});

test('Question submits on form submit with correct input shape', () => {
  const def = load();
  const t = (k, v) => 'translated-' + k;
  let submitted = null;
  const state = { text: '' };
  const setState = (patch) => { Object.assign(state, patch); };
  const onSubmit = (input, picked) => { submitted = { input, picked }; };
  const props = { view: { unitLabel: null }, result: null, exam: false, t, state, setState, onSubmit, inputRef: null };
  const vnode = def.Question(props);
  
  // Find the form and its onSubmit
  const form = findInVnode(vnode, (n) => n && n.type === 'form');
  assert.ok(form, 'form not found');
  assert.ok(form.props.onSubmit, 'form onSubmit not found');
  
  // Simulate empty text - should not submit
  form.props.onSubmit({ preventDefault: () => {} });
  assert.strictEqual(submitted, null, 'should not submit empty text');
  
  // Now set text and submit
  setState({ text: '42' });
  const filled = findInVnode(def.Question(props), (n) => n && n.type === 'form');
  filled.props.onSubmit({ preventDefault: () => {} });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(submitted)), { input: { text: '42' }, picked: '42' }, 'onSubmit should be called with {text} and picked value');
});

test('Question input is read-only after answer', () => {
  const def = load();
  const t = (k, v) => 'translated-' + k;
  const state = { text: '42' };
  const setState = () => {};
  const onSubmit = () => {};
  const props = { view: { unitLabel: null }, result: { correct: true, expected: '42', explanation: '', detail: { parsed: 42 } }, exam: false, t, state, setState, onSubmit, inputRef: null };
  const vnode = def.Question(props);
  
  const input = findTestId(vnode, 'numeric-input');
  assert.ok(input, 'numeric-input not found');
  assert.strictEqual(input.props.readOnly, true, 'input should be readOnly=true');
});

test('Question shows right state class when correct', () => {
  const def = load();
  const t = (k, v) => 'translated-' + k;
  const state = { text: '42' };
  const setState = () => {};
  const onSubmit = () => {};
  const props = { view: { unitLabel: null }, result: { correct: true, expected: '42', explanation: '', detail: { parsed: 42 } }, exam: false, t, state, setState, onSubmit, inputRef: null };
  const vnode = def.Question(props);
  
  const input = findTestId(vnode, 'numeric-input');
  assert.ok(input, 'numeric-input not found');
  const className = input.props.class;
  assert.ok(className && className.includes('right'), 'input should have right class when correct');
});

test('Question shows wrong state class when incorrect', () => {
  const def = load();
  const t = (k, v) => 'translated-' + k;
  const state = { text: '42' };
  const setState = () => {};
  const onSubmit = () => {};
  const props = { view: { unitLabel: null }, result: { correct: false, expected: '100', explanation: '', detail: { parsed: 42 } }, exam: false, t, state, setState, onSubmit, inputRef: null };
  const vnode = def.Question(props);
  
  const input = findTestId(vnode, 'numeric-input');
  assert.ok(input, 'numeric-input not found');
  const className = input.props.class;
  assert.ok(className && className.includes('wrong'), 'input should have wrong class when incorrect');
});

test('Question does not show state class in exam mode', () => {
  const def = load();
  const t = (k, v) => 'translated-' + k;
  const state = { text: '42' };
  const setState = () => {};
  const onSubmit = () => {};
  const props = { view: { unitLabel: null }, result: { recorded: true }, exam: true, t, state, setState, onSubmit, inputRef: null };
  const vnode = def.Question(props);
  
  const input = findTestId(vnode, 'numeric-input');
  assert.ok(input, 'numeric-input not found');
  const className = input.props.class;
  assert.ok(!className || (!className.includes('right') && !className.includes('wrong')), 'input should not have state class in exam mode');
});

test('Extra shows readAs when parsed is not null', () => {
  const def = load();
  const t = (k, v) => k === 'q.numeric.readAs' ? 'Read as {value}' : 'translated-' + k;
  const result = { correct: true, expected: '42', explanation: '', detail: { parsed: 42 } };
  const props = { result, exam: false, t };
  const vnode = def.Extra(props);
  
  assert.ok(vnode !== null, 'Extra should render');
  assert.strictEqual(vnode.type, 'p', 'Extra should be a paragraph');
  assert.strictEqual(vnode.props['data-testid'], 'numeric-readAs', 'should have numeric-readAs testid');
});

test('Extra shows invalid when parsed is null', () => {
  const def = load();
  const t = (k, v) => k === 'q.numeric.invalid' ? 'That is not a valid number.' : 'translated-' + k;
  const result = { correct: false, expected: '42', explanation: '', detail: { parsed: null } };
  const props = { result, exam: false, t };
  const vnode = def.Extra(props);
  
  assert.ok(vnode !== null, 'Extra should render');
  assert.strictEqual(vnode.type, 'p', 'Extra should be a paragraph');
  assert.strictEqual(vnode.props['data-testid'], 'numeric-invalid', 'should have numeric-invalid testid');
});

test('Extra shows nothing in exam mode', () => {
  const def = load();
  const t = (k, v) => 'translated-' + k;
  const result = { recorded: true };
  const props = { result, exam: true, t };
  const vnode = def.Extra(props);
  assert.strictEqual(vnode, null, 'Extra should be null in exam mode');
});

test('Extra shows nothing when detail is missing', () => {
  const def = load();
  const t = (k, v) => 'translated-' + k;
  const result = { correct: true, expected: '42', explanation: '' };
  const props = { result, exam: false, t };
  const vnode = def.Extra(props);
  assert.strictEqual(vnode, null, 'Extra should be null when detail is missing');
});

test('no vnode uses dangerouslySetInnerHTML', () => {
  const def = load();
  const t = (k, v) => 'translated-' + k;
  const state = { text: '' };
  const setState = () => {};
  const onSubmit = () => {};
  const props = { view: { unitLabel: 'kg' }, result: null, exam: false, t, state, setState, onSubmit, inputRef: null };
  const vnode = def.Question(props);
  
  const hasDangerous = findInVnode(vnode, (n) => {
    return n && n.props && Object.prototype.hasOwnProperty.call(n.props, 'dangerouslySetInnerHTML');
  });
  assert.strictEqual(hasDangerous, null, 'Question should not use dangerouslySetInnerHTML');
  
  const result = { correct: true, expected: '42', explanation: '', detail: { parsed: 42 } };
  const extra = def.Extra({ result, exam: false, t });
  if (extra) {
    const extraHasDangerous = findInVnode(extra, (n) => {
      return n && n.props && Object.prototype.hasOwnProperty.call(n.props, 'dangerouslySetInnerHTML');
    });
    assert.strictEqual(extraHasDangerous, null, 'Extra should not use dangerouslySetInnerHTML');
  }
});

// Generic helper to search vnode tree
function findInVnode(vnode, predicate) {
  if (!vnode || typeof vnode !== 'object') return null;
  if (predicate(vnode)) return vnode;
  if (vnode.props && vnode.props.children) {
    const children = Array.isArray(vnode.props.children) ? vnode.props.children : [vnode.props.children];
    for (const child of children) {
      const found = findInVnode(child, predicate);
      if (found) return found;
    }
  }
  return null;
}

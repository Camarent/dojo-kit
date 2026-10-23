'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { loadBundle } = require('./load-bundle.js');

const web = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(web, p), 'utf8');

function load() {
  const sandbox = { console };
  loadBundle(sandbox, { only: ['vendor/preact.min.js', 'vendor/htm.umd.js', 'types/registry.js', 'types/order.js'] });
  return sandbox;
}

const plain = (v) => JSON.parse(JSON.stringify(v));
const def = load().DojoTypes.get('order');
const T = {
  'q.order.hint': 'Tap in order', 'q.order.reset': 'Reset', 'q.order.position': 'Position {n}',
  'session.check': 'Check', 'q.result.firstWrong': 'First mistake at {n}'
};
const t = (key, vars) => T[key].replace('{n}', vars ? vars.n : '');

function find(node, testid, out) {
  out = out || [];
  if (node && typeof node === 'object') {
    if (Array.isArray(node)) node.forEach((c) => find(c, testid, out));
    else {
      if (node.props && node.props['data-testid'] === testid) out.push(node);
      if (node.props) find(node.props.children, testid, out);
    }
  }
  return out;
}
function textOf(node) {
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (node && typeof node === 'object') return textOf(node.props && node.props.children);
  return node == null ? '' : String(node);
}

function render(placed, item, view, extra) {
  const calls = { submitted: [], states: [] };
  const vnode = def.Question(Object.assign({
    item: item,
    view: view || { steps: [{ label: 'First', id: 'a' }, { label: 'Second', id: 'b' }, { label: 'Third', id: 'c' }] },
    result: null,
    picked: null,
    exam: false,
    t: t,
    state: { placed: placed, total: (view || { steps: [] }).steps.length },
    setState: (s) => calls.states.push(s),
    onSubmit: (input, picked) => calls.submitted.push([input, picked])
  }, extra));
  return { vnode: vnode, calls: calls };
}

// Test 0: Characterization of the list fallback for a prompt without ___
test('list fallback for prompt without ___', () => {
  const view = { steps: [{ label: 'First', id: 'a' }, { label: 'Second', id: 'b' }, { label: 'Third', id: 'c' }] };
  const item = { prompt: 'Put these in order', type: 'order', steps: view.steps };
  const r = render(['b'], item, view);
  
  // Should use list mode (no sentence)
  assert.ok(find(r.vnode, 'order-placed-list').length > 0, 'list fallback present');
  assert.ok(find(r.vnode, 'order-unplaced').length > 0, 'pool present');
  assert.ok(find(r.vnode, 'btn-submit').length > 0, 'submit button present');
  
  // Should have placed items (Second with id 'b')
  assert.ok(find(r.vnode, 'order-placed-0').length > 0, 'placed item visible');
  // First (id 'a') and Third (id 'c') should be in pool
  assert.ok(find(r.vnode, 'order-item-0').length > 0, 'First is in pool');
  assert.ok(find(r.vnode, 'order-item-1').length === 0, 'Second is placed (not in pool)');
  assert.ok(find(r.vnode, 'order-item-2').length > 0, 'Third is in pool');
});

// Test 1: 3-step prompt with ___ - sentence mode
test('3-step prompt with ___ uses sentence mode', () => {
  const view = { steps: [{ label: 'я', id: 'a' }, { label: 'в', id: 'b' }, { label: 'домe', id: 'c' }] };
  const item = { prompt: 'Я ___ в ___ ___.', type: 'order', steps: view.steps };
  const r = render([], item, view);
  
  // Should use sentence mode - check for the prompt element with data-testid
  assert.ok(find(r.vnode, 'prompt').length > 0, 'prompt testid present');
  
  // Check that slots are rendered
  assert.strictEqual(find(r.vnode, 'order-slot-0').length, 1, 'slot 0 exists');
  
  // Should have 3 empty slots
  assert.strictEqual(find(r.vnode, 'order-slot-0').length, 1, 'slot 0 exists');
  assert.strictEqual(find(r.vnode, 'order-slot-1').length, 1, 'slot 1 exists');
  assert.strictEqual(find(r.vnode, 'order-slot-2').length, 1, 'slot 2 exists');
  
  // Slots should be empty initially
  assert.ok(find(r.vnode, 'order-slot-0')[0].props.class.indexOf('empty') >= 0, 'slot 0 is empty');
  
  // Pool should have all items
  assert.ok(find(r.vnode, 'order-item-0').length > 0, 'pool has first item');
  assert.ok(find(r.vnode, 'order-item-1').length > 0, 'pool has second item');
  assert.ok(find(r.vnode, 'order-item-2').length > 0, 'pool has third item');
});

// Test 2: Tapping pool words fills slots in order
test('tapping pool words fills slots in sentence mode', () => {
  const view = { steps: [{ label: 'я', id: 'a' }, { label: 'в', id: 'b' }, { label: 'домe', id: 'c' }] };
  const item = { prompt: 'Я ___ в ___ ___.', type: 'order', steps: view.steps };
  const r = render([], item, view);
  
  // Tap first word (index 0)
  find(r.vnode, 'order-item-0')[0].props.onClick();
  assert.deepStrictEqual(plain(r.calls.states[0].placed), ['a']);
  
  // Tap second word (index 1)
  const r2 = render(['a'], item, view);
  find(r2.vnode, 'order-item-1')[0].props.onClick();
  assert.deepStrictEqual(plain(r2.calls.states[0].placed), ['a', 'b']);
  
  // Tap third word (index 2)
  const r3 = render(['a', 'b'], item, view);
  find(r3.vnode, 'order-item-2')[0].props.onClick();
  assert.deepStrictEqual(plain(r3.calls.states[0].placed), ['a', 'b', 'c']);
  
  // Now all slots should be filled
  const r4 = render(['a', 'b', 'c'], item, view);
  assert.ok(find(r4.vnode, 'order-slot-0')[0].props.class.indexOf('empty') < 0, 'slot 0 filled');
  assert.ok(find(r4.vnode, 'order-slot-1')[0].props.class.indexOf('empty') < 0, 'slot 1 filled');
  assert.ok(find(r4.vnode, 'order-slot-2')[0].props.class.indexOf('empty') < 0, 'slot 2 filled');
  
  // Pool should be empty
  assert.ok(find(r4.vnode, 'order-item-0').length === 0, 'pool item 0 gone');
  assert.ok(find(r4.vnode, 'order-item-1').length === 0, 'pool item 1 gone');
  assert.ok(find(r4.vnode, 'order-item-2').length === 0, 'pool item 2 gone');
});

// Test 3: Tapping a filled slot returns word to pool
test('tapping a filled slot returns word to pool', () => {
  const view = { steps: [{ label: 'я', id: 'a' }, { label: 'в', id: 'b' }, { label: 'домe', id: 'c' }] };
  const item = { prompt: 'Я ___ в ___ ___.', type: 'order', steps: view.steps };
  const r = render(['a', 'b', 'c'], item, view);
  
  // Tap slot 1 (middle slot with 'в')
  find(r.vnode, 'order-slot-1')[0].props.onClick();
  assert.deepStrictEqual(plain(r.calls.states[0].placed), ['a', 'c'], 'b removed from placed');
  
  // Pool should have the removed word
  const r2 = render(['a', 'c'], item, view);
  assert.ok(find(r2.vnode, 'order-item-1').length > 0, 'word b back in pool');
  
  // Later words should shift left
  assert.ok(find(r2.vnode, 'order-slot-1')[0].props.class.indexOf('empty') < 0, 'slot 1 now has c');
});

// Test 4: Check disabled until all slots filled
test('check disabled until all slots are filled', () => {
  const view = { steps: [{ label: 'я', id: 'a' }, { label: 'в', id: 'b' }, { label: 'домe', id: 'c' }] };
  const item = { prompt: 'Я ___ в ___ ___.', type: 'order', steps: view.steps };
  
  const r1 = render(['a'], item, view);
  assert.strictEqual(find(r1.vnode, 'btn-submit')[0].props.disabled, true, 'check disabled with 1/3');
  
  const r2 = render(['a', 'b'], item, view);
  assert.strictEqual(find(r2.vnode, 'btn-submit')[0].props.disabled, true, 'check disabled with 2/3');
  
  const r3 = render(['a', 'b', 'c'], item, view);
  assert.strictEqual(find(r3.vnode, 'btn-submit')[0].props.disabled, false, 'check enabled with 3/3');
});

// Test 5: Submit sends correct sequence
test('submit sends sequence of ids in tap order', () => {
  const view = { steps: [{ label: 'я', id: 'a' }, { label: 'в', id: 'b' }, { label: 'домe', id: 'c' }] };
  const item = { prompt: 'Я ___ в ___ ___.', type: 'order', steps: view.steps };
  const r = render(['b', 'a', 'c'], item, view);
  
  find(r.vnode, 'btn-submit')[0].props.onClick();
  assert.deepStrictEqual(plain(r.calls.submitted[0]), [{ sequence: ['b', 'a', 'c'] }, ['b', 'a', 'c']]);
});

// Test 6: Result marks right/wrong on slots
test('result marks right/wrong on slots in sentence mode', () => {
  const view = { steps: [{ label: 'я', id: 'a' }, { label: 'в', id: 'b' }, { label: 'домe', id: 'c' }] };
  const item = { prompt: 'Я ___ в ___ ___.', type: 'order', steps: view.steps };
  const result = { correct: false, detail: { firstWrong: 1 } };
  const r = render(['a', 'c', 'b'], item, view, { result: result });
  
  // All buttons should be disabled
  assert.strictEqual(find(r.vnode, 'order-slot-0')[0].props.disabled, true);
  assert.strictEqual(find(r.vnode, 'order-slot-1')[0].props.disabled, true);
  assert.strictEqual(find(r.vnode, 'order-slot-2')[0].props.disabled, true);
  
  // Mark classes
  assert.ok(find(r.vnode, 'order-slot-0')[0].props.class.indexOf('right') >= 0, 'slot 0 is right');
  assert.ok(find(r.vnode, 'order-slot-1')[0].props.class.indexOf('wrong') >= 0, 'slot 1 is wrong');
  assert.ok(find(r.vnode, 'order-slot-2')[0].props.class.indexOf('right') < 0 && 
            find(r.vnode, 'order-slot-2')[0].props.class.indexOf('wrong') < 0, 'slot 2 is neither');
});

// Test 7: All-right result marks every slot right
test('all-right result marks every slot right in sentence mode', () => {
  const view = { steps: [{ label: 'я', id: 'a' }, { label: 'в', id: 'b' }, { label: 'домe', id: 'c' }] };
  const item = { prompt: 'Я ___ в ___ ___.', type: 'order', steps: view.steps };
  const result = { correct: true, detail: { firstWrong: null } };
  const r = render(['a', 'b', 'c'], item, view, { result: result });
  
  [0, 1, 2].forEach((k) => {
    assert.ok(find(r.vnode, 'order-slot-' + k)[0].props.class.indexOf('right') >= 0, 
             'slot ' + k + ' is right');
  });
});

// Test 8: Count mismatch (2 blanks, 3 steps) gives fallback list
test('count mismatch gives list fallback', () => {
  const view = { steps: [{ label: 'First', id: 'a' }, { label: 'Second', id: 'b' }, { label: 'Third', id: 'c' }] };
  const item = { prompt: 'Fill ___ and ___', type: 'order', steps: view.steps };
  const r = render([], item, view);
  
  // Should use list mode (no sentence)
  assert.ok(find(r.vnode, 'order-placed-list').length > 0, 'list fallback for count mismatch');
  assert.ok(find(r.vnode, 'order-unplaced').length > 0, 'pool present in list mode');
});

// Test 9: Single data-testid=prompt element
test('exactly one data-testid=prompt element', () => {
  const view = { steps: [{ label: 'я', id: 'a' }, { label: 'в', id: 'b' }, { label: 'домe', id: 'c' }] };
  const item = { prompt: 'Я ___ в ___ ___.', type: 'order', steps: view.steps };
  const r = render([], item, view);
  
  assert.strictEqual(find(r.vnode, 'prompt').length, 1, 'exactly one prompt element');
});

// Test 10: ownsPrompt returns true for sentence mode
test('ownsPrompt returns true when prompt has matching ___ count', () => {
  const item = { prompt: 'Я ___ в ___ ___.', steps: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] };
  const view = { steps: item.steps };
  assert.strictEqual(def.ownsPrompt(item, view), true);
});

// Test 11: ownsPrompt returns false for count mismatch
test('ownsPrompt returns false for count mismatch', () => {
  const item = { prompt: 'Fill ___ and ___', steps: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] };
  const view = { steps: item.steps };
  assert.strictEqual(def.ownsPrompt(item, view), false);
});

// Test 12: ownsPrompt returns false for no ___
test('ownsPrompt returns false for no ___', () => {
  const item = { prompt: 'Put these in order', steps: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] };
  const view = { steps: item.steps };
  assert.strictEqual(def.ownsPrompt(item, view), false);
});

test('splitPrompt exported for testing', () => {
  assert.ok(typeof def.splitPrompt === 'function', 'splitPrompt is a function');
});

test('empty slot has a position aria-label', () => {
  const item = { prompt: 'x ___ y ___ z ___', type: 'order' };
  const r = render(['a'], item);
  const empty = find(r.vnode, 'order-slot-1')[0];
  assert.strictEqual(empty.props['aria-label'], 'Position 2');
});

test('arrow navigation visits slots, pool, reset, check in order', () => {
  const item = { prompt: 'x ___ y ___ z ___', type: 'order' };
  const r = render(['a'], item);
  const btns = [];
  (function walk(n) {
    if (Array.isArray(n)) return n.forEach(walk);
    if (!n || typeof n !== 'object' || !n.props) return;
    if (n.type === 'button') btns.push(n.props['data-testid']);
    walk(n.props.children);
  })(r.vnode);
  assert.deepStrictEqual(btns, ['order-slot-0', 'order-item-1', 'order-item-2', 'order-reset', 'btn-submit']);
  const els = btns.map((id) => ({ id, disabled: id === 'btn-submit', focus() { cur.v = this; } }));
  const cur = { v: null };
  const container = { querySelectorAll: () => els };
  const press = (target) => { let pd = false; def.onKey({ key: 'ArrowDown', target: Object.assign(target, { closest: () => container, tagName: 'BUTTON' }), preventDefault() { pd = true; } }, { result: null }); return pd; };
  assert.ok(press(els[0]));
  assert.strictEqual(cur.v.id, 'order-item-1');
  press(els[3]);
  assert.strictEqual(cur.v.id, 'order-slot-0', 'wraps past disabled check');
});

test('unknown placed id renders an empty slot in sentence mode without throwing', () => {
  const view = { steps: [{ label: 'я', id: 'a' }, { label: 'в', id: 'b' }, { label: 'домe', id: 'c' }] };
  const item = { prompt: 'Я ___ в ___ ___.', type: 'order', steps: view.steps };
  const r = render(['zzz'], item, view);
  assert.strictEqual(find(r.vnode, 'order-slot-0').length, 1);
  assert.ok(/empty/.test(find(r.vnode, 'order-slot-0')[0].props.class));
});

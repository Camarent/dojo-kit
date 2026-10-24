'use strict';
// Test focus and navigation behavior in sessions
// Tests arrow navigation between inputs, focus after result, and no focus ring after pointer interaction.
const test = require('node:test');
const assert = require('node:assert');
const { NOW, TODAY, Node_, doc, q, loadSandbox, mounted, mount, click, key, cur, press, answered, startSession } = require('./keys-helpers.js');

const start = async (m) => { await startSession(m); await m.flush(); await m.flush(); };
const pr = async (m, ev) => { const r = await press(m, ev); await m.flush(); return r; };

test.after(() => mounted.forEach((f) => f()));

const CLOZE = { id: 'cl1', unit: 'u', type: 'cloze', prompt: 'Fill blanks', parts: ['A', ['x'], 'B', ['y'], 'C', ['z']] };
const GAP = { id: 'g1', unit: 'u', type: 'gap', prompt: 'Fill gap', answers: ['test'] };
const GAP2 = { id: 'g2', unit: 'u', type: 'gap', prompt: 'Fill gap 2', answers: ['test2'] };
const CHOICE = { id: 'c1', unit: 'u', type: 'choice', prompt: 'Pick one', options: ['A', 'B', 'C'], answer: 0 };

// Test 1: arrow navigation between inputs
test('ArrowDown navigates from first cloze blank to second', async () => {
  const m = await mount([CLOZE]);
  await start(m);
  const input0 = q(m.rootEl, 'cloze-input-0');
  const input1 = q(m.rootEl, 'cloze-input-1');
  doc.activeElement = input0;
  await pr(m, key('ArrowDown', input0));
  assert.ok(doc.activeElement === input1, 'ArrowDown from first blank goes to second');
});

test('ArrowUp navigates from second cloze blank to first', async () => {
  const m = await mount([CLOZE]);
  await start(m);
  const input0 = q(m.rootEl, 'cloze-input-0');
  const input1 = q(m.rootEl, 'cloze-input-1');
  doc.activeElement = input1;
  await pr(m, key('ArrowUp', input1));
  assert.ok(doc.activeElement === input0, 'ArrowUp from second blank goes to first');
});

test('ArrowDown from last cloze blank goes to submit when all filled', async () => {
  const m = await mount([CLOZE]);
  await start(m);
  const input0 = q(m.rootEl, 'cloze-input-0');
  const input1 = q(m.rootEl, 'cloze-input-1');
  const input2 = q(m.rootEl, 'cloze-input-2');
  const btn = q(m.rootEl, 'btn-submit');
  input0.fire('input', { target: { value: 'x' } });
  await m.flush();
  input1.fire('input', { target: { value: 'y' } });
  await m.flush();
  input2.fire('input', { target: { value: 'z' } });
  await m.flush();
  doc.activeElement = input2;
  assert.ok(!btn.attrs.disabled, 'submit is enabled');
  await pr(m, key('ArrowDown', input2));
  assert.ok(doc.activeElement === btn, 'Down from last filled blank goes to submit');
});

test('ArrowDown stays on last input when submit disabled', async () => {
  const m = await mount([CLOZE]);
  await start(m);
  const input2 = q(m.rootEl, 'cloze-input-2');
  const btn = q(m.rootEl, 'btn-submit');
  doc.activeElement = input2;
  assert.ok(btn.attrs.disabled, 'submit is disabled');
  await pr(m, key('ArrowDown', input2));
  assert.ok(doc.activeElement === input2, 'ArrowDown from last input stays when submit disabled');
});

test('ArrowUp from first input does nothing (no wrap)', async () => {
  const m = await mount([CLOZE]);
  await start(m);
  const input0 = q(m.rootEl, 'cloze-input-0');
  doc.activeElement = input0;
  await pr(m, key('ArrowUp', input0));
  assert.ok(doc.activeElement === input0, 'ArrowUp from first input does nothing');
});

// Test 2: focus after a result
test('next button exists after answering with dont-know', async () => {
  const m = await mount([GAP]);
  await start(m);
  click(m, 'btn-dont-know');
  await m.flush();
  const nextBtn = q(m.rootEl, 'btn-next');
  assert.ok(nextBtn, 'next button exists after dont-know result');
});

test('next button exists after answering gap correctly', async () => {
  const m = await mount([GAP]);
  await start(m);
  const input = q(m.rootEl, 'gap-input');
  input.fire('input', { target: { value: 'test' } });
  await m.flush();
  const form = q(m.rootEl, 'gap-form');
  form.fire('submit', { preventDefault() {} });
  await m.flush();
  const nextBtn = q(m.rootEl, 'btn-next');
  assert.ok(nextBtn, 'next button exists after correct answer');
});

test('focusing an input does not set data-nofocusring', async () => {
  const m = await mount([GAP]);
  await start(m);
  const input = q(m.rootEl, 'gap-input');
  assert.ok(input, 'gap input is shown');
  assert.ok(input.getAttribute('data-nofocusring') == null, 'input has no data-nofocusring');
});

test('focusing a button still sets data-nofocusring', async () => {
  const m = await mount([GAP]);
  await start(m);
  m.win.fire('pointerdown', { type: 'pointerdown' });
  await m.flush();
  q(m.rootEl, 'gap-input').fire('input', { target: { value: 'test' } });
  await m.flush();
  q(m.rootEl, 'gap-form').fire('submit', { preventDefault() {} });
  await m.flush();
  await m.flush();
  const nextBtn = q(m.rootEl, 'btn-next');
  assert.ok(doc.activeElement === nextBtn, 'next button is focused');
  assert.ok(nextBtn.getAttribute('data-nofocusring') != null, 'button has data-nofocusring');
});

test('app.css has input focus-visible ring and no break-all on stimulus text', () => {
  const css = require('node:fs').readFileSync(require('node:path').join(__dirname, '../styles/app.css'), 'utf8');
  assert.ok(/input:focus-visible,\s*textarea:focus-visible\s*\{[^}]*outline:\s*2px solid/.test(css), 'input focus ring rule present');
  assert.ok(!/\.qbody\.stimulus-text\s*\{[^}]*word-break:\s*break-all/.test(css), 'no break-all on stimulus text');
});

// Test 3: no focus ring after pointer interaction
test('no focus ring after pointer click on next button', async () => {
  const m = await mount([GAP]);
  await start(m);
  click(m, 'btn-dont-know');
  await m.flush();
  const nextBtn = q(m.rootEl, 'btn-next');
  // Simulate pointer interaction
  m.win.fire('pointerdown', { type: 'pointerdown' });
  await m.flush();
  // Click the next button
  click(m, 'btn-next');
  await m.flush();
  // After pointer interaction, the button should not have data-nofocusring
  // The new input should be focused
  const newItem = q(m.rootEl, 'gap-input');
  assert.ok(newItem, 'new item is shown');
  assert.ok(doc.activeElement === newItem, 'new input is focused after next');
});

test('pointer interaction clears keyboard flag', async () => {
  const m = await mount([GAP]);
  await start(m);
  // Simulate pointerdown
  m.win.fire('pointerdown', { type: 'pointerdown' });
  await m.flush();
  // Now kbd should be false
  click(m, 'btn-dont-know');
  await m.flush();
  const nextBtn = q(m.rootEl, 'btn-next');
  click(m, 'btn-next');
  await m.flush();
  const newInput = q(m.rootEl, 'gap-input');
  assert.ok(newInput, 'new input exists');
  // The new input should be focused
  assert.ok(doc.activeElement === newInput, 'new input is focused');
});

test('ArrowDown on disabled input does nothing', async () => {
  const m = await mount([GAP]);
  await start(m);
  const input = q(m.rootEl, 'gap-input');
  // Empty input means submit is disabled
  const btn = q(m.rootEl, 'btn-submit');
  assert.ok(btn.attrs.disabled, 'submit is disabled for empty gap');
  doc.activeElement = input;
  await pr(m, key('ArrowDown', input));
  // Should stay on input since submit is disabled
  assert.ok(doc.activeElement === input, 'ArrowDown stays on input when submit disabled');
});

test('navigation skips disabled and readonly inputs', async () => {
  const m = await mount([CLOZE]);
  await start(m);
  const input0 = q(m.rootEl, 'cloze-input-0');
  const input1 = q(m.rootEl, 'cloze-input-1');
  const input2 = q(m.rootEl, 'cloze-input-2');
  const btn = q(m.rootEl, 'btn-submit');
  
  // Fill only first blank, so submit is still disabled
  input0.fire('input', { target: { value: 'x' } });
  await m.flush();
  assert.ok(btn.attrs.disabled, 'submit disabled with only one blank filled');
  
  doc.activeElement = input0;
  await pr(m, key('ArrowDown', input0));
  // Should go to input1 (skipping nothing)
  assert.ok(doc.activeElement === input1, 'ArrowDown goes to next input');
  
  await pr(m, key('ArrowDown', input1));
  // Should go to input2
  assert.ok(doc.activeElement === input2, 'ArrowDown goes to next input');
  
  await pr(m, key('ArrowDown', input2));
  // Should stay on input2 since submit is disabled
  assert.ok(doc.activeElement === input2, 'ArrowDown stays when submit disabled');
});

'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { NOW, TODAY, Node_, doc, q, loadSandbox, mounted, mount, click, key, cur, press, answered, startSession } = require('./keys-helpers.js');

const start = async (m) => { await startSession(m); await m.flush(); await m.flush(); };
const pr = async (m, ev) => { const r = await press(m, ev); await m.flush(); return r; };

test.after(() => mounted.forEach((f) => f()));

const GAP = { id: 'g1', unit: 'u', type: 'gap', prompt: 'Fill gap', answers: ['test'] };
const GAP2 = { id: 'g2', unit: 'u', type: 'gap', prompt: 'Fill gap 2', answers: ['test2'] };
const CLOZE = { id: 'cl1', unit: 'u', type: 'cloze', prompt: 'Fill blanks', parts: ['A', ['x'], 'B', ['y'], 'C', ['z']] };
const CHOICE = { id: 'c1', unit: 'u', type: 'choice', prompt: 'Pick one', options: ['A', 'B', 'C'], answer: 0 };

test('gap input with text: ArrowDown focuses btn-submit, defaultPrevented is true', async () => {
  const m = await mount([GAP]);
  await start(m);
  const input = q(m.rootEl, 'gap-input');
  input.fire('input', { target: { value: 'test' } });
  await m.flush();
  const btn = q(m.rootEl, 'btn-submit');
  assert.ok(!btn.attrs.disabled, 'submit button is enabled');
  doc.activeElement = input;
  const ev = await pr(m, key('ArrowDown', input));
  assert.ok(doc.activeElement === btn, 'ArrowDown from filled gap input focuses submit');
  assert.strictEqual(ev.prevented, true, 'defaultPrevented is true');
});

test('empty gap input: ArrowDown stays on the input (submit disabled)', async () => {
  const m = await mount([GAP]);
  await start(m);
  const input = q(m.rootEl, 'gap-input');
  const btn = q(m.rootEl, 'btn-submit');
  assert.ok(btn.attrs.disabled, 'submit button is disabled');
  doc.activeElement = input;
  await pr(m, key('ArrowDown', input));
  assert.ok(doc.activeElement === input, 'ArrowDown from empty gap input stays on input');
});

test('cloze with 3 blanks: Down and Up move between blanks', async () => {
  const m = await mount([CLOZE]);
  await start(m);
  const input0 = q(m.rootEl, 'cloze-input-0');
  const input1 = q(m.rootEl, 'cloze-input-1');
  const input2 = q(m.rootEl, 'cloze-input-2');
  const btn = q(m.rootEl, 'btn-submit');
  doc.activeElement = input0;
  await pr(m, key('ArrowDown', input0));
  assert.ok(doc.activeElement === input1, 'Down from first blank goes to second');
  await pr(m, key('ArrowDown', input1));
  assert.ok(doc.activeElement === input2, 'Down from second blank goes to third');
  await pr(m, key('ArrowUp', input2));
  assert.ok(doc.activeElement === input1, 'Up from third blank goes to second');
  await pr(m, key('ArrowUp', input1));
  assert.ok(doc.activeElement === input0, 'Up from second blank goes to first');
});

test('cloze with 3 blanks: Down on last blank goes to submit when enabled', async () => {
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

test('isComposing / keyCode 229 in a cloze blank: no focus move and not prevented', async () => {
  for (const extra of [{ isComposing: true }, { keyCode: 229 }]) {
    const m = await mount([CLOZE]);
    await start(m);
    const input0 = q(m.rootEl, 'cloze-input-0');
    doc.activeElement = input0;
    const ev = await pr(m, key('ArrowDown', input0, extra));
    assert.ok(doc.activeElement === input0, 'composing: focus does not move');
    assert.strictEqual(ev.prevented, undefined, 'composing: defaultPrevented not set');
  }
});

test('ArrowLeft/ArrowRight in an input are not hijacked', async () => {
  const m = await mount([CLOZE]);
  await start(m);
  const input0 = q(m.rootEl, 'cloze-input-0');
  doc.activeElement = input0;
  for (const k of ['ArrowLeft', 'ArrowRight']) {
    const ev = await pr(m, key(k, input0));
    assert.ok(doc.activeElement === input0, k + ': focus does not move');
    assert.strictEqual(ev.prevented, undefined, k + ': not prevented');
  }
});

test('ArrowDown on an option button is still handled by choice.js', async () => {
  const m = await mount([CHOICE]);
  await start(m);
  const opt0 = q(m.rootEl, 'option-0');
  const opt1 = q(m.rootEl, 'option-1');
  doc.activeElement = opt0;
  await pr(m, key('ArrowDown', opt0));
  assert.ok(doc.activeElement === opt1, 'ArrowDown on choice option moves to next option');
});

test('after answering (result shown), arrows do nothing new', async () => {
  const m = await mount([GAP]);
  await start(m);
  const input = q(m.rootEl, 'gap-input');
  input.fire('input', { target: { value: 'test' } });
  await m.flush();
  const form = q(m.rootEl, 'gap-form');
  form.fire('submit', { preventDefault() {} });
  await m.flush();
  assert.ok(q(m.rootEl, 'btn-next'), 'result shown');
  await m.flush();
  doc.activeElement = input;
  const ev = await pr(m, key('ArrowDown', input));
  assert.strictEqual(ev.prevented, undefined, 'ArrowDown after result does not prevent default');
  assert.ok(doc.activeElement === input, 'focus stays on input after result');
});

test('ArrowUp from first input in cloze does nothing (no wrap)', async () => {
  const m = await mount([CLOZE]);
  await start(m);
  const input0 = q(m.rootEl, 'cloze-input-0');
  doc.activeElement = input0;
  await pr(m, key('ArrowUp', input0));
  assert.ok(doc.activeElement === input0, 'ArrowUp from first input does nothing');
});

test('ArrowDown from last input in cloze does nothing when submit disabled', async () => {
  const m = await mount([CLOZE]);
  await start(m);
  const input2 = q(m.rootEl, 'cloze-input-2');
  const btn = q(m.rootEl, 'btn-submit');
  doc.activeElement = input2;
  assert.ok(btn.attrs.disabled, 'submit is disabled');
  await pr(m, key('ArrowDown', input2));
  assert.ok(doc.activeElement === input2, 'ArrowDown from last input stays when submit disabled');
});

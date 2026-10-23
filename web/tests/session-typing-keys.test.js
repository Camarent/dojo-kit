'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { NOW, TODAY, Node_, doc, q, loadSandbox, mounted, mount, click, key, cur, press, answered, startSession } = require('./keys-helpers.js');

test.after(() => mounted.forEach((f) => f()));

const GAP = { id: 'g1', unit: 'u', type: 'gap', prompt: 'Fill gap', answers: ['test'] };
const GAP2 = { id: 'g2', unit: 'u', type: 'gap', prompt: 'Fill gap 2', answers: ['test2'] };
const CLOZE = { id: 'cl1', unit: 'u', type: 'cloze', prompt: 'Fill blanks', parts: ['A', ['x'], 'B', ['y']] };
const ITEMS2 = [GAP, GAP2];

test('arrow keys typed in a text field do not move the session', async () => {
  const m = await mount([GAP]);
  await startSession(m);
  const first = cur(m);
  const input = q(m.rootEl, 'gap-input');
  for (const k of ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown']) {
    const ev = await press(m, key(k, input));
    assert.strictEqual(cur(m), first, k);
    if (k === 'ArrowUp' || k === 'ArrowDown') continue;
    assert.strictEqual(ev.prevented, undefined, k + ' preventDefault not called');
  }
});

test('space typed in a text field does not move the session', async () => {
  const m = await mount([GAP]);
  await startSession(m);
  const first = cur(m);
  const input = q(m.rootEl, 'gap-input');
  const ev = await press(m, key(' ', input));
  assert.strictEqual(cur(m), first);
  assert.strictEqual(ev.prevented, undefined, 'preventDefault not called');
});

test('typed value stays intact after arrow keys in gap input', async () => {
  const m = await mount([GAP]);
  await startSession(m);
  const input = q(m.rootEl, 'gap-input');
  input.fire('input', { target: { value: 'typed' } });
  await m.flush();
  for (const k of ['ArrowRight', 'ArrowLeft']) await press(m, key(k, input));
  assert.strictEqual(input.getAttribute('value'), 'typed');
});

test('Enter in gap input submits once', async () => {
  const m = await mount(ITEMS2);
  await startSession(m);
  const first = cur(m);
  const input = q(m.rootEl, 'gap-input');
  input.fire('input', { target: { value: 'test' } });
  await m.flush();
  const form = q(m.rootEl, 'gap-form');
  assert.strictEqual(m.store.answers, 0);
  await press(m, key('Enter', input));
  assert.strictEqual(m.store.answers, 0, 'keydown alone does not submit');
  form.fire('submit', { preventDefault() {} });
  await m.flush();
  assert.strictEqual(m.store.answers, 1, 'one Enter records exactly one answer');
  form.fire('submit', { preventDefault() {} });
  await m.flush();
  assert.strictEqual(m.store.answers, 1, 'second submit on result screen records no extra answer');
  assert.strictEqual(cur(m), first, 'still on the answered item');
});

test('ArrowRight after result with INPUT focus does not advance', async () => {
  const m = await mount([GAP]);
  await startSession(m);
  const input = q(m.rootEl, 'gap-input');
  input.fire('input', { target: { value: 'test' } });
  await m.flush();
  const form = q(m.rootEl, 'gap-form');
  form.fire('submit', { preventDefault() {} });
  await m.flush();
  const first = cur(m);
  const ev = await press(m, key('ArrowRight', input));
  assert.strictEqual(cur(m), first);
  assert.strictEqual(ev.prevented, undefined, 'preventDefault not called');
});

test('Enter after result with INPUT focus advances', async () => {
  const m = await mount([GAP, GAP2]);
  await startSession(m);
  const input = q(m.rootEl, 'gap-input');
  input.fire('input', { target: { value: 'test' } });
  await m.flush();
  const form = q(m.rootEl, 'gap-form');
  form.fire('submit', { preventDefault() {} });
  await m.flush();
  const first = cur(m);
  await press(m, key('Enter', input));
  assert.notStrictEqual(cur(m), first);
});

test('cloze arrow keys ignored in first input', async () => {
  const m = await mount([CLOZE]);
  await startSession(m);
  const first = cur(m);
  const input0 = q(m.rootEl, 'cloze-input-0');
  for (const k of ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown']) {
    const ev = await press(m, key(k, input0));
    assert.strictEqual(cur(m), first, k);
    if (k === 'ArrowUp' || k === 'ArrowDown') continue;
    assert.strictEqual(ev.prevented, undefined, k + ' preventDefault not called');
  }
});

test('cloze arrow keys ignored in second input', async () => {
  const m = await mount([CLOZE]);
  await startSession(m);
  const first = cur(m);
  const input1 = q(m.rootEl, 'cloze-input-1');
  for (const k of ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown']) {
    const ev = await press(m, key(k, input1));
    assert.strictEqual(cur(m), first, k);
    if (k === 'ArrowUp' || k === 'ArrowDown') continue;
    assert.strictEqual(ev.prevented, undefined, k + ' preventDefault not called');
  }
});

test('TEXTAREA target ignores arrow keys and Enter after result; BODY target advances', async () => {
  const m = await mount(ITEMS2, { dontKnow: true });
  await startSession(m);
  const first = cur(m);
  await answered(m);
  const firstId = cur(m);
  const textarea = new Node_(1, 'TEXTAREA');
  for (const k of ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Enter']) {
    await press(m, key(k, textarea));
    assert.strictEqual(cur(m), firstId, k + ' from TEXTAREA');
  }
  await press(m, key('ArrowRight', m.win));
  assert.notStrictEqual(cur(m), firstId, 'ArrowRight from BODY advances');
});

test('SELECT target ignores arrow keys and Enter after result; BODY target advances', async () => {
  const m = await mount(ITEMS2, { dontKnow: true });
  await startSession(m);
  const first = cur(m);
  await answered(m);
  const firstId = cur(m);
  const select = new Node_(1, 'SELECT');
  for (const k of ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Enter']) {
    await press(m, key(k, select));
    assert.strictEqual(cur(m), firstId, k + ' from SELECT');
  }
  await press(m, key('ArrowRight', m.win));
  assert.notStrictEqual(cur(m), firstId, 'ArrowRight from BODY advances');
});

test('BUTTON target ignores ArrowRight and Enter after result; BODY target advances', async () => {
  const m = await mount(ITEMS2, { dontKnow: true });
  await startSession(m);
  const first = cur(m);
  await answered(m);
  const firstId = cur(m);
  const btn = new Node_(1, 'BUTTON');
  for (const k of ['ArrowRight', 'Enter']) {
    await press(m, key(k, btn));
    assert.strictEqual(cur(m), firstId, k + ' from BUTTON');
  }
  await press(m, key('ArrowRight', m.win));
  assert.notStrictEqual(cur(m), firstId, 'ArrowRight from BODY advances');
});

test('A target ignores ArrowRight and Enter after result; BODY target advances', async () => {
  const m = await mount(ITEMS2, { dontKnow: true });
  await startSession(m);
  const first = cur(m);
  await answered(m);
  const firstId = cur(m);
  const a = new Node_(1, 'A');
  for (const k of ['ArrowRight', 'Enter']) {
    await press(m, key(k, a));
    assert.strictEqual(cur(m), firstId, k + ' from A');
  }
  await press(m, key('ArrowRight', m.win));
  assert.notStrictEqual(cur(m), firstId, 'ArrowRight from BODY advances');
});

test('modifier keys block advance after result; plain ArrowRight from BODY advances', async () => {
  const m = await mount(ITEMS2, { dontKnow: true });
  await startSession(m);
  const first = cur(m);
  await answered(m);
  const firstId = cur(m);
  for (const mod of ['ctrlKey', 'metaKey', 'altKey', 'shiftKey']) {
    const ev = key('ArrowRight', m.win, { [mod]: true });
    await press(m, ev);
    assert.strictEqual(cur(m), firstId, mod + ' + ArrowRight does not advance');
  }
  await press(m, key('ArrowRight', m.win));
  assert.notStrictEqual(cur(m), firstId, 'plain ArrowRight from BODY advances');
});

test('modifier keys do not close intro card; plain ArrowRight from BODY closes it', async () => {
  const intro = [GAP, GAP2].map((i) => Object.assign({}, i, { entity: 'E1', explanation: 'x' }));
  const intros = [{ id: 'E1', title: 'Intro', text: 'Body' }];
  const m = await mount(intro, { introNew: true }, intros);
  await startSession(m);
  assert.ok(q(m.rootEl, 'intro-card'), 'intro shown');
  for (const mod of ['ctrlKey', 'metaKey', 'altKey', 'shiftKey']) {
    await press(m, key('ArrowRight', m.win, { [mod]: true }));
    assert.ok(q(m.rootEl, 'intro-card'), mod + ' + ArrowRight does not close intro');
  }
  await press(m, key('ArrowRight', m.win));
  assert.strictEqual(q(m.rootEl, 'intro-card'), null, 'plain ArrowRight from BODY closes intro');
  assert.strictEqual(cur(m), 'g1');
});

test('modifier keys do not close intro card from INPUT; plain ArrowRight from BODY closes it', async () => {
  const intro = [GAP, GAP2].map((i) => Object.assign({}, i, { entity: 'E1', explanation: 'x' }));
  const intros = [{ id: 'E1', title: 'Intro', text: 'Body' }];
  const m = await mount(intro, { introNew: true }, intros);
  await startSession(m);
  assert.ok(q(m.rootEl, 'intro-card'), 'intro shown');
  const input = new Node_(1, 'INPUT');
  for (const mod of ['ctrlKey', 'metaKey', 'altKey', 'shiftKey']) {
    await press(m, key('ArrowRight', input, { [mod]: true }));
    assert.ok(q(m.rootEl, 'intro-card'), mod + ' + ArrowRight from INPUT does not close intro');
  }
  await press(m, key('ArrowRight', m.win));
  assert.strictEqual(q(m.rootEl, 'intro-card'), null, 'plain ArrowRight from BODY closes intro');
  assert.strictEqual(cur(m), 'g1');
});

test('Space with INPUT focus after result does not advance; BODY target advances', async () => {
  const m = await mount(ITEMS2, { dontKnow: true });
  await startSession(m);
  const input = q(m.rootEl, 'gap-input');
  input.fire('input', { target: { value: 'test' } });
  await m.flush();
  const form = q(m.rootEl, 'gap-form');
  form.fire('submit', { preventDefault() {} });
  await m.flush();
  const firstId = cur(m);
  const ev = await press(m, key(' ', input));
  assert.strictEqual(cur(m), firstId, 'Space from INPUT after result does not advance');
  assert.strictEqual(ev.prevented, undefined, 'preventDefault not called');
  await press(m, key('ArrowRight', m.win));
  assert.notStrictEqual(cur(m), firstId, 'ArrowRight from BODY advances');
});

test('intro card ArrowRight from body closes it and first question is current', async () => {
  const intro = [GAP].map((i) => Object.assign({}, i, { entity: 'E1', explanation: 'x' }));
  const intros = [{ id: 'E1', title: 'Intro', text: 'Body' }];
  const m = await mount(intro, { introNew: true }, intros);
  await startSession(m);
  assert.ok(q(m.rootEl, 'intro-card'), 'intro shown');
  await press(m, key('ArrowRight', m.win));
  assert.strictEqual(q(m.rootEl, 'intro-card'), null);
  assert.strictEqual(cur(m), 'g1');
});

test('intro card ArrowRight from INPUT does not close it', async () => {
  const intro = [GAP].map((i) => Object.assign({}, i, { entity: 'E1', explanation: 'x' }));
  const intros = [{ id: 'E1', title: 'Intro', text: 'Body' }];
  const m = await mount(intro, { introNew: true }, intros);
  await startSession(m);
  assert.ok(q(m.rootEl, 'intro-card'), 'intro shown');
  const input = new Node_(1, 'INPUT');
  await press(m, key('ArrowRight', input));
  assert.ok(q(m.rootEl, 'intro-card'), 'intro still shown');
});

test('intro card ArrowRight from BUTTON does not close it', async () => {
  const intro = [GAP].map((i) => Object.assign({}, i, { entity: 'E1', explanation: 'x' }));
  const intros = [{ id: 'E1', title: 'Intro', text: 'Body' }];
  const m = await mount(intro, { introNew: true }, intros);
  await startSession(m);
  assert.ok(q(m.rootEl, 'intro-card'), 'intro shown');
  const btn = new Node_(1, 'BUTTON');
  await press(m, key('ArrowRight', btn));
  assert.ok(q(m.rootEl, 'intro-card'), 'intro still shown');
});

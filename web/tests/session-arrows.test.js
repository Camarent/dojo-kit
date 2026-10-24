'use strict';
// Test arrow key navigation in sessions
const test = require('node:test');
const assert = require('node:assert');
const { NOW, TODAY, Node_, doc, q, loadSandbox, mounted, mount, click, key, cur, press, answered, startSession } = require('./keys-helpers.js');

const ITEMS = [
  { id: 'c1', unit: 'u', type: 'choice', prompt: 'Pick one', options: ['Option A', 'Option B', 'Option C'], answer: 0 },
  { id: 'c2', unit: 'u', type: 'choice', prompt: 'Pick two', options: ['Option X', 'Option Y', 'Option Z'], answer: 1 },
  { id: 'g1', unit: 'u', type: 'gap', prompt: 'Fill', answers: ['test'] }
];

test.after(() => mounted.forEach((f) => f()));

const TAGGED = ITEMS.slice(0, 2).map((i) => Object.assign({}, i, { tags: ['a'] }));
const EXAM = { id: 'e1', passMark: 0.5, minutes: 30, sections: [{ title: 'A', count: 2, tags: ['a'] }] };
const CHOICES = ITEMS.slice(0, 2);

test('ArrowRight with a result advances; Enter too', async () => {
  for (const k of ['ArrowRight', 'Enter']) {
    const m = await mount(ITEMS, { dontKnow: true });
    await startSession(m);
    const first = cur(m);
    await answered(m);
    await press(m, key(k, m.win));
    assert.notStrictEqual(cur(m), first, k);
  }
});

test('ArrowRight / ArrowLeft / ArrowUp without a result do nothing', async () => {
  const m = await mount(ITEMS);
  await startSession(m);
  const first = cur(m);
  for (const k of ['ArrowRight', 'ArrowLeft', 'ArrowUp']) await press(m, key(k, m.win));
  assert.strictEqual(cur(m), first);
});

test('ArrowRight after a result on nextBtn advances; on other buttons does not', async () => {
  const m = await mount(ITEMS, { dontKnow: true });
  await startSession(m);
  await answered(m);
  const nextBtn = q(m.rootEl, 'btn-next');
  assert.ok(nextBtn, 'nextBtn exists');
  const first = cur(m);
  await press(m, key('ArrowRight', nextBtn));
  assert.notStrictEqual(cur(m), first, 'ArrowRight on nextBtn advances');
  const m2 = await mount([
    { id: 'g1', unit: 'u', type: 'gap', prompt: 'Fill', answers: ['test'] },
    { id: 'g2', unit: 'u', type: 'gap', prompt: 'Fill2', answers: ['test2'] }
  ]);
  await startSession(m2);
  const inp = q(m2.rootEl, 'gap-input');
  inp.value = 'tent';
  inp.fire('input', { target: inp });
  await m2.flush();
  q(m2.rootEl, 'gap-form').fire('submit');
  await m2.flush();
  const overrideBtn = q(m2.rootEl, 'btn-override');
  const first2 = cur(m2);
  assert.ok(overrideBtn, 'override button exists');
  await press(m2, key('ArrowRight', overrideBtn));
  assert.strictEqual(cur(m2), first2, 'ArrowRight on override button does not advance');
});

test('ArrowRight after a result: no advance from INPUT/TEXTAREA/SELECT/contentEditable', async () => {
  for (const tag of ['INPUT', 'TEXTAREA', 'SELECT', 'DIV']) {
    const m = await mount(ITEMS, { dontKnow: true });
    await startSession(m);
    const first = cur(m);
    await answered(m);
    const target = new Node_(1, tag);
    if (tag === 'DIV') target.isContentEditable = true;
    await press(m, key('ArrowRight', target));
    assert.strictEqual(cur(m), first, tag);
  }
});

test('Enter after a result: not from BUTTON/TEXTAREA/contentEditable, but from INPUT', async () => {
  for (const [tag, moves] of [['BUTTON', false], ['TEXTAREA', false], ['DIV', false], ['INPUT', true]]) {
    const m = await mount(ITEMS, { dontKnow: true });
    await startSession(m);
    const first = cur(m);
    await answered(m);
    const target = new Node_(1, tag);
    if (tag === 'DIV') target.isContentEditable = true;
    await press(m, key('Enter', target));
    assert.strictEqual(cur(m) !== first, moves, tag);
  }
});

test('modifiers block ArrowRight after a result', async () => {
  for (const mod of ['shiftKey', 'ctrlKey', 'metaKey', 'altKey']) {
    const m = await mount(ITEMS, { dontKnow: true });
    await startSession(m);
    const first = cur(m);
    await answered(m);
    await press(m, key('ArrowRight', m.win, { [mod]: true }));
    assert.strictEqual(cur(m), first, mod);
  }
});

test('exam mode without a result: arrows and Enter do nothing', async () => {
  const m = await mount(TAGGED, { exams: [EXAM] });
  m.app.startMode('exam', { examId: 'e1' }, true);
  await m.flush();
  assert.ok(m.app.state.session && m.app.state.session.mode === 'exam', 'exam session started');
  const first = cur(m);
  for (const k of ['ArrowRight', 'ArrowDown', 'Enter']) await press(m, key(k, q(m.rootEl, 'option-0') || m.win));
  assert.strictEqual(cur(m), first);
  assert.strictEqual(q(m.rootEl, 'option-0').attrs['aria-pressed'], 'false');
});

test('intro card: Enter and ArrowRight dismiss it, but not from INPUT/BUTTON/modifier', async () => {
  const intro = ITEMS.slice(0, 2).map((i) => Object.assign({}, i, { entity: 'E1', explanation: 'x' }));
  const intros = [{ id: 'E1', title: 'Intro', text: 'Body' }];
  const cases = [['ArrowRight', 'DIV', {}, true], ['Enter', 'DIV', {}, true], ['ArrowRight', 'INPUT', {}, false], ['ArrowRight', 'BUTTON', {}, false], ['ArrowRight', 'DIV', { shiftKey: true }, false], ['ArrowDown', 'DIV', {}, false]];
  for (const [k, tag, extra, dismiss] of cases) {
    const m = await mount(intro, { introNew: true }, intros);
    await startSession(m);
    assert.ok(q(m.rootEl, 'intro-card'), 'intro shown');
    await press(m, key(k, new Node_(1, tag), extra));
    assert.strictEqual(!q(m.rootEl, 'intro-card'), dismiss, k + tag);
  }
});

test('ArrowDown / ArrowUp move focus among options (wrapping); Enter and Space pick the focused one', async () => {
  const m = await mount(CHOICES);
  await startSession(m);
  const id = cur(m);
  const opts = ['option-0', 'option-1', 'option-2'].map((i) => q(m.rootEl, i));
  assert.ok(opts.every(Boolean));
  const ev = await press(m, key('ArrowDown', m.win));
  assert.ok(ev.prevented);
  assert.strictEqual(doc.activeElement, opts[0]);
  await press(m, key('ArrowDown', opts[0]));
  assert.strictEqual(doc.activeElement, opts[1]);
  await press(m, key('ArrowUp', opts[1]));
  await press(m, key('ArrowUp', opts[0]));
  assert.strictEqual(doc.activeElement, opts[2], 'wraps to last');
  await press(m, key('ArrowDown', opts[2]));
  assert.strictEqual(doc.activeElement, opts[0], 'wraps to first');
  await press(m, key('ArrowDown', opts[0]));
  const pick = await press(m, key(' ', opts[1]));
  assert.ok(pick.prevented);
  assert.strictEqual(m.app.state.session.current().item.id, id);
  assert.ok(q(m.rootEl, 'btn-next') && !q(m.rootEl, 'btn-next').attrs.disabled, 'answered');
});

test('Enter on an option button picks it', async () => {
  const m = await mount(CHOICES);
  await startSession(m);
  await press(m, key('Enter', q(m.rootEl, 'option-1')));
  assert.ok(!q(m.rootEl, 'btn-next').attrs.disabled);
});

test('choice onKey guards: INPUT/TEXTAREA/SELECT/contentEditable/modifiers/result ignore arrows and Enter', async () => {
  const { sb } = loadSandbox();
  const def = sb.DojoTypes.get('choice');
  const btn = new Node_(1, 'BUTTON'); btn.attrs['data-index'] = '1';
  const view = { options: [{ index: 0 }, { index: 1 }, { index: 2 }] };
  const hit = (ev, extra) => def.onKey(ev, Object.assign({ view, result: null, exam: false }, extra));
  assert.deepStrictEqual(JSON.parse(JSON.stringify(hit(key('Enter', btn)))), { input: { index: 1 }, picked: 1 });
  for (const tag of ['INPUT', 'TEXTAREA', 'SELECT']) {
    const t = new Node_(1, tag); t.attrs['data-index'] = '1';
    assert.strictEqual(hit(key('Enter', t)), null, tag);
    assert.strictEqual(hit(key('2', t)), null, tag);
  }
  const ce = new Node_(1, 'DIV'); ce.attrs['data-index'] = '1'; ce.isContentEditable = true;
  assert.strictEqual(hit(key('Enter', ce)), null);
  for (const mod of ['shiftKey', 'ctrlKey', 'metaKey', 'altKey']) assert.strictEqual(hit(key('2', btn, { [mod]: true })), null, mod);
  assert.strictEqual(hit(key('Enter', btn), { result: {} }), null);
  assert.strictEqual(hit(key('Enter', btn), { exam: true }), null);
  assert.strictEqual(hit(key('ArrowLeft', btn)), null);
  doc.root = new Node_(1, 'DIV');
  const o0 = new Node_(1, 'BUTTON'); o0.attrs['data-testid'] = 'option-0'; doc.root.appendChild(o0);
  for (const i of [1, 2]) { const o = new Node_(1, 'BUTTON'); o.attrs['data-testid'] = 'option-' + i; doc.root.appendChild(o); }
  doc.activeElement = null;
  const down = key('ArrowDown', btn);
  hit(down, { exam: true });
  assert.ok(!down.prevented && doc.activeElement === null, 'exam: arrows do not move focus');
  hit(key('ArrowDown', new Node_(1, 'DIV')));
  assert.strictEqual(doc.activeElement, o0);
});

test('DojoTypes.keyBlocked returns true for modifiers and contentEditable; INPUT/TEXTAREA/SELECT with allowInput false', async () => {
  const { sb } = loadSandbox();
  const blocked = sb.DojoTypes.keyBlocked;
  const baseEv = { key: 'ArrowRight', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, target: {} };
  assert.strictEqual(blocked(baseEv), false, 'no modifiers, no target');
  for (const mod of ['ctrlKey', 'metaKey', 'altKey', 'shiftKey']) {
    const ev = Object.assign({}, baseEv, { [mod]: true });
    assert.strictEqual(blocked(ev), true, mod);
  }
  const ce = { nodeType: 1, tagName: 'DIV', isContentEditable: true };
  assert.strictEqual(blocked(Object.assign({}, baseEv, { target: ce })), true, 'contentEditable');
  for (const tag of ['INPUT', 'TEXTAREA', 'SELECT']) {
    const t = { nodeType: 1, tagName: tag };
    assert.strictEqual(blocked(Object.assign({}, baseEv, { target: t })), true, tag);
    assert.strictEqual(blocked(Object.assign({}, baseEv, { target: t }), { allowInput: true }), false, tag + ' with allowInput');
  }
});

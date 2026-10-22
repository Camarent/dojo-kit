'use strict';
const test = require('node:test');
const assert = require('node:assert');
const H = require('./app-harness.js');

const gap = (id, unit, extra) => Object.assign({ id, unit, type: 'gap', prompt: 'Prompt ' + id, answers: ['ans' + id] }, extra);

// Helper to get PracticeSetup screen
async function openPractice(items, o) {
  const m = await H.mount(Object.assign({ items }, o));
  m.app.go('practice');
  const ps = m.screen(m.sb.DojoApp._PracticeSetup);
  return { m, ps };
}

test('Practice tag chips filter out internal tags and use tagLabels', async () => {
  const course = { tagLabels: { a: 'Alpha', b: { kind: 'internal' }, c: { label: 'Cee' } } };
  const c = await openPractice([
    gap('a1', 'u1', { tags: ['a'] }),
    gap('b1', 'u1', { tags: ['b'] }),
    gap('c1', 'u1', { tags: ['c'] }),
    gap('d1', 'u1', { tags: ['d'] })
  ], { course });
  
  const v = c.ps.view();
  
  // Check that internal tag 'b' is hidden
  assert.strictEqual(H.find(v, 'chip-tags-b'), null, 'Internal tag b should be hidden');
  
  // Check that labels are used for tags with labels
  const chipA = H.find(v, 'chip-tags-a');
  assert.ok(chipA, 'Chip for tag a should exist');
  assert.strictEqual(H.text(chipA), 'Alpha', 'Tag a should show label "Alpha"');
  
  const chipC = H.find(v, 'chip-tags-c');
  assert.ok(chipC, 'Chip for tag c should exist');
  assert.strictEqual(H.text(chipC), 'Cee', 'Tag c should show label "Cee"');
  
  // Check that tag without label is uppercased
  const chipD = H.find(v, 'chip-tags-d');
  assert.ok(chipD, 'Chip for tag d should exist');
  assert.strictEqual(H.text(chipD), 'D', 'Tag d should be uppercased');
  
  // Verify no raw id appears as chip text for tags that have labels
  assert.strictEqual(H.text(chipA), 'Alpha', 'Chip text for tag a should be "Alpha", not raw id "a"');
  assert.strictEqual(H.text(chipC), 'Cee', 'Chip text for tag c should be "Cee", not raw id "c"');
  
  // Check that no undefined, object literals, or arrays appear in rendered text
  const fullText = H.text(v);
  assert.ok(!/undefined/.test(fullText), 'Rendered text should not contain "undefined"');
  assert.ok(!/\{/.test(fullText), 'Rendered text should not contain "{"');
  assert.ok(!/\[object/.test(fullText), 'Rendered text should not contain "[object"');
});

test('Practice clicking tag chip then start passes raw tag id to onStart', async () => {
  const course = { tagLabels: { a: 'Alpha' } };
  const c = await openPractice([
    gap('a1', 'u1', { tags: ['a'] }),
    gap('a2', 'u1', { tags: ['a', 'other'] })
  ], { course });
  const calls = [];
  const Cls = c.m.sb.DojoApp._PracticeSetup;
  const inst = new Cls(Object.assign({}, c.ps.props, { onStart: (mode, opts) => calls.push([mode, opts]) }));
  inst.setState = function (p) { this.state = Object.assign({}, this.state, typeof p === 'function' ? p(this.state) : p); };
  const view = () => H.expand(inst.render(inst.props, inst.state));

  const chip = H.find(view(), 'chip-tags-a');
  assert.ok(chip, 'chip-tags-a exists');
  chip.props.onClick();
  H.find(view(), 'btn-start').props.onClick();

  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0][0], 'practice');
  assert.deepStrictEqual(Array.from(calls[0][1].tags), ['a']);
});

test('Practice with course without tagLabels keeps chips uppercased', async () => {
  const c = await openPractice([
    gap('a1', 'u1', { tags: ['alpha', 'beta'] })
  ], { course: {} });
  
  const v = c.ps.view();
  
  const chipAlpha = H.find(v, 'chip-tags-alpha');
  assert.ok(chipAlpha, 'Chip for tag alpha should exist');
  assert.strictEqual(H.text(chipAlpha), 'ALPHA', 'Tag without label should be uppercased');
  
  const chipBeta = H.find(v, 'chip-tags-beta');
  assert.ok(chipBeta, 'Chip for tag beta should exist');
  assert.strictEqual(H.text(chipBeta), 'BETA', 'Tag without label should be uppercased');
  
  // Verify no undefined, object literals, or arrays appear in rendered text
  const fullText = H.text(v);
  assert.ok(!/undefined/.test(fullText), 'Rendered text should not contain "undefined"');
  assert.ok(!/\{/.test(fullText), 'Rendered text should not contain "{"');
  assert.ok(!/\[object/.test(fullText), 'Rendered text should not contain "[object"');
});

test('Practice hides entire tags group when all tags are internal', async () => {
  const course = { tagLabels: { a: { kind: 'internal' }, b: { kind: 'internal' } } };
  const c = await openPractice([
    gap('a1', 'u1', { tags: ['a'] }),
    gap('a2', 'u1', { tags: ['b'] })
  ], { course });
  
  const v = c.ps.view();
  
  // The tags group should be hidden (group returns null for empty values)
  assert.strictEqual(H.find(v, 'group-tags'), null, 'Tags group should be hidden when all tags are internal');
  
  // Verify no undefined, object literals, or arrays appear in rendered text
  const fullText = H.text(v);
  assert.ok(!/undefined/.test(fullText), 'Rendered text should not contain "undefined"');
  assert.ok(!/\{/.test(fullText), 'Rendered text should not contain "{"');
  assert.ok(!/\[object/.test(fullText), 'Rendered text should not contain "[object"');
});

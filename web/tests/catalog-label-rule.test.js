'use strict';
// Mutation: re-add item.prompt to topicLabel -> test 8; drop gap from listening rule -> test 2; ordinals over filtered list -> test 9.
const test = require('node:test');
const assert = require('node:assert');
const H = require('./app-harness.js');

const U = { units: [{ id: 'u1', title: 'Unit One' }] };
const it = (id, extra) => Object.assign({ id, unit: 'u1', type: 'gap', prompt: 'PROMPT-' + id, answers: ['a' + id] }, extra);
async function open(o) {
  const m = await H.mount(Object.assign({ course: U }, o));
  m.app.go('catalog');
  const cat = m.screen(m.sb.DojoApp._CatalogScreen);
  return { m, cat };
}
const label = (c, id) => H.text(H.find(c.cat.view(), 'topic-label-' + id));
const header = (c, id) => { c.cat.setState({ detailItem: c.cat.topics().find((r) => r.id === id).item }); return H.text(H.find(c.cat.view(), 'detail-title')); };

test('topic beats meta.title, intro title and listening answer', async () => {
  const c = await open({ items: [it('a', { topic: 'T', meta: { title: 'M' }, stimulus: 's', inputMode: 'numeric' })], intros: [{ id: 'a', title: 'I' }], stimuli: [{ id: 's', text: 'x', hideText: true }] });
  assert.strictEqual(label(c, 'a'), 'T');
});
test('gap with decimal inputMode and hideText stimulus shows the answer, no ordinal', async () => {
  const c = await open({ items: [it('a', { stimulus: 's', inputMode: 'decimal', answers: ['3.5'] }), it('b', { stimulus: 's', inputMode: 'decimal', answers: ['3.5'] })], stimuli: [{ id: 's', text: 'x', hideText: true }] });
  assert.strictEqual(label(c, 'a'), '3.5');
  assert.strictEqual(label(c, 'b'), '3.5');
});
test('choice with audio stimulus does not show the answer', async () => {
  const c = await open({ items: [it('a', { type: 'choice', options: ['x', 'y'], answer: 0, stimulus: 's' })], stimuli: [{ id: 's', title: 'Stim', audio: ['c'] }] });
  assert.strictEqual(label(c, 'a'), 'Stim');
});
test('glyph path value is used', async () => {
  const c = await open({ items: [it('a', { meta: { g: 'G' } })], course: { units: [{ id: 'u1', title: 'Unit One', detail: { glyph: 'meta.g' } }] } });
  assert.strictEqual(label(c, 'a'), 'G');
});
test('stimulus title with ordinal', async () => {
  const c = await open({ items: [it('a', { stimulus: 's' }), it('b', { stimulus: 's' })], stimuli: [{ id: 's', title: 'Stim' }] });
  assert.deepStrictEqual([label(c, 'a'), label(c, 'b')], ['Stim #1', 'Stim #2']);
});
test('unit title with ordinal', async () => {
  const c = await open({ items: [it('a'), it('b')] });
  assert.deepStrictEqual([label(c, 'a'), label(c, 'b')], ['Unit One #1', 'Unit One #2']);
});
test('unknown unit falls back to entity or id', async () => {
  const c = await open({ items: [it('a', { unit: 'zz', entity: 'ent' }), it('b', { unit: 'zz' })] });
  c.cat.filter({ selectedUnit: null });
  assert.deepStrictEqual([label(c, 'ent'), label(c, 'b')], ['ent', 'b']);
});
test('GUARD: no type shows the prompt in a row or header', async () => {
  const items = [it('c1', { type: 'choice', options: ['a', 'b', 'c'], answer: 0 }), it('g1'), it('k1', { type: 'card', back: 'x', answers: ['x'] }),
    it('m1', { type: 'multi', options: ['2', '4', '5'], correct: [0, 2] }), it('o1', { type: 'order', steps: ['one', 'two', 'three'] }),
    it('x1', { type: 'match', pairs: [{ left: 'FR', right: 'Paris' }, { left: 'IT', right: 'Rome' }], distractors: ['Oslo'] }),
    it('z1', { type: 'cloze', parts: ['The ', ['answer'], ' is here.'] }), it('n1', { type: 'numeric', answers: ['5'] })].map((x) => Object.assign(x, { unit: 'zz' }));
  const c = await open({ items });
  c.cat.filter({ selectedUnit: null });
  for (const i of items) {
    assert.ok(!label(c, i.id).includes('PROMPT-'), i.id);
    assert.ok(!header(c, i.id).includes('PROMPT-'), i.id);
    assert.ok(!H.text(c.cat.view()).includes('PROMPT-'), i.id);
  }
});
test('ordinals stay stable under search', async () => {
  const c = await open({ items: [it('a', { answers: ['one'] }), it('b', { answers: ['two'] }), it('c', { answers: ['three'] })] });
  c.cat.filter({ search: 'three' });
  assert.strictEqual(label(c, 'c'), 'Unit One #3');
  assert.strictEqual(header(c, 'c'), 'Unit One #3');
});
test('labels contain no undefined, object or raw keys', async () => {
  const c = await open({ items: [it('a', { meta: {} }), it('b', { topic: 5 })] });
  for (const id of ['a', 'b']) for (const s of [label(c, id), header(c, id)]) assert.ok(!/undefined|\[object|\{|catalog\./.test(s), s);
});
test('whitespace-only topic falls through', async () => {
  const c = await open({ items: [it('a', { topic: '   ' })] });
  assert.strictEqual(label(c, 'a'), 'Unit One');
});

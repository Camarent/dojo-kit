'use strict';
// Mutation coverage: min-stage rule in groups.rs entity_stats (`min_stage`, unrecorded = 0) broken -> 'entity stage uses the minimum member stage' fails.
const test = require('node:test');
const assert = require('node:assert');
const H = require('./app-harness.js');

const NOW = 1760000000000;
const gap = (id, entity, extra) => Object.assign({ id, unit: 'u1', type: 'gap', entity, prompt: 'Prompt ' + id, answers: ['ans' + id] }, extra);
const rec = (s, due) => ({ s, due, last: NOW - 1000, ok: s, bad: 0 });
// Invented fixture: t-new untouched; t-mix has stages 5/1; t-done all >= 4; t-due learned-level but one item due; t-part one recorded, one not.
const ITEMS = [
  gap('n1', 't-new'), gap('n2', 't-new'),
  gap('m1', 't-mix', { answers: ['alpha'] }), gap('m2', 't-mix'),
  gap('d1', 't-done'), gap('d2', 't-done'),
  gap('u1', 't-due'), gap('u2', 't-due'),
  gap('p1', 't-part'), gap('p2', 't-part'),
  gap('solo')
];
const RECORDS = {
  m1: rec(5, NOW + 1e9), m2: rec(1, NOW + 1e9),
  d1: rec(4, NOW + 1e9), d2: rec(6, NOW + 1e9),
  u1: rec(5, NOW - 1000), u2: rec(5, NOW + 1e9),
  p1: rec(5, NOW + 1e9)
};

async function open(o) {
  const m = await H.mount(Object.assign({ items: ITEMS }, o));
  Object.assign(m.doc.items, RECORDS);
  m.app.go('catalog');
  const cat = m.screen(m.sb.DojoApp._CatalogScreen);
  return { m, cat, ids: () => H.findAll(cat.view(), /^topic-(?!state-|mastery-|label-)/).map((n) => n.props['data-testid'].slice(6)) };
}
const chip = (c, id) => H.text(H.find(c.cat.view(), 'topic-state-' + id));
const mastery = (c, id) => H.text(H.find(c.cat.view(), 'topic-mastery-' + id));
const label = (c, id) => H.text(H.find(c.cat.view(), 'topic-label-' + id));

test('groups items by entity, default entity is the item id', async () => {
  const c = await open({ course: { units: [{ id: 'u1', title: 'U1' }] } });
  c.cat.filter({ selectedUnit: null });
  assert.deepStrictEqual(c.ids(), ['t-new', 't-mix', 't-done', 't-due', 't-part', 'solo']);
  assert.strictEqual(H.findAll(c.cat.view(), /^item-/).length, 0);
});

test('state chip: new / learning / due / learned', async () => {
  const c = await open({});
  assert.strictEqual(chip(c, 't-new'), 'New');
  assert.strictEqual(chip(c, 't-mix'), 'Learning');
  assert.strictEqual(chip(c, 't-done'), 'Learned');
  assert.strictEqual(chip(c, 't-due'), 'Review due');
  assert.strictEqual(chip(c, 't-part'), 'Learning');
});

test('mastery is the share of members at or above learnedStage', async () => {
  const c = await open({});
  assert.strictEqual(mastery(c, 't-new'), '0%');
  assert.strictEqual(mastery(c, 't-mix'), '50%');
  assert.strictEqual(mastery(c, 't-done'), '100%');
  assert.strictEqual(mastery(c, 't-part'), '50%');
});

test('entity stage uses the minimum member stage', async () => {
  const c = await open({});
  c.cat.filter({ selectedStages: ['learning'] });
  assert.deepStrictEqual(c.ids(), ['t-mix', 't-part']);
  c.cat.filter({ selectedStages: ['review'] });
  assert.deepStrictEqual(c.ids(), ['t-done', 't-due']);
  c.cat.filter({ selectedStages: ['new'] });
  assert.deepStrictEqual(c.ids(), ['t-new', 'solo']);
});

test('search works and the count is in topics', async () => {
  const c = await open({});
  c.cat.filter({ search: 'alpha' });
  assert.deepStrictEqual(c.ids(), ['t-mix']);
  assert.strictEqual(H.text(H.find(c.cat.view(), 'catalog-count')), '1 topic');
});

test('topic title: meta.title wins over everything else', async () => {
  const c = await open({ items: [
    Object.assign(gap('t1', 'ent1'), { meta: { title: 'My Title', kanji: '日本語', ru: 'японский' } })
  ] });
  assert.strictEqual(label(c, 'ent1'), 'My Title');
});

test('topic title: no meta.title uses the entity intro title', async () => {
  const c = await open({ items: [gap('t2', 'ent2', { meta: { kanji: 'x' } })], intros: [{ id: 'ent2', title: 'Intro Word', text: 'gloss' }] });
  assert.strictEqual(label(c, 'ent2'), 'Intro Word');
});

test('topic title: meta.title beats the intro title', async () => {
  const c = await open({ items: [gap('t3', 'ent3', { meta: { title: 'Meta' } })], intros: [{ id: 'ent3', title: 'Intro' }] });
  assert.strictEqual(label(c, 'ent3'), 'Meta');
});

test('topic title: no topic source never shows the prompt; unit title is used', async () => {
  const c = await open({ items: [gap('t4', 'ent4', { prompt: 'Hiragana: a' })], course: { units: [{ id: 'u1', title: 'U1' }] } });
  assert.strictEqual(label(c, 'ent4'), 'U1');
});

test('topic title: unknown unit falls back to entity, then item id', async () => {
  const c = await open({ items: [gap('t5', 'ent5', { unit: 'zz' }), gap('solo2', undefined, { unit: 'zz' })], course: { units: [{ id: 'u1', title: 'U1' }] } });
  c.cat.filter({ selectedUnit: null });
  assert.strictEqual(label(c, 'ent5'), 'ent5');
  assert.strictEqual(label(c, 'solo2'), 'solo2');
});

test('same-title rows in a unit get " #N" ordinals; unique titles get none', async () => {
  const same = (id) => gap(id, undefined, { topic: 'Same topic' });
  const c = await open({ items: [same('s1'), same('s2'), same('s3'), gap('uq')] });
  assert.deepStrictEqual(['s1', 's2', 's3'].map((id) => label(c, id)), ['Same topic #1', 'Same topic #2', 'Same topic #3']);
  assert.ok(!/#/.test(label(c, 'uq')));
});

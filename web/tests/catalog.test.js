'use strict';
// Mutation coverage (each restored): drop the `internal` filter in allTags -> 'internal tags are hidden' fails;
// drop item.meta/answers/intro from buildIndex -> 'search finds ...' tests fail; slice(0, s.limit) -> 'pages of 50' fails.
const test = require('node:test');
const assert = require('node:assert');
const H = require('./app-harness.js');

const gap = (id, unit, extra) => Object.assign({ id, unit, type: 'gap', prompt: 'Prompt ' + id, answers: ['ans' + id] }, extra);

async function open(items, o) {
  const m = await H.mount(Object.assign({ items }, o));
  m.app.go('catalog');
  const cat = m.screen(m.sb.DojoApp._CatalogScreen);
  return { m, cat, ids: () => H.findAll(cat.view(), /^topic-(?!state-|mastery-|label-)/).map((n) => n.props['data-testid'].slice(6)), count: () => H.text(H.find(cat.view(), 'catalog-count')) };
}

test('All tab lists every unit, unit tab narrows', async () => {
  const c = await open([gap('a', 'u1'), gap('b', 'u2')]);
  assert.deepStrictEqual(c.ids(), ['a']);
  c.cat.filter({ selectedUnit: null });
  assert.deepStrictEqual(c.ids(), ['a', 'b']);
  assert.ok(H.find(c.cat.view(), 'tab-all'));
});

test('internal tags are hidden, labels come from tagInfo (string and object form)', async () => {
  const course = { tagLabels: { n5: 'JLPT N5', verb: { label: 'Verbs' }, mondai1: { kind: 'internal' }, hid: { label: 'Hid', kind: 'internal' } } };
  const c = await open([gap('a', 'u1', { tags: ['n5', 'verb', 'mondai1', 'hid', 'plain'] })], { course });
  const v = c.cat.view();
  assert.strictEqual(H.find(v, 'tag-mondai1'), null);
  assert.strictEqual(H.find(v, 'tag-hid'), null);
  assert.strictEqual(H.text(H.find(v, 'tag-n5')), 'JLPT N5');
  assert.strictEqual(H.text(H.find(v, 'tag-verb')), 'Verbs');
  assert.strictEqual(H.text(H.find(v, 'tag-plain')), 'PLAIN');
});

test('tag chips beyond 12 are collapsed behind More', async () => {
  const tags = Array.from({ length: 15 }, (_, i) => 't' + String(i).padStart(2, '0'));
  const c = await open([gap('a', 'u1', { tags })]);
  const n = () => H.findAll(c.cat.view(), /^tag-t/).length;
  assert.strictEqual(n(), 12);
  assert.ok(H.find(c.cat.view(), 'tag-more'));
  c.cat.setState({ tagsOpen: true });
  assert.strictEqual(n(), 15);
});

test('search finds by answer, explanation, meta strings and intro text', async () => {
  const items = [
    gap('a', 'u1', { answers: ['plain', 'zebra'] }),
    gap('b', 'u1', { explanation: 'about quokka' }),
    gap('c', 'u1', { meta: { deep: { list: ['narwhal'] } } }),
    gap('d', 'u1', { entity: 'E' })
  ];
  const c = await open(items, { intros: [{ id: 'E', title: 'T', text: 'platypus facts' }] });
  const q = (s) => { c.cat.filter({ search: s }); return c.ids(); };
  assert.deepStrictEqual(q('zebra'), ['a']);
  assert.deepStrictEqual(q('QUOKKA'), ['b']);
  assert.deepStrictEqual(q('narwhal'), ['c']);
  assert.deepStrictEqual(q('platypus'), ['E']);
  assert.ok(/1 topic/.test(c.count()));
});

test('pages of 50 with Show more; count is the total; filter change resets the page', async () => {
  const items = Array.from({ length: 120 }, (_, i) => gap('i' + String(i).padStart(3, '0'), 'u1'));
  const c = await open(items);
  assert.strictEqual(c.ids().length, 50);
  assert.ok(/120/.test(c.count()));
  c.cat.setState({ limit: c.cat.state.limit + 50 });
  assert.strictEqual(c.ids().length, 100);
  c.cat.filter({ search: 'prompt' });
  assert.strictEqual(c.ids().length, 50);
  c.cat.setState({ limit: 150 });
  assert.strictEqual(H.find(c.cat.view(), 'catalog-more'), null);
});

test('stage filter chips narrow by entity stage in topics mode', async () => {
  const c = await open([gap('a', 'u1'), gap('b', 'u1')]);
  c.m.engine.stage = (it) => (it.id === 'a' ? 'learning' : 'new');
  c.cat.filter({ selectedStages: ['new'] });
  assert.deepStrictEqual(c.ids(), ['a', 'b']);
  assert.ok(H.find(c.cat.view(), 'filter-stage-review'));
});

test('catalog detail shows the entity intro through the same hook', async () => {
  const c = await open([gap('a', 'u1', { entity: 'E' })], { intros: [{ id: 'E', title: 'Intro T', text: 'Intro body' }] });
  c.cat.setState({ detailItem: c.m.app.props.byId.a });
  const v = c.cat.view();
  assert.ok(/Intro T/.test(H.text(H.find(v, 'detail-intro'))));
  c.m.sb.DojoExt.registerIntro((intro) => 'HOOK ' + intro.title);
  assert.ok(/HOOK Intro T/.test(H.text(H.find(c.cat.view(), 'detail-intro'))));
});

test('group toggle label uses tagInfo (object form)', async () => {
  const groups = [{ id: 'g', title: 'G', units: ['u1'], newPerDay: 2, extraNew: true, extraTags: ['n5'] }];
  const m = await H.mount({ items: [gap('a', 'u1', { tags: ['n5'] })], course: { groups, tagLabels: { n5: { label: 'JLPT N5' } } } });
  assert.strictEqual(H.text(H.find(m.tree(), 'toggle-onlyTags-g')), 'Only JLPT N5');
});

test('catalog intro lookup ignores Object.prototype names ("constructor" entity, "__proto__" intro id)', async () => {
  const c = await open([gap('a', 'u1', { entity: 'constructor' }), gap('b', 'u1', { entity: 'E' })], { intros: [{ id: '__proto__', title: 'P' }, { id: 'E', title: 'Intro E' }] });
  assert.strictEqual(c.cat.introOf({ id: 'a', entity: 'constructor' }), null);
  assert.strictEqual(c.cat.introOf({ id: 'b', entity: 'E' }).title, 'Intro E');
});

'use strict';
// Catalog titles render ruby on every kanji, also for kanji in the course ruby skip set.
// Mutation (restored): switch the row title back to renderText -> 'row title keeps ruby on skipped kanji' fails.
// Japanese text is built from code points: core-latin test forbids raw Han/kana in source.
const test = require('node:test');
const assert = require('node:assert');
const H = require('./app-harness.js');

const jp = (...cps) => String.fromCodePoint(...cps);
// SKIP: the three kanji of the skip set; TITLE: ruby markup of the same three words.
const SKIP = jp(0x6708, 0x66dc, 0x65e5);
const TITLE = '{' + jp(0x6708) + '|' + jp(0x3052, 0x3064) + '}{' + jp(0x66dc) + '|' + jp(0x3088, 0x3046) + '}{' + jp(0x65e5) + '|' + jp(0x3073) + '}';

const gap = (id, unit, extra) => Object.assign({ id, unit, type: 'gap', prompt: 'Prompt ' + id, answers: ['ans' + id] }, extra);
const rubies = (n) => { const r = []; H.walk(n, (x) => { if (x.type === 'ruby') r.push(x); }); return r.length; };

// The harness does not run course hooks, so the ruby skip set is applied here like the app does on course load.
async function open(items, o) {
  const m = await H.mount(Object.assign({ items }, o));
  m.sb.DojoExt.useRuby({ skip: SKIP }, items);
  m.sb.DojoExt.use('ruby');
  m.app.go('catalog');
  const cat = m.screen(m.sb.DojoApp._CatalogScreen);
  return { m, cat, ids: () => H.findAll(cat.view(), /^topic-(?!state-|mastery-|label-)/).map((n) => n.props['data-testid'].slice(6)) };
}

test('row title keeps ruby on every kanji, also for kanji in the ruby skip set', async () => {
  const course = { ruby: { skip: SKIP } };
  const c = await open([gap('a', 'u1', { topic: TITLE })], { course });
  const label = H.find(c.cat.view(), 'topic-label-a');
  assert.ok(label, 'row label exists');
  assert.strictEqual(rubies(label), 3);
});

test('card title keeps ruby on every kanji, also for kanji in the ruby skip set', async () => {
  const course = { ruby: { skip: SKIP } };
  const item = gap('a', 'u1', { topic: TITLE });
  const c = await open([item], { course });
  c.cat.setState({ detailItem: item });
  const title = H.find(c.cat.view(), 'detail-title');
  assert.ok(title, 'card title exists');
  assert.strictEqual(rubies(title), 3);
});

test('search by plain text finds a ruby-marked title', async () => {
  const course = { ruby: { skip: SKIP } };
  const c = await open([gap('a', 'u1', { topic: TITLE }), gap('b', 'u1', { topic: 'other' })], { course });
  c.cat.filter({ search: SKIP });
  assert.deepStrictEqual(c.ids(), ['a']);
});

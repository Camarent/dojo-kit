'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { find, findAll, text, walk, mount, NOW } = require('./app-harness.js');

const DAY = 86400000;

function gap(id, unit, tags, meta) {
  const it = { id, unit, type: 'gap', prompt: 'Q ' + id, answers: ['a'], explanation: 'e', tags };
  if (meta) it.meta = meta;
  return it;
}

const COURSE = {
  id: 'c',
  title: 'C',
  units: [{ id: 'u', srs: { scope: 'unit' } }],
  groups: [{ id: 'g', title: 'G', units: ['u'] }],
  topics: { aspects: [{ id: 'reading', tags: ['reading'] }, { id: 'meaning', tags: ['meaning'] }] }
};

const ITEMS = [
  gap('r1', 'u', ['reading'], { kanji: '\u8db3' }),
  gap('r2', 'u', ['reading'], { kanji: '\u51fa' }),
  gap('m1', 'u', ['meaning'], { kanji: '\u4f11' }),
  gap('m2', 'u', ['meaning']),
  gap('m3', 'u', ['meaning'])
];

// Every item due and failed once: all are weak and due, so the plan has items to show.
function dueAll(items) {
  const out = {};
  items.forEach((it) => { out[it.id] = { s: 0, bad: 1, ok: 0, due: NOW - DAY }; });
  return out;
}

test('home plan: numbers on screen equal the plan of the next session', async () => {
  const m = await mount({ items: ITEMS, course: COURSE, lang: 'en' });
  Object.assign(m.doc.items, dueAll(ITEMS));
  m.app.refresh();
  const plan = m.engine.counts().plan;
  assert.ok(plan.total > 0, 'plan has questions');
  const totalText = text(find(m.tree(), 'plan-total'));
  assert.ok(totalText.includes(String(plan.total)), 'plan-total shows ' + plan.total + ': ' + totalText);
  const session = m.engine.start('daily');
  assert.strictEqual(session.total, plan.total, 'next session size equals plan.total');
});

test('home plan: no warn line under capacity', async () => {
  const m = await mount({ items: ITEMS, course: COURSE, lang: 'en' });
  Object.assign(m.doc.items, dueAll(ITEMS));
  m.app.refresh();
  assert.strictEqual(m.engine.counts().plan.warnMinutes, 0);
  assert.strictEqual(find(m.tree(), 'plan-warn'), null, 'no warn line');
});

test('home plan: warn line with the minutes when the plan is over capacity', async () => {
  const course = { ...COURSE, session: { sessionMode: 'manual', sessionCap: 1 } };
  const m = await mount({ items: ITEMS, course, lang: 'en' });
  Object.assign(m.doc.items, dueAll(ITEMS));
  m.app.refresh();
  const plan = m.engine.counts().plan;
  assert.ok(plan.warnMinutes > 0, 'plan is over capacity');
  const warn = text(find(m.tree(), 'plan-warn'));
  assert.ok(warn.includes(String(plan.warnMinutes)), 'warn line shows ' + plan.warnMinutes + ': ' + warn);
});

test('home weak chips: aspect label and written form, no ellipsis, different aspects', async () => {
  const m = await mount({ items: ITEMS, course: COURSE, lang: 'en' });
  Object.assign(m.doc.items, dueAll(ITEMS));
  m.app.refresh();
  const chipTexts = [];
  walk(find(m.tree(), 'weak-chips'), (n) => {
    if (n.props && n.props.class === 'chip-text') chipTexts.push(text(n));
  });
  assert.ok(chipTexts.includes('Reading \u8db3'), 'reading chip: ' + chipTexts.join(' | '));
  assert.ok(chipTexts.includes('Meaning \u4f11'), 'meaning chip: ' + chipTexts.join(' | '));
  assert.ok(chipTexts.includes('Meaning'), 'item without kanji: aspect label only: ' + chipTexts.join(' | '));
  chipTexts.forEach((c) => assert.ok(!c.endsWith('…'), 'no ellipsis: ' + c));
  assert.strictEqual(findAll(m.tree(), /^weak-chips/).length, 1);
});

test('home weak chips: meta.entry is the written form when there is no kanji', async () => {
  const word = String.fromCharCode(0x306a, 0x3089, 0x3079, 0x308b);
  const items = [gap('e1', 'u', ['reading'], { entry: word })];
  const m = await mount({ items, course: COURSE, lang: 'en' });
  Object.assign(m.doc.items, dueAll(items));
  m.app.refresh();
  const chipTexts = [];
  walk(find(m.tree(), 'weak-chips'), (n) => {
    if (n.props && n.props.class === 'chip-text') chipTexts.push(text(n));
  });
  assert.deepStrictEqual(chipTexts, ['Reading ' + word]);
});

test('home weak chips: every aspect id of the n5 course has a label in all locales', () => {
  const path = require('node:path');
  const course = require(path.join(__dirname, '..', '..', 'workspace', 'n5', 'course.json'));
  const aspects = course.topics.aspects.map((a) => a.id);
  ['en', 'ru', 'fr', 'ja'].forEach((lang) => {
    const loc = require('../i18n/' + lang + '.json');
    aspects.forEach((id) => assert.ok(loc['home.weak.aspect.' + id], lang + ' label for aspect ' + id));
  });
});

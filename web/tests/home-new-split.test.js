'use strict';
// Mutation check: drop the 'other' part in counts.js summarize -> 'parts' and 'sum' tests fail.
const test = require('node:test');
const assert = require('node:assert');
const { read, find, text, mount } = require('./app-harness.js');

function mk(prefix, unit, n) {
  const r = [];
  for (let i = 0; i < n; i++) r.push({ id: prefix + i, unit, type: 'gap', prompt: 'Q', answers: ['a'], explanation: 'e' });
  return r;
}
const ITEMS = [].concat(mk('k', 'kanji', 14), mk('g', 'grammar', 6), mk('o', 'misc', 9));
const COURSE = {
  newPerDay: 40,
  units: [{ id: 'kanji', title: 'Kanji' }, { id: 'grammar', title: 'Grammar' }, { id: 'misc', title: 'Misc', newPerDay: 5 }],
  groups: [{ id: 'kw', title: 'Кандзи и слова', units: ['kanji'], newPerDay: 10 }, { id: 'gr', title: 'Grammar', units: ['grammar'], newPerDay: 2 }]
};

test('summary.parts: groups in order then other; sum equals newToday', async () => {
  const m = await mount({ items: ITEMS, course: COURSE });
  const s = m.engine.counts().summary;
  assert.strictEqual(s.newToday, 17);
  assert.strictEqual(JSON.stringify(s.parts.map((p) => [p.id, p.newToday])), JSON.stringify([['kw', 10], ['gr', 2], ['other', 5]]));
  assert.strictEqual(s.parts.reduce((a, p) => a + p.newToday, 0), s.newToday);
});

for (const lang of ['en', 'ru']) {
  test('Home split line (' + lang + '): no raw keys or undefined', async () => {
    const m = await mount({ items: ITEMS, course: COURSE, lang });
    const line = text(find(m.tree(), 'stats-note'));
    assert.ok(/10/.test(line) && /2/.test(line) && /5/.test(line), line);
    assert.ok(line.includes(' · '), line);
    assert.ok(!/undefined|NaN|home\.stat/.test(line), line);
    const other = JSON.parse(read('i18n/' + lang + '.json'))['home.stat.newOther'];
    assert.ok(line.includes(other + ' 5'), line);
  });
}

test('course without groups shows no split line', async () => {
  const m = await mount({ items: ITEMS, course: { units: COURSE.units } });
  assert.strictEqual(find(m.tree(), 'stats-note'), null);
});

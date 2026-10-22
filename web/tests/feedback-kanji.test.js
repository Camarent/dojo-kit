'use strict';
// Mutation coverage: remove the kanjiRows call from renderFeedback -> every test fails.
const test = require('node:test');
const assert = require('node:assert');
const H = require('./app-harness.js');

const kanji = (id, prompt, extra) => Object.assign({ id, unit: 'u1', type: 'card', prompt, back: prompt, tags: ['t1'], meta: { kanji: id, en: prompt + '-mean' } }, extra);
const word = (id, prompt, extra) => Object.assign({ id, unit: 'u1', type: 'gap', prompt, answers: [prompt], tags: ['t1'], meta: {} }, extra);

// Word item first, then kanji items
const wordItem = word('w-学校', '学校');
const kanjiItems = [
  kanji('学', '学', { on: ['ガク'], kun: ['まな'] }),
  kanji('校', '校', { on: ['コウ'], kun: ['かの'] })
];

const allItems = [wordItem].concat(kanjiItems);
const course = { contentLanguage: 'en', tagLabels: { t1: 'Tag One' } };

async function start(o) {
  const items = o && o.items ? o.items : allItems;
  const m = await H.mount(Object.assign({ items, course }, o));
  m.app.startMode('daily', {});
  const scr = m.screen(m.sb.DojoApp._SessionScreen);
  return { m, scr };
}

test('content has kanji items and a word item shows 2 rows with meanings', async () => {
  const { scr } = await start();
  scr.answer({ text: 'wrong' });
  
  const fb = H.find(scr.view(), 'kanji-rows');
  assert.ok(fb, 'kanji-rows should be present');
  
  const label = H.find(scr.view(), 'kanji-label');
  assert.ok(label, 'kanji-label should be present');
  assert.ok(/Kanji in this word/.test(H.text(label)), 'Label text should match');
  
  const rows = H.findAll(scr.view(), /^kanji-row$/);
  assert.strictEqual(rows.length, 2, 'Should have 2 kanji rows');
  
  const fullText = H.text(fb);
  assert.ok(/学/.test(fullText), 'Should contain 学 kanji');
  assert.ok(/校/.test(fullText), 'Should contain 校 kanji');
  assert.ok(/学-mean/.test(fullText), 'Should contain learning meaning');
  assert.ok(/校-mean/.test(fullText), 'Should contain school meaning');
  assert.ok(/undefined/.test(fullText) === false, 'Should not contain undefined');
  assert.ok(/\{/.test(fullText) === false, 'Should not contain {');
  assert.ok(/\[object/.test(fullText) === false, 'Should not contain [object');
});

test('a kanji without an item in the course is absent from the rows', async () => {
  // Create a word with a kanji that has no item (月)
  const wordWithMissing = word('w-学校月', '学校月');
  const items = [wordWithMissing].concat(kanjiItems);
  
  const { scr } = await start({ items });
  scr.answer({ text: 'wrong' });
  
  const fb = H.find(scr.view(), 'kanji-rows');
  assert.ok(fb, 'kanji-rows should be present');
  
  const fullText = H.text(fb);
  assert.ok(/学/.test(fullText), 'Should contain 学');
  assert.ok(/校/.test(fullText), 'Should contain 校');
  assert.ok(/月/.test(fullText) === false, 'Should not contain 月 (no item for it)');
  
  assert.ok(/undefined/.test(fullText) === false, 'Should not contain undefined');
  assert.ok(/\{/.test(fullText) === false, 'Should not contain {');
  assert.ok(/\[object/.test(fullText) === false, 'Should not contain [object');
});

test('exam mode shows no rows', async () => {
  const items = [word('w-学校', '学校', { tags: ['tw'] })].concat(kanjiItems);
  const ex = Object.assign({ exam: { passMark: 0.5, sections: [{ title: 'A', count: 1, tags: ['tw'] }] } }, course);
  for (const text of ['wrong', '学校']) {
    const m = await H.mount({ items, course: ex });
    m.app.startMode('exam', {});
    const scr = m.screen(m.sb.DojoApp._SessionScreen);
    scr.answer({ text });
    assert.strictEqual(H.find(scr.view(), 'kanji-rows'), null, 'kanji-rows should not be present in exam mode (' + text + ')');
  }
});

test('a kanji item itself shows no rows', async () => {
  // Start with a kanji item first
  const items = [kanjiItems[0]].concat(kanjiItems.slice(1));
  
  const { scr } = await start({ items });
  scr.answer({ text: 'wrong' });
  
  const fb = H.find(scr.view(), 'kanji-rows');
  assert.strictEqual(fb, null, 'kanji-rows should not be present for a kanji item itself');
});

test('correct answer shows kanji rows too', async () => {
  const { scr } = await start();
  scr.answer({ text: '学校' });
  
  const fb = H.find(scr.view(), 'kanji-rows');
  assert.ok(fb, 'kanji-rows should be present for correct answers');
  
  const rows = H.findAll(scr.view(), /^kanji-row$/);
  assert.strictEqual(rows.length, 2, 'Should have 2 kanji rows for correct answer');
  
  const fullText = H.text(fb);
  assert.ok(/undefined/.test(fullText) === false, 'Should not contain undefined');
  assert.ok(/\{/.test(fullText) === false, 'Should not contain {');
  assert.ok(/\[object/.test(fullText) === false, 'Should not contain [object');
});

test('empty kun reading should not show trailing slash', async () => {
  const items = [
    word('w-曜日', '曜日'),
    Object.assign(kanji('曜', '曜'), { meta: Object.assign({ kanji: '曜', en: '曜-mean' }, { on: ['ヨウ'], kun: [] }) }),
    Object.assign(kanji('日', '日'), { meta: Object.assign({ kanji: '日', en: '日-mean' }, { on: ['ニチ'], kun: [] }) })
  ];
  const { scr } = await start({ items, course: course });
  scr.answer({ text: 'wrong' });
  
  const fb = H.find(scr.view(), 'kanji-rows');
  assert.ok(fb, 'kanji-rows should be present');
  
  const fullText = H.text(fb);
  assert.ok(/\/\s*$/.test(fullText) === false, 'Should not have trailing / when kun is empty');
  assert.ok(/ヨウ/.test(fullText), 'Should contain on reading');
});

test('both on and kun present should show on / kun structure in separate elements', async () => {
  const items = [
    word('w-学校', '学校'),
    Object.assign(kanji('学', '学'), { meta: Object.assign({ kanji: '学', en: '学-mean' }, { on: ['ガク'], kun: ['まな'] }) }),
    Object.assign(kanji('校', '校'), { meta: Object.assign({ kanji: '校', en: '校-mean' }, { on: ['コウ'], kun: ['かの'] }) })
  ];
  const { scr } = await start({ items, course: course });
  scr.answer({ text: 'wrong' });
  
  const readEl = H.find(scr.view(), 'kanji-read');
  assert.ok(readEl, 'kanji-read element should be present');
  
  const onEl = H.find(scr.view(), 'kanji-on');
  assert.ok(onEl, 'kanji-on element should be present');
  
  const kunEl = H.find(scr.view(), 'kanji-kun');
  assert.ok(kunEl, 'kanji-kun element should be present');
  
  const readText = H.text(readEl);
  assert.strictEqual(readText, 'ガク / まな', 'Should show exact on / kun structure');
});

test('no kanji rows before the answer', async () => {
  const { scr } = await start();
  assert.strictEqual(H.find(scr.view(), 'kanji-rows'), null);
});

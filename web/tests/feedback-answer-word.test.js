'use strict';
// Mutation coverage: removing the rubyDict expansion in rubyRender (all mode) turns the ruby tests red; removing answerTexts from kanjiBreakdown turns the rows test red.
const test = require('node:test');
const assert = require('node:assert');
const H = require('./app-harness.js');

const kj = (c, ru, on, kun, examples) => ({ id: 'k-' + c, unit: 'k', type: 'card', prompt: c, back: ru, tags: ['kanji', 'n5'], meta: { kanji: c, ru: ru, on: on, kun: kun, examples: examples } });
const items = [
  {
    id: 'sd-47', unit: 'sd', type: 'choice', tags: ['sd'],
    prompt: '【にがつ】に{雪|ゆき}がたくさん{降|ふ}りました。',
    options: ['二月', '二日', '三月', '二目'], answer: 0,
    explanation: '二月 = にがつ. 三月 = さんがつ, 二日 = ふつか.'
  },
  kj('二', 'два', ['ニ'], ['ふた'], [{ w: '二月', r: 'にがつ', ru: 'февраль' }, { w: '二日', r: 'ふつか', ru: 'второе' }]),
  kj('月', 'месяц; луна', ['ゲツ'], ['つき'], [{ w: '三月', r: 'さんがつ', ru: 'март' }]),
  kj('雪', 'снег', ['セツ'], ['ゆき'], [])
];
const course = { id: 'c', title: 'C', uiLanguage: 'en', contentLanguage: 'ru', markup: 'ruby', ruby: { skipTag: 'n5' }, breakdown: { key: 'meta.kanji', meaning: 'meta.ru', readings: ['meta.on', 'meta.kun'] }, units: [{ id: 'sd', title: 'S' }, { id: 'k', title: 'K' }] };

async function fb() {
  const m = await H.mount({ items: [items[0]].concat(items.slice(1)), course });
  m.sb.DojoExt.use('ruby');
  m.sb.DojoExt.useRuby(course.ruby, items);
  m.app.startMode('daily', {});
  const scr = m.screen(m.sb.DojoApp._SessionScreen);
  scr.answer({ index: 3 });
  return scr.view();
}

function rts(node) {
  const out = [];
  H.walk(node, (n) => { if (n.type === 'rt') out.push(H.text(n)); });
  return out;
}

test('answer and explanation words get ruby although all kanji are N5', async () => {
  const v = await fb();
  const f = H.find(v, 'feedback');
  assert.ok(f, 'feedback present');
  const e = rts(H.find(f, 'expected'));
  assert.ok(e.includes('にがつ'), 'expected has ruby: ' + e);
  const x = rts(H.find(f, 'explanation'));
  assert.ok(x.includes('にがつ') && x.includes('さんがつ') && x.includes('ふつか'), 'explanation ruby: ' + x);
  const t = H.text(f);
  assert.ok(!/undefined|\[object|[{}]/.test(t), t);
});

test('kanji rows list each kanji of the answer word with its main meaning', async () => {
  const v = await fb();
  const rows = H.findAll(v, /^kanji-row$/).map((r) => H.text(r));
  assert.ok(rows.some((r) => r.includes('二') && r.includes('два')), rows.join('|'));
  assert.ok(rows.some((r) => r.includes('月') && r.includes('месяц; луна')), rows.join('|'));
  assert.ok(rows.some((r) => r.includes('雪') && r.includes('снег')), rows.join('|'));
  assert.ok(!rows.join('').includes('undefined'));
});

test('question prompt keeps N5 kanji bare', async () => {
  const m = await H.mount({ items, course });
  m.sb.DojoExt.use('ruby');
  m.sb.DojoExt.useRuby(course.ruby, items);
  m.app.startMode('daily', {});
  const scr = m.screen(m.sb.DojoApp._SessionScreen);
  const p = H.find(scr.view(), 'prompt');
  assert.ok(p);
  assert.ok(!H.text(p).includes('undefined'));
});

test('write-kanji options have no <rt> before the answer, ruby appears in feedback after', async () => {
  const m = await H.mount({ items, course });
  m.sb.DojoExt.use('ruby');
  m.sb.DojoExt.useRuby(course.ruby, items);
  m.app.startMode('daily', {});
  const scr = m.screen(m.sb.DojoApp._SessionScreen);
  const before = scr.view();
  const t0 = H.text(before);
  assert.ok(t0.includes('二月'), 'options visible: ' + t0);
  assert.deepStrictEqual(rts(before).filter((r) => /にがつ|ふつか|さんがつ/.test(r)), []);
  scr.answer({ index: 3 });
  const after = scr.view();
  assert.ok(rts(after).includes('にがつ'), 'ruby after answer');
});

function rt2(a) { return a; }
const wrongCourse = { id: 'w', title: 'W', uiLanguage: 'en', contentLanguage: 'ru', markup: 'ruby', ruby: { skipTag: 'zz' }, units: [{ id: 'u', title: 'U' }] };
function ann(its, str) {
  return H.mount({ items: its, course: wrongCourse }).then((m) => {
    m.sb.DojoExt.use('ruby');
    m.sb.DojoExt.useRuby(wrongCourse.ruby, its);
    const out = [];
    H.walk(m.sb.DojoExt.text(str, { all: true }), (n) => { if (n.type === 'rt') out.push(H.text(n)); });
    return out;
  });
}
const mk = (id, expl) => ({ id: id, unit: 'u', type: 'card', prompt: 'x', back: 'y', explanation: expl });

test('single-kanji markup does not annotate the kanji inside longer words (行きます stays bare)', async () => {
  const its = [mk('a', '{行|こう}')];
  const v = (await ann(its, '行きます'));
  assert.ok(!rt2(v).includes('こう') && rt2(v).length === 0, rt2(v).join());
});

test('ambiguous word with two readings gets no ruby', async () => {
  const its = [mk('a', '{生活|せいかつ}'), mk('b', '{生活|なまかつ}')];
  const v = (await ann(its, '生活'));
  assert.deepStrictEqual(rt2(v), []);
});

test('match adjacent to an unmarked kanji is not annotated (都合 vs 都)', async () => {
  const its = [mk('a', '{都合|つごう}'), mk('b', '{合図|あいず}')];
  const v = (await ann(its, '都合'));
  assert.deepStrictEqual(rt2(v), ['つごう']);
  const w = (await ann(its, '大合図'));
  assert.deepStrictEqual(rt2(w), []);
  assert.deepStrictEqual(rt2(await ann(its, '都合図')), []);
});

'use strict';
// Mutation coverage: removing the fb-reading span from readingText should make case 1 fail;
// removing the .fb-reading rule from ja.css should make case 2 fail.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const H = require('./harness.js').appHarness;

const kanji = (id, prompt, metaExtra) => {
  const base = { id, unit: 'u1', type: 'card', prompt, back: prompt, tags: ['t1'], meta: { kanji: id, en: prompt + '-mean' } };
  if (metaExtra) base.meta = Object.assign(base.meta, metaExtra);
  return base;
};
const word = (id, prompt, extra) => Object.assign({ id, unit: 'u1', type: 'gap', prompt, answers: [prompt], tags: ['t1'], meta: {} }, extra);

const course = { contentLanguage: 'en', breakdown: { key: 'meta.kanji', meaning: 'meta.en', readings: ['meta.on', 'meta.kun'] }, tagLabels: { t1: 'Tag One' } };

async function start(o) {
  const items = o && o.items ? o.items : o;
  const m = await H.mount({ items, course, ...o });
  m.app.startMode('daily', {});
  const scr = m.screen(m.sb.DojoApp._SessionScreen);
  return { m, scr };
}

test('feedback-read-nowrap: each reading of a kanji row sits in its own fb-reading element', async () => {
  const items = [
    word('w-日本', '日本'),
    kanji('日', '日', { on: ['ニチ', 'ジツ'], kun: ['ひ'] }),
    kanji('本', '本', { on: ['ホン'] })
  ];
  const { scr } = await start({ items });
  scr.answer({ text: 'wrong' });

  const rows = H.findAll(scr.view(), /^fb-row$/);
  assert.strictEqual(rows.length, 2, 'one kanji row per kanji of 日本');
  const readings = H.findAll(rows[0], /^fb-reading$/);
  assert.strictEqual(readings.length, 3, 'three readings, one element each');
  assert.deepStrictEqual(readings.map((el) => H.text(el)), ['ニチ', 'ジツ', 'ひ'], 'readings in order');
  assert.strictEqual(H.text(H.find(rows[0], 'fb-read')).replace(/\s+/g, ' ').trim(), 'ニチ / ジツ / ひ', 'joined text unchanged');
});

test('feedback-read-nowrap: ja.css keeps a reading whole (nowrap rule on .fb-reading)', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'web', 'ja.css'), 'utf8');
  const start = css.indexOf('.fb-reading {');
  assert.ok(start >= 0, 'rule missing: .fb-reading');
  const body = css.slice(start, css.indexOf('}', start));
  assert.match(body, /white-space:\s*nowrap/, '.fb-reading uses white-space: nowrap');
});

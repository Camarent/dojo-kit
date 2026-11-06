'use strict';
// Guard: pins the feedback-rows markup (testids, classes, label and reading texts) rendered by the core
// after a wrong gap answer on a two-kanji prompt with the ja breakdown. Unit of the rename: function, class, testid.
// Japanese text is written as \u escapes: core tests must stay latin-only (core-latin check).
const test = require('node:test');
const assert = require('node:assert');
const H = require('./harness.js').appHarness;

const NICHI = String.fromCharCode(0x65e5);
const HON = String.fromCharCode(0x672c);
const NICHIHON = NICHI + HON;
const ON_NICHI = String.fromCharCode(0x30cb, 0x30c1);
const ON_JITSU = String.fromCharCode(0x30b8, 0x30c4);
const KUN_HI = String.fromCharCode(0x3072);
const KUN_BI = String.fromCharCode(0x3073);
const ON_HON = String.fromCharCode(0x30db, 0x30f3);
const KUN_MOTO = String.fromCharCode(0x3082, 0x3068);

const kanji = (id, prompt, metaExtra) => {
  const base = { id, unit: 'u1', type: 'card', prompt, back: prompt, tags: ['t1'], meta: { kanji: id, en: prompt + '-mean' } };
  if (metaExtra) base.meta = Object.assign(base.meta, metaExtra);
  return base;
};
const word = (id, prompt, extra) => Object.assign({ id, unit: 'u1', type: 'gap', prompt, answers: [prompt], tags: ['t1'], meta: {} }, extra);

const course = { contentLanguage: 'en', breakdown: { key: 'meta.kanji', meaning: 'meta.en', readings: ['meta.on', 'meta.kun'] }, tagLabels: { t1: 'Tag One' } };

async function feedbackRows() {
  const items = [
    word('w-' + NICHIHON, NICHIHON),
    kanji(NICHI, NICHI, { on: [ON_NICHI, ON_JITSU], kun: [KUN_HI, KUN_BI] }),
    kanji(HON, HON, { on: [ON_HON], kun: [KUN_MOTO] })
  ];
  const m = await H.mount({ items, course });
  m.app.startMode('daily', {});
  const scr = m.screen(m.sb.DojoApp._SessionScreen);
  scr.answer({ text: 'wrong' });
  const view = scr.view();
  const root = H.find(view, 'fb-rows');
  assert.ok(root, 'rows container rendered');
  return { root, view };
}

// [testid, class] for every node of the rows subtree, in document order.
const shape = (root) => H.findAll(root, /.*/).map((n) => [n.props['data-testid'], n.props.class || '']);

test('feedback rows: testid and class pairs of the rendered markup are pinned', async () => {
  const { root } = await feedbackRows();
  assert.deepStrictEqual(shape(root), [
    ['fb-rows', 'fb-rows'],
    ['fb-label', 'muted'],
    ['fb-row', 'fb-row-grid'],
    ['fb-ch', 'glyph-ch'],
    ['fb-mean', 'fb-mean'],
    ['fb-read', 'fb-read muted'],
    ['fb-on', ''],
    ['fb-kun', ''],
    ['fb-row', 'fb-row-grid'],
    ['fb-ch', 'glyph-ch'],
    ['fb-mean', 'fb-mean'],
    ['fb-read', 'fb-read muted'],
    ['fb-on', ''],
    ['fb-kun', '']
  ]);
});

test('feedback rows: label and reading texts are pinned', async () => {
  const { root } = await feedbackRows();
  const rows = H.findAll(root, /^fb-row$/);
  assert.strictEqual(rows.length, 2, 'one row per kanji of the word');
  assert.strictEqual(H.text(H.find(root, 'fb-label')), 'Breakdown');
  assert.strictEqual(H.text(H.find(rows[0], 'fb-ch')), NICHI);
  assert.strictEqual(H.text(H.find(rows[0], 'fb-on')), ON_NICHI + ' / ' + ON_JITSU);
  assert.strictEqual(H.text(H.find(rows[0], 'fb-kun')), KUN_HI + ' / ' + KUN_BI);
  assert.strictEqual(H.text(H.find(rows[1], 'fb-on')), ON_HON);
  assert.strictEqual(H.text(H.find(rows[1], 'fb-kun')), KUN_MOTO);
});

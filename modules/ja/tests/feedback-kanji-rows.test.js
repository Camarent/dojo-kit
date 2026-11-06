'use strict';
// Mutation coverage: temporarily making kanjiRows return null should make cases 1 and 4 fail.
const test = require('node:test');
const assert = require('node:assert');
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

test('kanji-rows: gap item with 日本 prompt shows 2 rows with readings in separate elements', async () => {
  const items = [
    word('w-日本', '日本'),
    kanji('日', '日', { on: ['ニチ', 'ジツ'], kun: ['ひ', 'び'] }),
    kanji('本', '本', { on: ['ホン'], kun: ['もと'] })
  ];
  const { scr } = await start({ items });
  scr.answer({ text: 'wrong' });

  const fb = H.find(scr.view(), 'fb-rows');
  assert.ok(fb, 'kanji-rows should be present');

  const label = H.find(scr.view(), 'fb-label');
  assert.ok(label, 'kanji-label should be present');

  const rows = H.findAll(scr.view(), /^fb-row$/);
  assert.strictEqual(rows.length, 2, 'Should have 2 kanji rows for 日本');

  const row0 = rows[0];
  const row1 = rows[1];

  const ch0 = H.find(row0, 'fb-ch');
  const ch1 = H.find(row1, 'fb-ch');
  assert.strictEqual(H.text(ch0), '日', 'First row kanji-ch should be 日');
  assert.strictEqual(H.text(ch1), '本', 'Second row kanji-ch should be 本');

  const on0 = H.find(row0, 'fb-on');
  const on1 = H.find(row1, 'fb-on');
  assert.strictEqual(H.text(on0), 'ニチ / ジツ', 'First row kanji-on should be ニチ / ジツ');
  assert.strictEqual(H.text(on1), 'ホン', 'Second row kanji-on should be ホン');

  const kun0 = H.find(row0, 'fb-kun');
  const kun1 = H.find(row1, 'fb-kun');
  assert.strictEqual(H.text(kun0), 'ひ / び', 'First row kanji-kun should be ひ / び');
  assert.strictEqual(H.text(kun1), 'もと', 'Second row kanji-kun should be もと');

  const read0 = H.find(row0, 'fb-read');
  const read1 = H.find(row1, 'fb-read');
  assert.strictEqual(H.text(read0).replace(/\s+/g, ' ').trim(), 'ニチ / ジツ / ひ / び', 'First row kanji-read should be ニチ / ジツ / ひ / び');
  assert.strictEqual(H.text(read1).replace(/\s+/g, ' ').trim(), 'ホン / もと', 'Second row kanji-read should be ホン / もと');

  const allReadElements = H.findAll(scr.view(), /fb-read/);
  for (const readEl of allReadElements) {
    const normalized = H.text(readEl).replace(/\s+/g, ' ').trim();
    assert.ok(!normalized.startsWith('/'), 'kanji-read should not start with /');
    assert.ok(!normalized.endsWith('/'), 'kanji-read should not end with /');
    assert.ok(!normalized.includes('//'), 'kanji-read should not contain //');
    assert.ok(!normalized.includes('/ /'), 'kanji-read should not contain / /');
  }
});

test('kanji-rows: single-kanji prompt shows no rows', async () => {
  const items = [
    word('w-日', '日'),
    kanji('日', '日', { on: ['ニチ'], kun: ['ひ'] })
  ];
  const { scr } = await start({ items });
  scr.answer({ text: 'wrong' });

  const fb = H.find(scr.view(), 'fb-rows');
  assert.strictEqual(fb, null, 'kanji-rows should be absent for single-kanji prompt');
});

test('kanji-rows: kanji card item itself shows no kanji-rows element', async () => {
  const items = [
    kanji('日', '日', { on: ['ニチ'], kun: ['ひ'] })
  ];
  const { scr } = await start({ items });
  scr.answer({ text: 'wrong' });

  const fb = H.find(scr.view(), 'fb-rows');
  assert.strictEqual(fb, null, 'kanji-rows should not be present for a kanji card item itself');
});

test('kanji-rows: kanji without an item is skipped', async () => {
  const items = [
    word('w-日本月', '日本月'),
    kanji('日', '日', { on: ['ニチ'], kun: ['ひ'] }),
    kanji('本', '本', { on: ['ホン'], kun: ['もと'] })
  ];
  const { scr } = await start({ items });
  scr.answer({ text: 'wrong' });

  const fb = H.find(scr.view(), 'fb-rows');
  assert.ok(fb, 'kanji-rows should be present');

  const fullText = H.text(fb);
  assert.ok(/日/.test(fullText), 'Should contain 日');
  assert.ok(/本/.test(fullText), 'Should contain 本');
  assert.ok(/月/.test(fullText) === false, 'Should not contain 月 (no item for it)');
});

test('kanji-rows: works for both correct and wrong answers', async () => {
  const items = [
    word('w-日本', '日本'),
    kanji('日', '日', { on: ['ニチ', 'ジツ'], kun: ['ひ', 'び'] }),
    kanji('本', '本', { on: ['ホン'], kun: ['もと'] })
  ];

  for (const ans of ['日本', 'wrong']) {
    const { scr } = await start({ items });
    scr.answer({ text: ans });

    const fb = H.find(scr.view(), 'fb-rows');
    assert.ok(fb, 'kanji-rows should be present for answer: ' + ans);

    const rows = H.findAll(scr.view(), /^fb-row$/);
    assert.strictEqual(rows.length, 2, 'Should have 2 kanji rows for answer: ' + ans);

    const row0 = rows[0];
    const row1 = rows[1];
    const read0 = H.find(row0, 'fb-read');
    const read1 = H.find(row1, 'fb-read');
    assert.strictEqual(H.text(read0).replace(/\s+/g, ' ').trim(), 'ニチ / ジツ / ひ / び', 'First row kanji-read should be ニチ / ジツ / ひ / び for answer: ' + ans);
    assert.strictEqual(H.text(read1).replace(/\s+/g, ' ').trim(), 'ホン / もと', 'Second row kanji-read should be ホン / もと for answer: ' + ans);
  }
});

test('kanji-rows: the ja module supplies the label Kanji in this word', async () => {
  const items = [
    word('w-日本', '日本'),
    kanji('日', '日', { on: ['ニチ'], kun: ['ひ'] }),
    kanji('本', '本', { on: ['ホン'], kun: ['もと'] })
  ];
  const { scr } = await start({ items });
  scr.answer({ text: 'wrong' });

  const label = H.find(scr.view(), 'fb-label');
  assert.ok(label, 'kanji-label should be present');
  const labelText = H.text(label);
  assert.strictEqual(labelText, 'Kanji in this word', 'ja module label (registerFeedbackRows opts.label)');
});

test('kanji-rows: at max-width 390px the row stays one compact line (3 columns kept)', async () => {
  const css = H.read('../modules/ja/web/ja.css');
  const base = css.match(/\.fb-row-grid\b[^{]*\{[^}]*\}/)[0];
  assert.ok(/grid-template-columns:\s*auto 1fr auto/.test(base));
  const m = css.match(/@media \(max-width: 390px\)\s*\{[^@]*?\n\}/g).filter((b) => b.includes('.fb-row-grid'));
  assert.equal(m.length, 1);
  assert.ok(!/grid-template-columns/.test(m[0]), 'no column collapse at 390px');
  assert.ok(/\.fb-read\b[^{]*\{[^}]*font-size:\s*var\(--fs-sm\)/.test(m[0]));
});

test('kanji-rows: no trailing separator when kanji has only on-reading', async () => {
  const items = [
    word('w-日本', '日本'),
    kanji('日', '日', { on: ['ニチ'], kun: ['ひ'] }),
    kanji('本', '本', { on: ['ホン'], kun: [] })
  ];
  const { scr } = await start({ items });
  scr.answer({ text: 'wrong' });

  const fb = H.find(scr.view(), 'fb-rows');
  assert.ok(fb, 'kanji-rows should be present');

  const rows = H.findAll(scr.view(), /^fb-row$/);
  const row0 = rows[0];
  const row1 = rows[1];

  const kun0 = H.find(row0, 'fb-kun');
  const kun1 = H.find(row1, 'fb-kun');
  assert.ok(kun0, 'First row should have kanji-kun element');
  assert.strictEqual(kun1, null, 'Second row should not have kanji-kun element (on-only)');

  const read1 = H.find(row1, 'fb-read');
  assert.strictEqual(H.text(read1).replace(/\s+/g, ' ').trim(), 'ホン', 'Second row kanji-read should be exactly ホン');

  const read0 = H.find(row0, 'fb-read');
  assert.strictEqual(H.text(read0).replace(/\s+/g, ' ').trim(), 'ニチ / ひ', 'First row kanji-read should be ニチ / ひ');
});

test('kanji-rows: uses course.breakdown config when present', async () => {
  const items = [
    word('w-日本', '日本'),
    kanji('日', '日', { ru: 'день', on: ['ニチ', 'ジツ'], kun: ['ひ', 'び'] }),
    kanji('本', '本', { ru: 'книга', on: ['ホン'], kun: ['もと'] })
  ];
  const courseWithBreakdown = {
    contentLanguage: 'en',
    breakdown: { key: 'meta.kanji', meaning: 'meta.ru', readings: ['meta.on', 'meta.kun'] },
    tagLabels: { t1: 'Tag One' }
  };
  const { scr } = await start({ items, course: courseWithBreakdown });
  scr.answer({ text: 'wrong' });

  const fb = H.find(scr.view(), 'fb-rows');
  assert.ok(fb, 'kanji-rows should be present');

  const rows = H.findAll(scr.view(), /^fb-row$/);
  assert.strictEqual(rows.length, 2, 'Should have 2 kanji rows');

  const mean0 = H.find(rows[0], 'fb-mean');
  const mean1 = H.find(rows[1], 'fb-mean');
  assert.strictEqual(H.text(mean0), 'день', 'First row meaning should be from meta.ru');
  assert.strictEqual(H.text(mean1), 'книга', 'Second row meaning should be from meta.ru');
});

test('kanji-rows: no breakdown config means no kanji rows', async () => {
  const courseNoBreakdown = {
    contentLanguage: 'en',
    tagLabels: { t1: 'Tag One' }
  };
  const items = [
    word('w-日本', '日本'),
    kanji('日', '日', { on: ['ニチ', 'ジツ'], kun: ['ひ', 'び'] }),
    kanji('本', '本', { on: ['ホン'], kun: ['もと'] })
  ];
  const { scr } = await start({ items, course: courseNoBreakdown });
  scr.answer({ text: 'wrong' });

  const fb = H.find(scr.view(), 'fb-rows');
  assert.strictEqual(fb, null, 'kanji-rows should be absent when no breakdown config');
});

test('kanji-rows: rows from DojoExt.registerFeedbackRows replace the built-in breakdown', async () => {
  const items = [
    word('w-日本', '日本'),
    kanji('日', '日', { on: ['ニチ'], kun: ['ひ'] }),
    kanji('本', '本', { on: ['ホン'], kun: ['もと'] })
  ];
  const { scr } = await start({
    items,
    setup(sb) { sb.DojoExt.registerFeedbackRows(() => [{ kanji: 'X', meaning: 'plug', on: [], kun: [] }]); }
  });
  scr.answer({ text: 'wrong' });
  const rows = H.findAll(scr.view(), /^fb-row$/);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(H.text(H.find(rows[0], 'fb-ch')), 'X');
  assert.strictEqual(H.text(H.find(rows[0], 'fb-mean')), 'plug');
});

test('kanji-rows: a throwing registerFeedbackRows hook falls back to the built-in breakdown', async () => {
  const items = [
    word('w-日本', '日本'),
    kanji('日', '日', { on: ['ニチ'], kun: ['ひ'] }),
    kanji('本', '本', { on: ['ホン'], kun: ['もと'] })
  ];
  const { scr } = await start({
    items,
    setup(sb) { sb.DojoExt.registerFeedbackRows(() => { throw new Error('plugin boom'); }); }
  });
  scr.answer({ text: 'wrong' });
  const rows = H.findAll(scr.view(), /^fb-row$/);
  assert.strictEqual(rows.length, 2);
  assert.strictEqual(H.text(H.find(rows[0], 'fb-ch')), '日');
});

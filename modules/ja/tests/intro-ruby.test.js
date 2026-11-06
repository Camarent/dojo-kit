'use strict';
const test = require('node:test');
const assert = require('node:assert');
const H = require('./harness.js').appHarness;

const gap = (id, entity) => ({ id, unit: 'u1', type: 'gap', prompt: 'Prompt ' + id, answers: ['a'], entity, explanation: 'inline expl' });

// Word intro: title and kanji text go through the ruby markup, so base|reading markup shows as ruby, not plain kana.
// Mutation: make renderIntroBody use plain text (no renderText) -> this test fails.
test('word intro card: title and text render base|reading markup as ruby', async () => {
  const m = await H.mount({
    items: [gap('w1', 'W1')],
    intros: [{ id: 'W1', title: '{食べる|たべる}', text: 'Kanji: {食|た}' }],
    course: { id: 'c', title: 'C', uiLanguage: 'en', markup: 'ruby', ruby: { skip: '食' }, introNew: true, units: [{ id: 'u1', title: 'U' }] }
  });
  m.sb.DojoExt.use('ruby');
  m.sb.DojoExt.useRuby({ skip: '食' }, [gap('w1', 'W1')]);
  m.app.startMode('daily', {});
  const tree = m.screen(m.sb.DojoApp._SessionScreen).view();
  const title = H.find(tree, 'intro-title');
  const text = H.find(tree, 'intro-text');
  assert.ok(title && text);
  const types = [];
  H.walk(title, (n) => { if (n.type) types.push(n.type); });
  assert.ok(types.includes('ruby'), 'title should have ruby: ' + H.text(title));
  assert.ok(!/[{|}]/.test(H.text(title)), 'title should not have raw markup: ' + H.text(title));
  assert.ok(!/[{|}]/.test(H.text(text)), 'text should not have raw markup: ' + H.text(text));
});

// Real app path: the course skips readings of 食 in quiz text, but the intro card is a teaching card and keeps every reading.
test('word intro card: skipped kanji keep ruby reading in the intro card', async () => {
  const m = await H.mount({
    items: [gap('w1', 'W1')],
    intros: [{ id: 'W1', title: '{食べる|たべる}', text: 'Kanji: {食|た}' }],
    course: { id: 'c', title: 'C', uiLanguage: 'en', markup: 'ruby', ruby: { skip: '食' }, introNew: true, units: [{ id: 'u1', title: 'U' }] }
  });
  m.sb.DojoExt.use('ruby');
  m.sb.DojoExt.useRuby({ skip: '食' }, [gap('w1', 'W1')]);
  m.app.startMode('daily', {});
  const tree = m.screen(m.sb.DojoApp._SessionScreen).view();
  const title = H.find(tree, 'intro-title');
  const types = [];
  H.walk(title, (n) => { if (n.type) types.push(n.type); });
  assert.ok(types.includes('ruby'), 'skipped kanji title should still have ruby: ' + H.text(title));
});

// Kanji list in the intro card: declarative detail fields keep every reading (all=true), not the skipped quiz form.
test('word intro card: declarative detail field keeps skipped kanji as ruby', async () => {
  const item = Object.assign(gap('w1', 'W1'), { meta: { kanji: '{食|た}' } });
  const m = await H.mount({
    items: [item],
    intros: [{ id: 'W1', title: 'Word', text: 'T' }],
    course: { id: 'c', title: 'C', uiLanguage: 'en', markup: 'ruby', ruby: { skip: '食' }, introNew: true, units: [{ id: 'u1', title: 'U', detail: { fields: [{ key: 'kanji', type: 'text', label: 'Kanji' }] } }] }
  });
  m.sb.DojoExt.use('ruby');
  m.sb.DojoExt.useRuby({ skip: '食' }, [item]);
  m.app.startMode('daily', {});
  const tree = m.screen(m.sb.DojoApp._SessionScreen).view();
  const decl = H.find(tree, 'declarative-detail');
  assert.ok(decl, 'declarative detail rendered in intro card');
  const types = [];
  H.walk(decl, (n) => { if (n.type) types.push(n.type); });
  assert.ok(types.includes('ruby'), 'skipped kanji in detail field should still have ruby: ' + H.text(decl));
});

// Neutral fixture (no real word): the intro card title and text render base|reading markup as ruby.
test('intro card renders title and text markup as ruby (neutral fixture)', async () => {
  const item = { id: 'n1', unit: 'u1', type: 'gap', prompt: 'Prompt n1', answers: ['a'], entity: 'N1', explanation: 'inline expl' };
  const m = await H.mount({
    items: [item],
    intros: [{ id: 'N1', title: '{水|みず}', text: 'Kanji: {水|み}' }],
    course: { id: 'c', title: 'C', uiLanguage: 'en', markup: 'ruby', ruby: { skip: '水' }, introNew: true, units: [{ id: 'u1', title: 'U' }] }
  });
  m.sb.DojoExt.use('ruby');
  m.sb.DojoExt.useRuby({ skip: '水' }, [item]);
  m.app.startMode('daily', {});
  const tree = m.screen(m.sb.DojoApp._SessionScreen).view();
  const title = H.find(tree, 'intro-title');
  const text = H.find(tree, 'intro-text');
  assert.ok(title && text);
  const types = [];
  H.walk(title, (n) => { if (n.type) types.push(n.type); });
  assert.ok(types.includes('ruby'), 'title should have ruby: ' + H.text(title));
  assert.ok(!/[{|}]/.test(H.text(title)), 'title should not have raw markup');
  assert.ok(!/[{|}]/.test(H.text(text)), 'text should not have raw markup');
});

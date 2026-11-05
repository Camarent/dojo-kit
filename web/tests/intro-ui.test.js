'use strict';
// Mutation coverage (each restored): drop markIntroSeen in introDone -> 'intro shows only once' fails;
// render the question under a card -> 'intro replaces the question' fails; drop the introDoneOn guard -> 'Got it is idempotent' fails.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const H = require('./app-harness.js');

const gap = (id, entity) => ({ id, unit: 'u1', type: 'gap', prompt: 'Prompt ' + id, answers: ['a'], entity, explanation: 'inline expl' });
const INTROS = [{ id: 'E1', title: 'Intro One', text: 'Body one' }];

async function start(o) {
  const m = await H.mount(Object.assign({ items: [gap('x1', 'E1'), gap('x2', 'E1'), gap('y1', 'E2')], intros: INTROS, course: { introNew: true } }, o));
  m.app.startMode('daily', {});
  const scr = m.screen(m.sb.DojoApp._SessionScreen);
  return { m, scr, v: () => scr.view() };
}

test('intro replaces the question: no answer controls, no timer, Got it only', async () => {
  const { scr, v } = await start();
  assert.ok(scr.state.introCard);
  const tree = v();
  assert.ok(H.find(tree, 'intro-card'));
  assert.ok(/Intro One/.test(H.text(H.find(tree, 'intro-title'))));
  assert.ok(/Body one/.test(H.text(H.find(tree, 'intro-text'))));
  assert.ok(H.find(tree, 'btn-intro-done'));
  ['prompt', 'btn-next', 'btn-dont-know', 'timer', 'feedback'].forEach((id) => assert.strictEqual(H.find(tree, id), null, id));
});

test('intro shows only once: Got it marks it seen, same entity and a new session skip it', async () => {
  const { m, scr, v } = await start();
  const first = scr.state.cur.item.id;
  scr.introDone();
  assert.strictEqual(typeof m.doc.intros.E1, 'number');
  assert.strictEqual(scr.state.introCard, null);
  const tree = v();
  assert.ok(H.find(tree, 'prompt'));
  assert.strictEqual(H.find(tree, 'intro-card'), null);
  // next item of the same entity does not re-show
  scr.answer('a');
  scr.next();
  if (scr.state.cur.item.id !== first && scr.state.cur.item.entity === 'E1') assert.strictEqual(scr.state.introCard, null);
  // a fresh session does not show it either
  const s2 = m.engine.start('daily', {});
  assert.strictEqual(s2.introFor(s2.current().item), null);
});

test('Got it is idempotent: double click writes the intro once', async () => {
  const { m, scr } = await start();
  let writes = 0;
  const upd = m.store.update;
  m.store.update = (fn) => { writes++; upd(fn); };
  scr.introDone();
  scr.introDone();
  assert.strictEqual(writes, 1);
});

test('plugin registerIntro hook renders the card body; default renders title + text', async () => {
  const { m, scr } = await start();
  m.sb.DojoExt.registerIntro((intro, item) => 'HOOK ' + intro.title + ' ' + item.id);
  const hook = H.find(scr.view(), 'intro-hook');
  assert.ok(/HOOK Intro One/.test(H.text(hook)));
});

test('item without an intro line keeps the inline explanation behaviour', async () => {
  const m = await H.mount({ items: [gap('y1', 'E2')], intros: INTROS, course: { introNew: true } });
  m.app.startMode('daily', {});
  const scr = m.screen(m.sb.DojoApp._SessionScreen);
  assert.strictEqual(scr.state.introCard, null);
  assert.strictEqual(scr.state.showIntro, true);
  assert.ok(H.find(scr.view(), 'prompt'));
});

test('intro i18n keys exist in en and ru', () => {
  ['en', 'ru'].forEach((l) => {
    const d = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'i18n', l + '.json'), 'utf8'));
    ['intro.gotit', 'intro.label', 'catalog.all', 'catalog.more', 'catalog.tags.more'].forEach((k) => assert.ok(d[k], l + ' ' + k));
  });
});

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

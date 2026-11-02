'use strict';
// Mutation coverage: replacing renderTextAll with renderText in the explanation rendering turns this test red.
const test = require('node:test');
const assert = require('node:assert');
const H = require('./app-harness.js');

const item = {
  id: 'g1',
  unit: 'u1',
  type: 'gap',
  prompt: '{甲|こう}',
  answers: ['{甲|こう}'],
  explanation: '{甲|こう} means something'
};

async function start(o) {
  const m = await H.mount(Object.assign({
    items: [item],
    course: { id: 'c', title: 'C', uiLanguage: 'en', markup: 'ruby', ruby: { skip: '甲' }, units: [{ id: 'u1', title: 'U' }] }
  }, o));
  m.sb.DojoExt.use('ruby');
  m.sb.DojoExt.useRuby({ skip: '甲' }, [item]);
  m.app.startMode('daily', {});
  const scr = m.screen(m.sb.DojoApp._SessionScreen);
  return { m, scr };
}

test('prompt view has no <rt> for 甲', async () => {
  const { scr } = await start();
  const promptEl = H.find(scr.view(), 'prompt');
  assert.ok(promptEl);
  const types = [];
  H.walk(promptEl, (n) => { if (n.type) types.push(n.type); });
  assert.ok(!types.includes('ruby'), 'prompt should not have ruby: ' + H.text(promptEl));
  const promptText = H.text(promptEl);
  assert.ok(promptText.includes('甲'), 'prompt should show base kanji: ' + promptText);
  assert.ok(!promptText.includes('こう'), 'prompt should not show reading: ' + promptText);
});

test('feedback expected answer has <rt> with こう', async () => {
  const { scr } = await start();
  scr.answer({ text: 'wrong' });
  const fb = H.find(scr.view(), 'feedback');
  assert.ok(fb);
  const types = [];
  H.walk(fb, (n) => { if (n.type) types.push(n.type); });
  assert.ok(types.includes('ruby'), 'feedback should have ruby');
  const fbText = H.text(fb);
  assert.ok(fbText.includes('こう'), 'feedback should contain こう');
  assert.ok(!/[{|}]/.test(fbText), 'feedback should not have raw markup');
});

test('feedback explanation has <rt> with こう', async () => {
  const { scr } = await start();
  scr.answer({ text: 'wrong' });
  const fb = H.find(scr.view(), 'feedback');
  assert.ok(fb);
  const expl = H.find(fb, 'explanation');
  assert.ok(expl);
  const types = [];
  H.walk(expl, (n) => { if (n.type) types.push(n.type); });
  assert.ok(types.includes('ruby'), 'explanation should have ruby');
  const explText = H.text(expl);
  assert.ok(explText.includes('こう'), 'explanation should contain こう');
  assert.ok(!/[{|}]/.test(explText), 'explanation should not have raw markup');
});

test('feedback rendered text has no undefined, {, [object', async () => {
  const { scr } = await start();
  scr.answer({ text: 'wrong' });
  const fb = H.find(scr.view(), 'feedback');
  assert.ok(fb);
  const fbText = JSON.stringify(H.text(fb));
  assert.ok(!fbText.includes('undefined'), 'feedback should not contain undefined');
  assert.ok(!fbText.includes('{'), 'feedback should not contain {');
  assert.ok(!fbText.includes('[object'), 'feedback should not contain [object');
});

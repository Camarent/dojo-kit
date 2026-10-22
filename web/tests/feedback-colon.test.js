'use strict';
const test = require('node:test');
const assert = require('node:assert');
const H = require('./app-harness.js');

const choice = (id, unit, extra) => Object.assign({ id, unit, type: 'choice', prompt: 'Prompt ' + id, options: ['a', 'b', 'c'], answer: 0 }, extra);

async function startWrong(o) {
  const items = [choice('x1', 'u1', { explanation: 'This is why' })];
  const m = await H.mount(Object.assign({ items, course: { id: 'c', title: 'C', units: [{ id: 'u1', title: 'U1' }] } }, o));
  m.app.startMode('daily', {});
  const scr = m.screen(m.sb.DojoApp._SessionScreen);
  // Give a wrong answer to trigger feedback with expected
  scr.answer({ index: 1 }); // wrong answer (correct is 0)
  return { m, scr };
}

test('feedback for wrong answer in ru contains "Правильно:" exactly once and never "::"', async () => {
  const { scr } = await startWrong({ lang: 'ru' });
  const fb = H.find(scr.view(), 'feedback');
  assert.ok(fb, 'feedback element found');
  const fbText = H.text(fb);
  
  // Count occurrences of "Правильно:" - should be exactly 1
  const correctCount = (fbText.match(/Правильно:/g) || []).length;
  assert.strictEqual(correctCount, 1, '"Правильно:" appears exactly once, but appeared ' + correctCount + ' times in: ' + fbText);
  
  // Should never contain double colon
  assert.ok(!/::/.test(fbText), 'feedback should not contain "::", but got: ' + fbText);
});

test('feedback for wrong answer in en contains "Correct:" exactly once and never "::"', async () => {
  const { scr } = await startWrong({ lang: 'en' });
  const fb = H.find(scr.view(), 'feedback');
  assert.ok(fb, 'feedback element found');
  const fbText = H.text(fb);
  
  // Count occurrences of "Correct:" - should be exactly 1
  const correctCount = (fbText.match(/Correct:/g) || []).length;
  assert.strictEqual(correctCount, 1, '"Correct:" appears exactly once, but appeared ' + correctCount + ' times in: ' + fbText);
  
  // Should never contain double colon
  assert.ok(!/::/.test(fbText), 'feedback should not contain "::", but got: ' + fbText);
});

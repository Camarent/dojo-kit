'use strict';
// Mutation coverage: iterating course.units in PracticeSetup fails 'practice lists no unit that has only retired items'.
const test = require('node:test');
const assert = require('node:assert');
const H = require('./app-harness.js');

const gap = (id, unit, status) => {
  const it = { id, unit, type: 'gap', prompt: 'Q ' + id, answers: ['a'], explanation: 'e' };
  if (status) it.status = status;
  return it;
};

test('practice lists no unit that has only retired items', async () => {
  const items = [gap('g1', 'grammar'), gap('r1', 'kana', 'retired')];
  const course = { units: [{ id: 'grammar', title: 'Grammar' }, { id: 'kana', title: 'Kana' }] };
  const m = await H.mount({ items, course, lang: 'en', settings: {} });
  m.app.go('practice');
  const view = m.screen(m.sb.DojoApp._PracticeSetup).view();
  const chips = H.findAll(view, /^group-units$/);
  const text = JSON.stringify(chips);
  assert.ok(text.includes('Grammar'));
  assert.ok(!text.includes('Kana'));
});

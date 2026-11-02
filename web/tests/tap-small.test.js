'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const web = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(web, p), 'utf8');

const DAY = 86400000;
function gap(id, unit, entity) {
  const it = { id, unit, type: 'gap', prompt: 'Q ' + id, answers: ['a'], explanation: 'e' };
  if (entity) it.entity = entity;
  return it;
}
const ITEMS = [
  gap('k1', 'kanji', 'E1'), gap('v1', 'vocab', 'E1'), gap('k2', 'kanji', 'E2'), gap('v2', 'vocab', 'E2'),
  gap('k3', 'kanji', 'E3'), gap('k4', 'kanji', 'E4'),
  gap('g1', 'grammar'), gap('g2', 'grammar'), gap('g3', 'grammar'),
  gap('o1', 'other'), gap('o2', 'other'), gap('o3', 'other'),
  gap('x1', 'exam-a'), gap('x2', 'exam-a')
];
const COURSE = {
  learnedStage: 1,
  units: [{ id: 'kanji', title: 'Kanji' }, { id: 'vocab', title: 'Vocab' }, { id: 'grammar', title: 'Grammar' },
    { id: 'other', title: 'Other unit' }, { id: 'exam-a', title: 'Exam A', newPerDay: 0 }],
  groups: [{ id: 'kv', title: 'KV', units: ['kanji', 'vocab'], newPerDay: 2, extraNew: true }, { id: 'gr', title: 'GR', units: ['grammar'], newPerDay: 1 }],
  bars: [{ title: 'Kanji bar', units: ['kanji'], learnedStage: 1 }]
};
const NOW = Date.now();
const due = { s: 0, due: NOW - DAY };
const later = { s: 1, due: NOW + 9 * DAY };
const young = { s: 0, due: NOW + 9 * DAY };

async function home(lang, extraDoc) {
  const { mount } = require('./app-harness.js');
  const m = await mount({ items: ITEMS, course: COURSE, lang, settings: extraDoc || {} });
  Object.assign(m.doc.items, { k1: later, v1: later, k2: due, v2: due, g1: young, o1: due, o2: later, x1: due });
  m.app.refresh();
  return m;
}

test('CSS: .btn.small has min-height and min-width equal to var(--tap)', () => {
  const css = read('styles/app.css');
  const ruleMatch = css.match(/\.btn\.small\s*\{[^}]*\}/);
  assert.ok(ruleMatch, 'app.css should contain .btn.small rule');
  const rule = ruleMatch[0];
  assert.ok(rule.includes('min-height: var(--tap)'), '.btn.small should have min-height: var(--tap)');
  assert.ok(rule.includes('min-width: var(--tap)'), '.btn.small should have min-width: var(--tap)');
});

test('Buttons btn-extra-5-* and btn-more-5 render without undefined, {, [object', async () => {
  const { find, findAll, text } = require('./app-harness.js');
  const m = await home('en');
  const tree = m.tree();
  
  const extra5Buttons = findAll(tree, /^btn-extra-5-/);
  assert.ok(extra5Buttons.length > 0, 'Should have btn-extra-5-* buttons');
  
  for (const btn of extra5Buttons) {
    const btnText = text(btn);
    assert.ok(!/undefined|\{|\[object/.test(btnText), 
      `Button ${btn.props['data-testid']} text "${btnText}" contains forbidden strings`);
  }
  
  const btnMore5 = find(tree, 'btn-more-5');
  if (btnMore5) {
    const btnText = text(btnMore5);
    assert.ok(!/undefined|\{|\[object/.test(btnText),
      `btn-more-5 text "${btnText}" contains forbidden strings`);
  }
});

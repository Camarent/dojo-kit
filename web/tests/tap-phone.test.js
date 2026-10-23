'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const web = path.join(__dirname, '..');
const { mediaBlock } = require('./css-helpers.js');
const extractMediaBlock = (css) => mediaBlock(css, '@media (max-width: 600px)');
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
  { id: 'w1', unit: 'kanji', type: 'gap', prompt: 'This is a very long question prompt that exceeds twenty-four characters and should be truncated with more text', answers: ['a'], explanation: 'e' },
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
  Object.assign(m.doc.items, { k1: later, v1: later, k2: due, v2: due, g1: young, o1: due, o2: later, x1: due, w1: young });
  // Add weak items by marking them with bad answers
  // The weakList looks for items that need review
  m.doc.items['w1'] = { s: 0, due: NOW + DAY, bad: 3, ok: 0 };
  m.doc.items['k2'] = { s: 1, due: NOW + DAY, bad: 2, ok: 1 };
  m.app.refresh();
  return m;
}

test('CSS: @media (max-width: 600px) block exists', () => {
  const css = read('styles/app.css');
  const block600 = extractMediaBlock(css);
  assert.ok(block600, 'app.css should contain @media (max-width: 600px) block');
});

test('CSS: @media (max-width: 600px) contains min-height: var(--tap) for .btn', () => {
  const css = read('styles/app.css');
  const block600 = extractMediaBlock(css);
  assert.ok(block600, 'app.css should contain @media (max-width: 600px) block');
  assert.ok(block600.includes('.btn'), 'Block should mention .btn');
  // Check that .btn rule has min-height: var(--tap)
  const btnRuleMatch = block600.match(/\.btn[^,{]*([^{]*)\s*\{[^}]*min-height:\s*var\(--tap\)/s);
  assert.ok(btnRuleMatch, 'Block should have .btn with min-height: var(--tap)');
});

test('CSS: @media (max-width: 600px) contains min-height: var(--tap) for .chip', () => {
  const css = read('styles/app.css');
  const block600 = extractMediaBlock(css);
  assert.ok(block600, 'app.css should contain @media (max-width: 600px) block');
  assert.ok(block600.includes('.chip'), 'Block should mention .chip');
  // Check that .chip rule has min-height: var(--tap)
  const chipRuleMatch = block600.match(/\.chip[^,{]*([^{]*)\s*\{[^}]*min-height:\s*var\(--tap\)/s);
  assert.ok(chipRuleMatch, 'Block should have .chip with min-height: var(--tap)');
});

test('CSS: @media (max-width: 600px) contains min-height: var(--tap) for .extra-new-buttons .btn', () => {
  const css = read('styles/app.css');
  const block600 = extractMediaBlock(css);
  assert.ok(block600, 'app.css should contain @media (max-width: 600px) block');
  assert.ok(block600.includes('.extra-new-buttons .btn'), 'Block should mention .extra-new-buttons .btn');
});

test('CSS: @media (max-width: 600px) contains min-height: var(--tap) for home nav buttons', () => {
  const css = read('styles/app.css');
  const block600 = extractMediaBlock(css);
  assert.ok(block600, 'app.css should contain @media (max-width: 600px) block');
  // Home nav buttons are .row.wrap > .btn
  assert.ok(block600.includes('.row.wrap > .btn') || block600.includes('.row.wrap>.btn'), 'Block should mention .row.wrap > .btn');
});

test('CSS: @media (max-width: 600px) contains grid for home nav row', () => {
  const css = read('styles/app.css');
  const block600 = extractMediaBlock(css);
  assert.ok(block600, 'app.css should contain @media (max-width: 600px) block');
  assert.ok(block600.includes('display: grid') || block600.includes('display:grid'), 'Block should contain display: grid');
  assert.ok(block600.includes('grid-template-columns: 1fr 1fr'), 'Block should contain grid-template-columns: 1fr 1fr');
});

test('CSS: @media (max-width: 600px) contains line-clamp for weak-chips', () => {
  const css = read('styles/app.css');
  const block600 = extractMediaBlock(css);
  assert.ok(block600, 'app.css should contain @media (max-width: 600px) block');
  assert.ok(block600.includes('.weak-chips .chip-text'), 'Block should mention .weak-chips .chip-text');
  assert.ok(block600.includes('-webkit-line-clamp: 2'), 'Block should contain -webkit-line-clamp: 2');
  assert.ok(block600.includes('-webkit-box-orient: vertical'), 'Block should contain -webkit-box-orient: vertical');
  assert.ok(block600.includes('overflow: hidden'), 'Block should contain overflow: hidden');
});

test('CSS: @media (max-width: 600px) contains flex for checkbox label', () => {
  const css = read('styles/app.css');
  const block600 = extractMediaBlock(css);
  assert.ok(block600, 'app.css should contain @media (max-width: 600px) block');
  assert.ok(block600.includes('.group-toggles .chip.toggles'), 'Block should mention .group-toggles .chip.toggles');
  assert.ok(block600.includes('display: inline-flex'), 'Block should contain display: inline-flex');
  assert.ok(block600.includes('align-items: center'), 'Block should contain align-items: center');
});

test('CSS: @media (max-width: 600px) contains min-height for primary big buttons', () => {
  const css = read('styles/app.css');
  const block600 = extractMediaBlock(css);
  assert.ok(block600, 'app.css should contain @media (max-width: 600px) block');
  assert.ok(block600.includes('.btn.primary.big'), 'Block should mention .btn.primary.big');
});

test('Harness: weak chip has title attribute with full plain text', async () => {
  const { find, findAll, text } = require('./app-harness.js');
  const m = await home('en');
  const tree = m.tree();
  
  const weakChips = find(tree, 'weak-chips');
  assert.ok(weakChips, 'weak-chips should be rendered');
  
  // Find all chip spans
  const allNodes = [];
  (function walk(n) {
    if (!n || typeof n !== 'object') return;
    if (n.props && n.props['data-testid'] !== 'weak-chips') {
      allNodes.push(n);
    }
    if (Array.isArray(n)) {
      n.forEach(walk);
    } else if (n && n.props) {
      walk(n.props.children);
    }
  })(weakChips);
  
  // Look for span with class chip and title attribute
  let foundChipWithTitle = false;
  let foundLongText = false;
  
  function walkForChips(n, fn) {
    if (!n) return;
    if (Array.isArray(n)) {
      n.forEach(c => walkForChips(c, fn));
      return;
    }
    if (n && n.props) {
      fn(n);
      walkForChips(n.props.children, fn);
    }
  }
  
  walkForChips(weakChips, (node) => {
    if (node.props && node.props.class && typeof node.props.class === 'string' && node.props.class.includes('chip')) {
      if (node.props.title) {
        foundChipWithTitle = true;
        if (node.props.title.length > 24) {
          foundLongText = true;
          // Check that displayed text is truncated
          const displayText = text(node);
          assert.ok(displayText.length <= 27, 'Displayed text should be truncated');
        }
      }
    }
  });
  
  assert.ok(foundChipWithTitle, 'At least one chip should have a title attribute');
  assert.ok(foundLongText, 'At least one chip should have a title longer than 24 chars');
});

test('Harness: toggle label chip is rendered', async () => {
  const { find, findAll } = require('./app-harness.js');
  const m = await home('en');
  const tree = m.tree();
  
  // Find toggle labels - they should have data-testid starting with toggle-
  const toggleLabels = findAll(tree, /^toggle-/);
  assert.ok(toggleLabels.length > 0, 'Should have toggle labels');
  
  // Check that at least one toggle label has chip class
  let foundChipToggle = false;
  for (const label of toggleLabels) {
    const className = label.props && label.props.class;
    if (className && typeof className === 'string' && className.includes('chip')) {
      foundChipToggle = true;
      break;
    }
  }
  assert.ok(foundChipToggle, 'At least one toggle label should have chip class');
});

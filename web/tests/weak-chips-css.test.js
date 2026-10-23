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

async function home(lang, extraDoc) {
  const { mount } = require('./app-harness.js');
  const m = await mount({ items: ITEMS, course: COURSE, lang, settings: extraDoc || {} });
  Object.assign(m.doc.items, { k1: { s: 1, due: NOW + 9 * DAY }, v1: { s: 1, due: NOW + 9 * DAY }, k2: { s: 0, due: NOW - DAY }, v2: { s: 0, due: NOW - DAY }, g1: { s: 0, due: NOW + 9 * DAY }, o1: { s: 0, due: NOW - DAY }, o2: { s: 1, due: NOW + 9 * DAY }, x1: { s: 0, due: NOW - DAY }, w1: { s: 0, due: NOW + DAY, bad: 3, ok: 0 } });
  m.doc.items['k2'] = { s: 1, due: NOW + DAY, bad: 2, ok: 1 };
  m.app.refresh();
  return m;
}

// Helper to extract the exact @media (max-width: 600px) block
function extractMediaBlock(css) {
  const startIdx = css.indexOf('@media (max-width: 600px)');
  if (startIdx === -1) return null;
  
  const openBraceIdx = css.indexOf('{', startIdx);
  if (openBraceIdx === -1) return null;
  
  let depth = 1;
  let blockEnd = -1;
  
  for (let i = openBraceIdx + 1; i < css.length; i++) {
    if (css[i] === '{') {
      depth++;
    } else if (css[i] === '}') {
      depth--;
      if (depth === 0) {
        blockEnd = i + 1;
        break;
      }
    }
  }
  
  if (blockEnd === -1) return null;
  return css.substring(startIdx, blockEnd);
}

// Helper to find CSS rule and check properties
function findRule(css, selector) {
  // Match the rule: selector followed by optional combinators, then {
  const ruleRegex = new RegExp(`(?:^|\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^\n{]*\s*\{([^}]*)\}`, 's');
  const match = css.match(ruleRegex);
  if (!match) return null;
  return { properties: match[1].trim(), fullMatch: match[0] };
}

test('CSS rule .weak-chips .chip has align-items: center and display: inline-flex', () => {
  const css = read('styles/app.css');
  const rule = findRule(css, '.weak-chips .chip');
  assert.ok(rule, `CSS should contain .weak-chips .chip rule. Full CSS contains it: ${css.includes('.weak-chips .chip')}`);
  assert.ok(rule.properties.includes('display: inline-flex') || rule.properties.includes('display:inline-flex'), 
    'Rule should have display: inline-flex');
  assert.ok(rule.properties.includes('align-items: center') || rule.properties.includes('align-items:center'),
    'Rule should have align-items: center');
});

test('CSS: @media (max-width: 600px) puts the clamp on .weak-chips .chip-text, not on .chip', () => {
  const css = read('styles/app.css');
  const block600 = extractMediaBlock(css);
  assert.ok(block600, 'app.css should contain @media (max-width: 600px) block');
  
  // Check that .weak-chips .chip-text has the clamp
  assert.ok(block600.includes('.weak-chips .chip-text'), 'Block should mention .weak-chips .chip-text');
  assert.ok(block600.includes('-webkit-line-clamp: 2'), 'Block should contain -webkit-line-clamp: 2');
  assert.ok(block600.includes('-webkit-box-orient: vertical'), 'Block should contain -webkit-box-orient: vertical');
  assert.ok(block600.includes('overflow: hidden'), 'Block should contain overflow: hidden');
  
  // Check that .weak-chips .chip-text has the display: -webkit-box (for line-clamp)
  // Extract the .weak-chips .chip-text rule from the media block
  const chipTextRule = block600.match(/\.weak-chips\s+\.chip-text\s*\{[^}]*\}/s);
  assert.ok(chipTextRule, 'Block should have .weak-chips .chip-text rule');
  assert.ok(chipTextRule[0].includes('display: -webkit-box') || chipTextRule[0].includes('display:-webkit-box'),
    'The .weak-chips .chip-text rule should have display: -webkit-box for line-clamp');
  
  // Check that there's NO .weak-chips .chip rule with line-clamp in the media block
  // Look for any rule that starts with .weak-chips .chip (not .weak-chips .chip-text) that has line-clamp
  const chipRules = [...block600.matchAll(/([^{}]*)\{([^}]*)\}/g)]
    .filter(m => m[1].split(',').some(sel => /\.weak-chips\s+\.chip\s*$/.test(sel.trim())));
  for (const m of chipRules) {
    assert.ok(!m[2].includes('-webkit-line-clamp'), 'A .weak-chips .chip rule must not carry -webkit-line-clamp');
  }
});

test('Home render: each weak chip contains a .chip-text child with the (truncated) text', async () => {
  const { find, findAll } = require('./app-harness.js');
  const m = await home('en');
  const tree = m.tree();
  
  const weakChips = find(tree, 'weak-chips');
  assert.ok(weakChips, 'weak-chips should be rendered');
  
  let foundChipText = false;
  
  function walk(n, fn) {
    if (!n) return;
    if (Array.isArray(n)) {
      n.forEach(c => walk(c, fn));
      return;
    }
    if (n && n.props) {
      fn(n);
      walk(n.props.children, fn);
    }
  }
  
  walk(weakChips, (node) => {
    if (node.props && node.props.class && typeof node.props.class === 'string' && node.props.class.includes('chip-text')) {
      foundChipText = true;
    }
  });
  
  assert.ok(foundChipText, 'At least one chip should have a .chip-text child');
  
  // Also verify the parent structure
  let foundChipWithChipText = false;
  walk(weakChips, (node) => {
    if (node.props && node.props.class && typeof node.props.class === 'string' && node.props.class.includes('chip')) {
      // Check if this chip has a chip-text child
      const children = Array.isArray(node.props.children) ? node.props.children : [node.props.children];
      for (const child of children) {
        if (child && child.props && child.props.class && child.props.class.includes('chip-text')) {
          foundChipWithChipText = true;
          break;
        }
      }
    }
  });
  
  assert.ok(foundChipWithChipText, 'At least one .chip should contain a .chip-text child');
});

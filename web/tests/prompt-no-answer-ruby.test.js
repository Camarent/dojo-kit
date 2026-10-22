'use strict';
// Setup copied from web/tests/ruby-unlearned.test.js
const test = require('node:test');
const assert = require('node:assert');
const Ext = require('../ext.js');
const H = require('./app-harness.js');
const { readSource } = require('./load-bundle.js');

const items = [
  { id: 'vocab-741', type: 'gap', unit: 'u1', tags: ['vocab', 'n5'], prompt: '元気', answers: ['げんき'], explanation: '{元気|げんき}' },
  { id: 'vocab-1457', type: 'gap', unit: 'u1', tags: ['vocab', 'n5'], prompt: '練習する', answers: ['れんしゅう'], explanation: 'Слово «{練習|れんしゅう}する» означает «упражняться».' },
  { id: 'choice-1', type: 'choice', unit: 'u1', tags: ['vocab', 'n5'], prompt: '元気', options: ['げんき', 'けんき', 'がんばる'], answer: 0, explanation: '{元気|げんき}' }
];

const A = { annotate: true };

test.beforeEach(() => { Ext.reset(); Ext.use('ruby'); Ext.useRuby({}, items); });

test('(a) DojoExt.text with hide option suppresses ruby for matching reading', () => {
  // Without hide, should render with ruby
  assert.strictEqual(Ext.text('元気', A), '<ruby>元気<rt>げんき</rt></ruby>');
  // With hide, should render without ruby
  assert.strictEqual(Ext.text('元気', { annotate: true, hide: ['げんき'] }), '元気');
});

test('(a) DojoExt.text without hide renders ruby normally', () => {
  // Ensure the baseline behavior still works
  assert.strictEqual(Ext.text('元気', { annotate: true }), '<ruby>元気<rt>げんき</rt></ruby>');
});

async function startGapSession(appSource) {
  const m = await H.mount({
    appSource,
    items: [items[0]],
    course: { id: 'c', title: 'C', uiLanguage: 'en', contentLanguage: 'ja', markup: 'ruby', units: [{ id: 'u1', title: 'U' }] }
  });
  m.sb.DojoExt.use('ruby');
  m.sb.DojoExt.useRuby({}, [items[0]]);
  m.app.startMode('practice', { unit: 'u1' });
  const scr = m.screen(m.sb.DojoApp._SessionScreen);
  return { m, scr };
}

async function startChoiceSession() {
  const m = await H.mount({
    items: [items[2]],
    course: { id: 'c', title: 'C', uiLanguage: 'en', contentLanguage: 'ja', markup: 'ruby', units: [{ id: 'u1', title: 'U' }] }
  });
  m.sb.DojoExt.use('ruby');
  m.sb.DojoExt.useRuby({}, [items[2]]);
  m.app.startMode('practice', { unit: 'u1' });
  const scr = m.screen(m.sb.DojoApp._SessionScreen);
  return { m, scr };
}

test('(b) mounted session with gap item - no ruby for answer reading', async () => {
  const { scr } = await startGapSession();
  const promptEl = H.find(scr.view(), 'prompt');
  assert.ok(promptEl, 'prompt element should exist');
  
  // Check that there's no ruby/rt in the prompt
  const types = [];
  H.walk(promptEl, (n) => { if (n.type) types.push(n.type); });
  assert.ok(!types.includes('ruby'), 'prompt should not have ruby for gap item: types=' + types.join(',') + ', text=' + H.text(promptEl));
  const promptText = H.text(promptEl);
  assert.ok(promptText.includes('元気'), 'prompt should show base kanji');
});

test('(b) regression: choice item with same prompt still has ruby', async () => {
  const { scr } = await startChoiceSession();
  const promptEl = H.find(scr.view(), 'prompt');
  assert.ok(promptEl, 'prompt element should exist');
  
  // For choice items, answerReadings returns [], so ruby should still be shown
  const types = [];
  H.walk(promptEl, (n) => { if (n.type) types.push(n.type); });
  assert.ok(types.includes('ruby'), 'choice item prompt should have ruby: types=' + types.join(',') + ', text=' + H.text(promptEl));
});

// Loads a mutated version of ui/app.js source via override; no temp files.
async function withMutatedApp(mutationFn, testFn) {
  const original = readSource('ui/app.js');
  const mutated = mutationFn(original);
  assert.notStrictEqual(mutated, original, 'mutation must change app.js');
  await testFn(mutated);
}

test('(c) mutation check - verify hide option is used', async () => {
  // Mutation: make renderPrompt ignore the item parameter
  const mutation = (content) => {
    return content
      .replace('function renderPrompt(str, item) {', 'function renderPrompt(str, item) {')
      .replace('DojoExt.text(str, { annotate: true, hide: answerReadings(item) })', 'DojoExt.text(str, { annotate: true })');
  };
  
  // First, verify that with mutation, the gap item SHOULD show ruby (the bug)
  await withMutatedApp(mutation, async (src) => {
    const { scr } = await startGapSession(src);
    const promptEl = H.find(scr.view(), 'prompt');
    assert.ok(promptEl, 'prompt element should exist');
    
    const types = [];
    H.walk(promptEl, (n) => { if (n.type) types.push(n.type); });
    assert.ok(types.includes('ruby'), 'With mutation, gap item prompt should have ruby (bug is present): types=' + types.join(','));
  });
  
  // After reverting, verify it works correctly again
  const { scr } = await startGapSession();
  const promptEl = H.find(scr.view(), 'prompt');
  assert.ok(promptEl, 'prompt element should exist');
  
  const types = [];
  H.walk(promptEl, (n) => { if (n.type) types.push(n.type); });
  assert.ok(!types.includes('ruby'), 'After reverting mutation, gap item prompt should NOT have ruby: types=' + types.join(','));
});

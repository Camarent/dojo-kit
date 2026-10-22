'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const DojoWasm = require('../dojo-wasm.js');
const DojoSession = require('../session.js');
const { checkWasmFresh } = require('./loader.js');

const ROOT = path.join(__dirname, '..', '..');
const DAY = 86400000;
const NOW = 1760000000000;
const TODAY = '2025-10-09';

function loadContent() {
  const dir = path.join(ROOT, 'examples', 'demo');
  const course = JSON.parse(fs.readFileSync(path.join(dir, 'course.json'), 'utf8'));
  const items = [];
  course.units.forEach((u) => {
    const text = fs.readFileSync(path.join(dir, 'content', u.id + '.jsonl'), 'utf8');
    text.split('\n').filter(Boolean).forEach((line) => items.push(JSON.parse(line)));
  });
  return { v: 1, course, items, version: 'test', lock: items.map((i) => i.id) };
}

let dojoPromise;
function getDojo() {
  if (!dojoPromise) {
    checkWasmFresh();
    dojoPromise = DojoWasm.load(fs.readFileSync(checkWasmFresh()));
  }
  return dojoPromise;
}

async function setup(opts) {
  const o = opts || {};
  const doc = o.doc || { v: 1, t: 0, items: {}, stats: { days: {}, newByDay: {} }, settings: {}, exams: {} };
  const clock = { t: o.now || NOW };
  let noted = 0;
  const store = {
    doc,
    update(fn) { fn(doc); doc.t = clock.t; },
    noteAnswer() { noted++; }
  };
  const content = o.content || loadContent();
  const dojo = o.dojo || await getDojo();
  let seq = 0;
  const engine = DojoSession.createEngine({
    dojo, store, content,
    now: () => clock.t,
    today: () => TODAY,
    random: o.random || (() => ((seq++ * 0.37) % 1)),
  });
  return { engine, doc, store, clock, content, notes: () => noted };
}

function ids(session) {
  const out = [];
  for (let c = session.current(); c; c = session.next()) out.push(c.item.id);
  return out;
}

function withPlacement(mode) {
  const content = loadContent();
  content.course.placement = { mode: mode || 'check' };
  return content;
}

test('placement check mode works when explicitly specified', async () => {
  const content = loadContent();
  content.course.placement = { mode: 'check' };
  const t = await setup({ content });
  const s = t.engine.start('placement', { seed: '42' });
  assert.ok(!s.error);
  assert.strictEqual(s.placementMode, 'check');
});

test('placement check mode excludes card items', async () => {
  const content = loadContent();
  content.course.placement = { mode: 'check' };
  const t = await setup({ content });
  const list = ids(t.engine.start('placement', { seed: '42' }));
  // demo course has only choice and gap items, but let's verify no cards are included
  // by checking all items have non-card types
  const items = t.content.items;
  list.forEach((id) => {
    const item = items.find(i => i.id === id);
    assert.notStrictEqual(item.type, 'card', `Card item ${id} should not be in check mode placement`);
  });
});

test('placement check mode excludes units with placement:false', async () => {
  const content = loadContent();
  content.course.placement = { mode: 'check' };
  // Set one unit to placement:false
  const mathUnit = content.course.units.find(u => u.id === 'math');
  if (mathUnit) mathUnit.placement = false;
  const t = await setup({ content });
  const list = ids(t.engine.start('placement', { seed: '42' }));
  // All items should be from geo unit
  const items = t.content.items;
  list.forEach((id) => {
    const item = items.find(i => i.id === id);
    assert.strictEqual(item.unit, 'geo', `Item ${id} should be from geo unit only`);
  });
});

test('placement check mode interleaves units', async () => {
  const content = loadContent();
  content.course.placement = { mode: 'check', perUnit: 3 };
  const t = await setup({ content });
  const list = ids(t.engine.start('placement', { seed: '42' }));
  
  // Get units for each item
  const units = list.map(id => {
    const item = t.content.items.find(i => i.id === id);
    return item.unit;
  });
  
  // Check that units are interleaved (not grouped)
  // This is a probabilistic check - with perUnit=3, we should see both units in first 6 items
  const uniqueUnits = new Set(units.slice(0, 6));
  assert.strictEqual(uniqueUnits.size, 2, 'Should have items from both units in first batch');
});

test('placement check mode accepts normal answers', async () => {
  const content = loadContent();
  content.course.placement = { mode: 'check' };
  const t = await setup({ content });
  const s = t.engine.start('placement', { seed: '42' });
  const cur = s.current();
  assert.ok(cur);
  assert.ok(cur.item);
  
  // Answer the first item (should accept normal input, not just rating)
  if (cur.item.type === 'choice') {
    const result = s.answer({ index: cur.item.answer });
    assert.ok(!result.error);
    assert.strictEqual(result.correct, true, 'Correct answer should be marked as correct');
    assert.ok(result.expected, 'Should show expected answer');
  }
});

test('placement check mode verdict maps to known', async () => {
  const content = loadContent();
  content.course.placement = { mode: 'check' };
  const t = await setup({ content });
  const s = t.engine.start('placement', { seed: '42' });
  
  // Answer with correct answer
  const cur = s.current();
  if (cur.item.type === 'choice') {
    const result = s.answer({ index: cur.item.answer });
    // In check mode, we should get feedback
    assert.ok(!result.error);
    assert.strictEqual(result.correct, true);
    assert.ok(result.expected, 'Should show expected answer');
    
    // The record should be written
    const itemId = cur.item.id;
    const rec = t.doc.items[itemId];
    assert.ok(rec, 'Record should exist for correct answer');
    // applyPlacement with known=true should give a stage >= 2
    assert.ok(rec.s >= 2, 'Correct answer should have stage >= 2, got s=' + rec.s);
    
    s.next();
  }
});

test('placement self mode still works (original behavior)', async () => {
  const content = loadContent();
  content.course.placement = { mode: 'self' };
  const t = await setup({ content });
  const s = t.engine.start('placement', { seed: '42' });
  
  // Should accept rating input
  const result = s.answer({ rating: 'known' });
  assert.ok(!result.error);
  assert.deepStrictEqual(result, { recorded: true });
});

test('placement check mode shows feedback', async () => {
  const content = loadContent();
  content.course.placement = { mode: 'check' };
  const t = await setup({ content });
  const s = t.engine.start('placement', { seed: '42' });
  
  const cur = s.current();
  if (cur.item.type === 'choice') {
    // Wrong answer
    const result = s.answer({ index: (cur.item.answer + 1) % cur.item.options.length });
    assert.ok(!result.error);
    assert.strictEqual(result.correct, false, 'Wrong answer should be marked as incorrect');
    assert.ok(result.expected, 'Should show expected answer for wrong answers');
    assert.ok(result.explanation, 'Should show explanation for wrong answers');
  }
});

test('placement check mode with dontKnow button enabled', async () => {
  const content = loadContent();
  content.course.placement = { mode: 'check' };
  content.course.dontKnow = true;
  const t = await setup({ content });
  const s = t.engine.start('placement', { seed: '42' });
  
  assert.strictEqual(s.canDontKnow(), true, 'dontKnow should be allowed in check mode when course.dontKnow is true');
});

test('placement self mode with dontKnow button disabled', async () => {
  const content = loadContent();
  content.course.placement = { mode: 'self' };
  content.course.dontKnow = true;
  const t = await setup({ content });
  const s = t.engine.start('placement', { seed: '42' });
  
  assert.strictEqual(s.canDontKnow(), false, 'dontKnow should NOT be allowed in self mode');
});

test('placement check mode excludes examOnly unit items', async () => {
  const content = loadContent();
  content.course.placement = { mode: 'check' };
  const t = await setup({ content });
  const list = ids(t.engine.start('placement', { seed: '42' }));
  // examOnly units in demo course are geo-exam and math-exam
  // Their items (geox-1, mathx-1) should NOT be in placement
  assert.ok(!list.includes('geox-1'), 'examOnly item geox-1 should not be in placement');
  assert.ok(!list.includes('mathx-1'), 'examOnly item mathx-1 should not be in placement');
});

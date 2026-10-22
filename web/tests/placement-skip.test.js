'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const DojoWasm = require('../dojo-wasm.js');
const DojoSession = require('../session.js');
const { checkWasmFresh } = require('./loader.js');

const ROOT = path.join(__dirname, '..', '..');
const NOW = 1760000000000;
const TODAY = '2025-10-09';

function makeItem(id, type, unit) {
  if (type === 'choice') {
    return { id, type, unit, prompt: 'Q' + id, answer: 0, options: ['A', 'B', 'C'] };
  }
  if (type === 'gap') {
    return { id, type, unit, prompt: 'Q' + id, answers: ['ans' + id] };
  }
  throw new Error('Unknown type: ' + type);
}

function makeContent(items, courseOverrides) {
  const course = { id: 'test', title: 'Test', units: [{ id: 'u1', title: 'Unit 1' }, { id: 'u2', title: 'Unit 2' }], placement: { mode: 'self' }, ...courseOverrides };
  return { v: 1, version: 'test', lock: items.map((i) => i.id), items, course };
}

let dojoPromise;
function getDojo() {
  if (!dojoPromise) {
    checkWasmFresh();
    dojoPromise = DojoWasm.load(fs.readFileSync(checkWasmFresh()));
  }
  return dojoPromise;
}

async function setup(items, courseOverrides) {
  const dojo = await getDojo();
  const content = makeContent(items, courseOverrides);
  const doc = { v: 1, t: 0, items: {}, stats: { days: {}, newByDay: {} }, settings: {}, exams: {} };
  const clock = { t: NOW };
  const store = {
    doc,
    update(fn) { fn(doc); doc.t = clock.t; },
    noteAnswer() {}
  };
  const engine = DojoSession.createEngine({
    dojo, store, content,
    now: () => clock.t,
    today: () => TODAY,
    random: () => 0.5
  });
  return { engine, doc, store, clock, content };
}

function ids(session) {
  const out = [];
  for (let c = session.current(); c; c = session.next()) out.push(c.item.id);
  return out;
}

test('placementQueue excludes units with placement:false', async () => {
  const items = [
    makeItem('i1', 'choice', 'u1'),
    makeItem('i2', 'choice', 'u1'),
    makeItem('i3', 'choice', 'u2'),
    makeItem('i4', 'choice', 'u2')
  ];
  const courseOverrides = {
    placement: { mode: 'self' },
    units: [
      { id: 'u1', title: 'Unit 1', placement: false },
      { id: 'u2', title: 'Unit 2', placement: true }
    ]
  };
  const t = await setup(items, courseOverrides);
  const s = t.engine.start('placement', { seed: 'fixed' });
  const list = ids(s);
  // Only u2 items should be in the queue (u1 has placement: false)
  assert.ok(list.every(id => id.startsWith('i') && !id.startsWith('i1') && !id.startsWith('i2')));
  assert.ok(list.some(id => id === 'i3' || id === 'i4'));
});

test('placementQueue includes units with placement:true', async () => {
  const items = [
    makeItem('i1', 'choice', 'u1'),
    makeItem('i2', 'choice', 'u1')
  ];
  const courseOverrides = {
    placement: { mode: 'self' },
    units: [
      { id: 'u1', title: 'Unit 1', placement: true }
    ]
  };
  const t = await setup(items, courseOverrides);
  const s = t.engine.start('placement', { seed: 'fixed' });
  const list = ids(s);
  assert.strictEqual(list.length, 2);
  assert.ok(list.includes('i1'));
  assert.ok(list.includes('i2'));
});

test('placementQueue includes units with placement absent (default true)', async () => {
  const items = [
    makeItem('i1', 'choice', 'u1'),
    makeItem('i2', 'choice', 'u1')
  ];
  const courseOverrides = {
    placement: { mode: 'self' },
    units: [
      { id: 'u1', title: 'Unit 1' } // placement not specified, should default to included
    ]
  };
  const t = await setup(items, courseOverrides);
  const s = t.engine.start('placement', { seed: 'fixed' });
  const list = ids(s);
  assert.strictEqual(list.length, 2);
  assert.ok(list.includes('i1'));
  assert.ok(list.includes('i2'));
});

test('placementQueue includes units with placement:null (default true)', async () => {
  const items = [
    makeItem('i1', 'choice', 'u1'),
    makeItem('i2', 'choice', 'u1')
  ];
  const courseOverrides = {
    placement: { mode: 'self' },
    units: [
      { id: 'u1', title: 'Unit 1', placement: null }
    ]
  };
  const t = await setup(items, courseOverrides);
  const s = t.engine.start('placement', { seed: 'fixed' });
  const list = ids(s);
  assert.strictEqual(list.length, 2);
  assert.ok(list.includes('i1'));
  assert.ok(list.includes('i2'));
});

test('placementQueue with mixed placement flags', async () => {
  const items = [
    makeItem('i1', 'choice', 'u1'),
    makeItem('i2', 'choice', 'u1'),
    makeItem('i3', 'choice', 'u2'),
    makeItem('i4', 'choice', 'u2'),
    makeItem('i5', 'choice', 'u3'),
    makeItem('i6', 'choice', 'u3')
  ];
  const courseOverrides = {
    placement: { mode: 'self' },
    units: [
      { id: 'u1', title: 'Unit 1', placement: false },
      { id: 'u2', title: 'Unit 2', placement: true },
      { id: 'u3', title: 'Unit 3' } // no placement, should be included
    ]
  };
  const t = await setup(items, courseOverrides);
  const s = t.engine.start('placement', { seed: 'fixed' });
  const list = ids(s);
  // Should only include u2 and u3 items
  assert.ok(list.every(id => id.startsWith('i3') || id.startsWith('i4') || id.startsWith('i5') || id.startsWith('i6')));
  assert.ok(!list.some(id => id.startsWith('i1') || id.startsWith('i2')));
});

test('placementQueue excludes all units when all have placement:false', async () => {
  const items = [
    makeItem('i1', 'choice', 'u1'),
    makeItem('i2', 'choice', 'u2')
  ];
  const courseOverrides = {
    placement: { mode: 'self' },
    units: [
      { id: 'u1', title: 'Unit 1', placement: false },
      { id: 'u2', title: 'Unit 2', placement: false }
    ]
  };
  const t = await setup(items, courseOverrides);
  const s = t.engine.start('placement', { seed: 'fixed' });
  // All units excluded, so start should return empty error
  assert.deepStrictEqual(s, { error: 'empty' });
});

test('placementQueue with perUnit limit respects placement:false', async () => {
  const items = [
    makeItem('i1', 'choice', 'u1'),
    makeItem('i2', 'choice', 'u1'),
    makeItem('i3', 'choice', 'u2'),
    makeItem('i4', 'choice', 'u2')
  ];
  const courseOverrides = {
    placement: { mode: 'self', perUnit: 1 },
    units: [
      { id: 'u1', title: 'Unit 1', placement: false },
      { id: 'u2', title: 'Unit 2', placement: true }
    ]
  };
  const t = await setup(items, courseOverrides);
  const s = t.engine.start('placement', { seed: 'fixed' });
  const list = ids(s);
  // u1 has placement:false, so only u2 items should be included, with perUnit=1
  assert.strictEqual(list.length, 1);
  assert.ok(list[0].startsWith('i3') || list[0].startsWith('i4'));
});

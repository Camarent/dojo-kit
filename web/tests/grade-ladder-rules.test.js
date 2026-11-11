'use strict';
const test = require('node:test');
const assert = require('node:assert');
const gradeMod = require('../session/grade.js');

// Stub engine: records every call and answers with an empty record.
function stubEngine() {
  const calls = [];
  return { calls, call: (name, args) => { calls.push({ name, args }); return {}; } };
}

// ctx for one item (type 'gap', unit 'u1') and one entity (member 'i2' of entity 'e1', unit 'u1').
function ctxWith(engine, cfg) {
  return {
    dojo: engine,
    now: () => 1000,
    scopedEntityOf: { i2: 'e1' },
    scopedUnit: { e1: 'u1' },
    fn: {
      records: () => ({}),
      itemLadderFor: () => [1, 2, 3],
      dropForItem: () => 1,
      ladderForUnit: () => [1, 2, 3],
      scopedMemberList: () => ['i2'],
      scopedRecords: () => ({}),
      getUnitSettingsOverride: () => ({}),
      unitConfig: () => cfg,
    },
  };
}

const sx = { mode: 'daily', session: { id: 's1', seed: 'x' }, entityWrong: {} };
const item = { id: 'i1', type: 'gap', unit: 'u1' };
const entityItem = { id: 'i2', type: 'gap', unit: 'u1' };

test('item and entity calls pass jumpTo and wrongFloor from unitConfig', () => {
  const engine = stubEngine();
  const g = gradeMod.create(ctxWith(engine, { jumpTo: 3, wrongFloor: 2 }), sx);
  g.nextRecord(item, false, false);
  g.nextRecord(entityItem, false, false);
  const answer = engine.calls.find((c) => c.name === 'applyAnswer');
  const entity = engine.calls.find((c) => c.name === 'applyEntity');
  assert.ok(answer && entity, JSON.stringify(engine.calls.map((c) => c.name)));
  assert.strictEqual(answer.args.jumpTo, 3);
  assert.strictEqual(answer.args.wrongFloor, 2);
  assert.strictEqual(entity.args.jumpTo, 3);
  assert.strictEqual(entity.args.wrongFloor, 2);
});

test('unset jumpTo and wrongFloor reach the engine as null', () => {
  const engine = stubEngine();
  const g = gradeMod.create(ctxWith(engine, { jumpTo: null, wrongFloor: null }), sx);
  g.nextRecord(item, false, false);
  g.nextRecord(entityItem, false, false);
  const answer = engine.calls.find((c) => c.name === 'applyAnswer');
  const entity = engine.calls.find((c) => c.name === 'applyEntity');
  assert.ok(answer && entity);
  for (const args of [answer.args, entity.args]) {
    assert.ok('jumpTo' in args, 'jumpTo key present');
    assert.ok('wrongFloor' in args, 'wrongFloor key present');
    assert.strictEqual(args.jumpTo, null);
    assert.strictEqual(args.wrongFloor, null);
  }
});

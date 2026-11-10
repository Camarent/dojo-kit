'use strict';
const test = require('node:test');
const assert = require('node:assert');
const DojoWasm = require('../dojo-wasm.js');
const DojoSession = require('../session.js');
const { checkWasmFresh } = require('./loader.js');

const NOW = 1760000000000;
const TODAY = '2025-10-09';
const DAY = 24 * 60 * 60 * 1000;
const ASPECTS = [{ id: 'meaning', tags: ['meaning'], title: 'Meaning' }];

function gap(id, unit, tags) {
  const it = { id, unit, type: 'gap', prompt: 'Q ' + id, answers: ['a' + id], explanation: 'e' };
  if (tags) it.tags = tags;
  return it;
}

// kg: group with onlyTags on (extraTags t1). kanji k1 is tagged, k2 is not.
// og: decoy group without onlyTags; vocab v1 is untagged and must stay.
// o1 sits in no group and must stay.
function content(topics) {
  const its = [gap('k1', 'kanji', ['t1']), gap('k2', 'kanji'), gap('v1', 'vocab'), gap('o1', 'other')];
  const groups = [
    { id: 'kg', title: 'KG', units: ['kanji'], newPerDay: 5, extraTags: ['t1'] },
    { id: 'og', title: 'OG', units: ['vocab'], newPerDay: 5, extraTags: ['t9'] }
  ];
  const course = { id: 'c', units: [{ id: 'kanji' }, { id: 'vocab' }, { id: 'other' }], groups, placement: { mode: 'check' } };
  if (topics) course.topics = { aspects: ASPECTS };
  return { v: 1, course, items: its, version: 't', lock: its.map(i => i.id) };
}

let dojoPromise;
function getDojo() {
  if (!dojoPromise) dojoPromise = DojoWasm.load(require('node:fs').readFileSync(checkWasmFresh()));
  return dojoPromise;
}

// opts.bad: every item has a wrong answer, so the weak (retry) queue has candidates.
// opts.due: every item has a record due now, so the due (review) queue has candidates.
// opts.topics: course.topics set, so the review queue is the topic queue (builtQueue(true)).
async function setup(onlyTags, opts) {
  const o = opts || {};
  const doc = { v: 1, t: 0, items: {}, stats: { days: {}, newByDay: {} }, settings: { newPerDay: 20 }, exams: {} };
  if (o.bad) ['k1', 'k2', 'v1', 'o1'].forEach(id => { doc.items[id] = { s: 1, due: NOW - 1000, ok: 0, bad: 1, last: NOW - DAY }; });
  if (o.due) ['k1', 'k2', 'v1', 'o1'].forEach(id => { doc.items[id] = { s: 1, due: NOW - 1000, ok: 1, bad: 0, last: NOW - DAY }; });
  const clock = { t: NOW };
  const store = { doc, update(fn) { fn(doc); doc.t = clock.t; }, noteAnswer() {} };
  const engine = DojoSession.createEngine({ dojo: await getDojo(), store, content: content(o.topics), now: () => clock.t, today: () => TODAY, random: () => 0.5 });
  if (onlyTags) engine.setGroupSetting('kg', { onlyTags: true });
  return engine;
}

function idsOf(engine, mode, opts) {
  const s = engine.start(mode, opts);
  const out = [];
  for (let c = s.current(); c; c = s.next()) out.push(c.item.id);
  return out;
}

test('onlyTags daily queue drops untagged items of the group, keeps decoys (other group, ungrouped)', async () => {
  const off = idsOf(await setup(false), 'daily');
  assert.ok(off.includes('k2'), 'control: k2 is in the daily queue when onlyTags is off');
  const on = idsOf(await setup(true), 'daily');
  assert.ok(!on.includes('k2'));
  assert.ok(on.includes('k1') && on.includes('v1') && on.includes('o1'));
});

test('onlyTags practice queue drops untagged items of the group, keeps decoys (other group, ungrouped)', async () => {
  const off = idsOf(await setup(false), 'practice');
  assert.ok(off.includes('k2'), 'control: k2 is in the practice queue when onlyTags is off');
  const on = idsOf(await setup(true), 'practice');
  assert.ok(!on.includes('k2'));
  assert.ok(on.includes('k1') && on.includes('v1') && on.includes('o1'));
});

test('onlyTags weak (weighted retry) queue drops untagged items of the group, keeps decoys', async () => {
  const weakIds = (e) => e.weakList(20).map(r => r.id);
  const off = weakIds(await setup(false, { bad: true }));
  assert.ok(off.includes('k2'), 'control: k2 is in the weak queue when onlyTags is off');
  const on = weakIds(await setup(true, { bad: true }));
  assert.ok(!on.includes('k2'));
  assert.ok(on.includes('k1') && on.includes('v1') && on.includes('o1'));
});

test('onlyTags topic review queue (course.topics, counts().due) drops untagged group items, keeps decoys', async () => {
  const dueIds = async (onlyTags) => {
    const e = await setup(onlyTags, { due: true, topics: true });
    return e.counts().due;
  };
  const off = await dueIds(false);
  const on = await dueIds(true);
  assert.ok(off >= 4, 'control: all four due items count when onlyTags is off');
  assert.strictEqual(on, off - 1, 'only k2 (untagged, group kg) leaves the review queue');
});

test('onlyTags leaves placement unfiltered: placement session does not read the group queue (scout)',async () => {
  const off = (await setup(false)).start('placement');
  const on = (await setup(true)).start('placement');
  assert.ok(on.total > 0);
  assert.strictEqual(on.total, off.total, 'placement size is the same with onlyTags on');
});

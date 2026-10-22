'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { setup2, NOW, DAY } = require('./fixtures.js');

const SNAP = path.join(__dirname, 'snapshots', 'session-queues.json');
const TODAY = '2025-10-09';

function mk(units, extra) {
  const items = [];
  units.forEach((u) => {
    for (let i = 1; i <= u.n; i++) {
      const it = { id: u.id + '-' + i, unit: u.id, type: 'gap', prompt: 'Q ' + u.id + i, answers: ['a'], explanation: 'e' };
      if (u.tags) it.tags = u.tags(i);
      if (u.entity) it.entity = u.entity(i);
      if (u.retired && u.retired.includes(i)) it.status = 'retired';
      items.push(it);
    }
  });
  const course = Object.assign({ id: 'c', title: 'C', units: units.map((u) => Object.assign({ id: u.id, title: u.id }, u.course || {})) }, extra);
  return { v: 1, version: 't', lock: items.map((i) => i.id), items, course };
}

const rec = (s, dueOff, bad) => ({ s, due: NOW + dueOff, ok: 1, bad: bad || 0, last: NOW - DAY });
const tagsOf = (i) => (i % 2 ? ['n5'] : ['n4']);

const SCENARIOS = {
  uncappedStaleDueRetired: () => ({
    content: mk([{ id: 'a', n: 6, retired: [3] }, { id: 'b', n: 6 }]),
    items: { 'a-1': rec(1, -5000, 2), 'a-2': rec(2, -9000), 'b-1': rec(1, DAY), 'b-2': rec(3, -DAY, 1), 'a-3': rec(1, -1000) },
    settings: { newPerDay: 4 }
  }),
  cappedAndUncappedGroups: () => ({
    content: mk([{ id: 'a', n: 6 }, { id: 'b', n: 6 }, { id: 'c', n: 4 }], {
      groups: [{ id: 'g1', title: 'G1', units: ['a', 'b'], newPerDay: 3 }, { id: 'g2', title: 'G2', units: ['c'] }]
    }),
    items: { 'a-1': rec(1, -1000), 'c-1': rec(1, -2000) },
    settings: { newPerDay: 5 },
    stats: { newByDay: { [TODAY]: 1 }, 'newBy:a': { [TODAY]: 1 } }
  }),
  sharedEntitiesAcrossUnits: () => ({
    content: mk([{ id: 'a', n: 5, entity: (i) => 'e' + i }, { id: 'b', n: 5, entity: (i) => 'e' + i }], {
      groups: [{ id: 'g1', title: 'G1', units: ['a', 'b'], newPerDay: 2 }]
    }),
    items: { 'a-2': rec(1, -1000) },
    settings: { newPerDay: 6 }
  }),
  extraNewPlain: () => ({
    content: mk([{ id: 'a', n: 8 }, { id: 'b', n: 4 }], {
      groups: [{ id: 'g1', title: 'G1', units: ['a'], newPerDay: 2, extraNew: true }]
    }),
    items: {},
    settings: { newPerDay: 3 },
    stats: { extraNewByDay: { [TODAY]: 3 } }
  }),
  extraNewOnlyTags: () => ({
    content: mk([{ id: 'a', n: 10, tags: tagsOf }], {
      groups: [{ id: 'g1', title: 'G1', units: ['a'], newPerDay: 2, extraNew: true, extraTags: ['n5'] }]
    }),
    items: {},
    settings: { newPerDay: 3, 'group:g1:onlyTags': true },
    stats: { extraNewByDay: { [TODAY]: 3 } }
  }),
  extraNewRandom: () => ({
    content: mk([{ id: 'a', n: 10, entity: (i) => 'e' + Math.ceil(i / 2) }], {
      groups: [{ id: 'g1', title: 'G1', units: ['a'], newPerDay: 2, extraNew: true }]
    }),
    items: { 'a-9': rec(1, -1000) },
    settings: { newPerDay: 3, 'group:g1:extraRandom': true },
    stats: { extraNewByDay: { [TODAY]: 2 }, 'newBy:g:g1': { [TODAY]: 1 } }
  }),
  extraNewTagsAndRandom: () => ({
    content: mk([{ id: 'a', n: 12, tags: tagsOf }], {
      groups: [{ id: 'g1', title: 'G1', units: ['a'], newPerDay: 3, extraNew: true, extraTags: ['n5'] }]
    }),
    items: {},
    settings: { newPerDay: 3, 'group:g1:onlyTags': true, 'group:g1:extraRandom': true },
    stats: { extraNewByDay: { [TODAY]: 4 } }
  }),
  unitNewOrderRandom: () => ({
    content: mk([{ id: 'a', n: 8, course: { newOrder: 'random' } }, { id: 'b', n: 5 }]),
    items: { 'a-2': rec(1, -1000) },
    settings: { newPerDay: 20 }
  }),
  groupNewOrderRandomCapped: () => ({
    content: mk([{ id: 'a', n: 8 }, { id: 'b', n: 4, course: { newOrder: 'random' } }], {
      groups: [{ id: 'g1', title: 'G1', units: ['a'], newPerDay: 3, newOrder: 'random' }]
    }),
    items: {},
    settings: { newPerDay: 20 }
  }),
  scopedEntities: () => ({
    content: mk([{ id: 'a', n: 6, entity: (i) => 'e' + Math.ceil(i / 2) }, { id: 'b', n: 4 }], { srs: { scope: 'entity' } }),
    items: { 'a-1': rec(1, -1000, 1), 'a-2': rec(1, -1000, 1), 'a-3': rec(2, DAY) },
    settings: { newPerDay: 3 }
  }),
  overridesUnitAndGroup: () => ({
    content: mk([{ id: 'a', n: 8 }, { id: 'b', n: 8 }], {
      groups: [{ id: 'g1', title: 'G1', units: ['a'], newPerDay: 5 }]
    }),
    items: {},
    settings: { newPerDay: 10, 'unit:b:newPerDay': 2, 'unit:b:newOrder': 'random', 'group:g1:newPerDay': 2, 'group:g1:newOrder': 'random' }
  }),
  extraNewCapSpent: () => ({
    content: mk([{ id: 'a', n: 10, tags: tagsOf }], {
      groups: [{ id: 'g1', title: 'G1', units: ['a'], newPerDay: 2, extraNew: true, extraTags: ['n5'] }]
    }),
    items: { 'a-1': rec(1, DAY), 'a-2': rec(1, DAY) },
    settings: { newPerDay: 3, 'group:g1:onlyTags': true, 'group:g1:extraRandom': true },
    stats: { extraNewByDay: { [TODAY]: 2 }, 'newBy:g:g1': { [TODAY]: 3 } }
  }),
  placementCourse: () => ({
    content: mk([{ id: 'a', n: 8 }, { id: 'b', n: 8, retired: [2] }], { placement: { perUnit: 3 } }),
    items: { 'a-1': rec(1, -1000, 3), 'b-1': rec(2, DAY, 2) },
    settings: {}
  })
};

function idsOf(session) {
  if (session.error) return { error: session.error };
  const out = [];
  for (let c = session.current(); c; c = session.next()) out.push(c.item.id);
  return out;
}

async function capture(name) {
  const sc = SCENARIOS[name]();
  const t = await setup2(sc.content, sc.settings);
  Object.assign(t.doc.items, sc.items);
  Object.assign(t.doc.stats, sc.stats || {});
  const e = t.engine;
  const c = e.counts();
  const out = {
    counts: { total: c.total, active: c.active, due: c.due, fresh: c.fresh, learning: c.learning, learned: c.learned, newToday: c.newToday, queue: c.queue, byUnit: c.byUnit, totals: c.totals, summary: c.summary },
    groupCounts: { groups: c.groups, bars: c.bars },
    dailyQueue: {},
    weakList: e.weakList(10).map((x) => x.id)
  };
  const groups = (sc.content.course.groups || []).map((g) => g.id);
  out.builtQueue = idsOf(e.start('daily'));
  groups.forEach((g) => { out.dailyQueue[g] = idsOf(e.start('daily', { groupId: g })); });
  out.practice = idsOf(e.start('practice', { limit: 8 }));
  out.weakQueue = idsOf(e.start('weak', { limit: 5 }));
  if (sc.content.course.placement) out.placement = idsOf(e.start('placement', { seed: 'fixed' }));
  return out;
}

async function captureAll() {
  const all = {};
  for (const n of Object.keys(SCENARIOS)) all[n] = JSON.parse(JSON.stringify(await capture(n)));
  return all;
}

test('scenario set covers the required options', () => {
  assert.ok(Object.keys(SCENARIOS).length >= 8);
});

test('session queues match the characterization snapshot', async () => {
  const got = await captureAll();
  if (process.env.UPDATE_SNAPSHOT === '1') {
    fs.writeFileSync(SNAP, JSON.stringify(got, null, 2) + '\n');
    return;
  }
  assert.deepStrictEqual(got, JSON.parse(fs.readFileSync(SNAP, 'utf8')));
});

test('queue capture is deterministic across runs', async () => {
  assert.deepStrictEqual(await captureAll(), await captureAll());
});

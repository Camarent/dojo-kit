'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const DojoWasm = require('../dojo-wasm.js');
const DojoSession = require('../session.js');
const { checkWasmFresh } = require('./loader.js');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, 'web', p), 'utf8');
const NOW = 1760000000000;
const MIN = 60000;
const DAY = 24 * 60 * MIN;
const TODAY = '2025-10-09';

let dojoP;
function getDojo() {
  if (!dojoP) dojoP = DojoWasm.load(fs.readFileSync(checkWasmFresh()));
  return dojoP;
}

function mkItems(unitId, count) {
  const out = [];
  for (let i = 1; i <= count; i++) {
    out.push({ id: unitId + '-' + i, unit: unitId, type: 'gap', prompt: 'P' + i, answers: ['a' + i], tags: ['t'] });
  }
  return out;
}

function mkContent(course, items) {
  return {
    v: 1, version: 't', lock: items.map((i) => i.id), items,
    course: Object.assign({ id: 'c', title: 'C', units: [{ id: 'u1', title: 'U1' }, { id: 'u2', title: 'U2' }] }, course)
  };
}

async function setup(course, items, opts) {
  const o = opts || {};
  const doc = { v: 1, t: 0, items: {}, stats: { days: {}, newByDay: {} }, settings: o.settings || {}, exams: {} };
  const clock = { t: NOW };
  const store = {
    doc,
    update(fn) { fn(doc); }
  };
  const content = mkContent(course, items);
  const dojo = await getDojo();
  const engine = DojoSession.createEngine({ dojo, store, content, now: () => clock.t, today: () => TODAY, random: () => 0.5 });
  return { engine, doc, clock, store, content };
}

function setRec(doc, id, rec) {
  doc.items[id] = rec;
}

test('counts() with default learnedStage: new, learning, learned', async () => {
  const items = mkItems('u1', 3);
  const t = await setup({}, items);
  
  setRec(t.doc, 'u1-1', null);
  setRec(t.doc, 'u1-2', { s: 1, due: NOW + DAY, ok: 1, bad: 0, last: NOW });
  setRec(t.doc, 'u1-3', { s: 4, due: NOW + 7 * DAY, ok: 1, bad: 0, last: NOW });
  
  const c = t.engine.counts();
  assert.strictEqual(c.byUnit.u1.fresh, 1, 'u1 fresh should be 1');
  assert.strictEqual(c.byUnit.u1.learning, 1, 'u1 learning should be 1');
  assert.strictEqual(c.byUnit.u1.learned, 1, 'u1 learned should be 1');
  assert.strictEqual(c.byUnit.u1.total, 3, 'u1 total should be 3');
  assert.strictEqual(c.byUnit.u1.fresh + c.byUnit.u1.learning + c.byUnit.u1.learned, c.byUnit.u1.total, 'fresh + learning + learned == total');
  
  assert.strictEqual(c.fresh, 1, 'total fresh should be 1');
  assert.strictEqual(c.learning, 1, 'total learning should be 1');
  assert.strictEqual(c.learned, 1, 'total learned should be 1');
  assert.strictEqual(c.totals.fresh, 1);
  assert.strictEqual(c.totals.learning, 1);
  assert.strictEqual(c.totals.learned, 1);
  assert.strictEqual(c.totals.total, 3);
});

test('counts() with custom learnedStage shifts boundary', async () => {
  const items = mkItems('u1', 4);
  const course = { learnedStage: 2 };
  const t = await setup(course, items);
  
  setRec(t.doc, 'u1-1', null);
  setRec(t.doc, 'u1-2', { s: 1, due: NOW + DAY, ok: 1, bad: 0, last: NOW });
  setRec(t.doc, 'u1-3', { s: 2, due: NOW + 3 * DAY, ok: 1, bad: 0, last: NOW });
  setRec(t.doc, 'u1-4', { s: 4, due: NOW + 7 * DAY, ok: 1, bad: 0, last: NOW });
  
  const c = t.engine.counts();
  assert.strictEqual(c.byUnit.u1.fresh, 1, 'u1 fresh should be 1');
  assert.strictEqual(c.byUnit.u1.learning, 1, 'u1 learning should be 1 (s=1 < 2)');
  assert.strictEqual(c.byUnit.u1.learned, 2, 'u1 learned should be 2 (s=2 and s=4 >= 2)');
  assert.strictEqual(c.byUnit.u1.total, 4);
  assert.strictEqual(c.byUnit.u1.fresh + c.byUnit.u1.learning + c.byUnit.u1.learned, c.byUnit.u1.total);
  
  assert.strictEqual(c.totals.learned, 2);
});

test('counts() excludes retired items', async () => {
  const items = mkItems('u1', 3);
  const course = {};
  const t = await setup(course, items);
  
  setRec(t.doc, 'u1-1', null);
  t.content.items[0].status = 'retired';
  setRec(t.doc, 'u1-2', { s: 1, due: NOW + DAY, ok: 1, bad: 0, last: NOW });
  setRec(t.doc, 'u1-3', { s: 4, due: NOW + 7 * DAY, ok: 1, bad: 0, last: NOW });
  
  const c = t.engine.counts();
  assert.strictEqual(c.byUnit.u1.total, 2, 'retired item excluded from total');
  assert.strictEqual(c.byUnit.u1.fresh, 0, 'retired new item excluded');
  assert.strictEqual(c.byUnit.u1.learning, 1);
  assert.strictEqual(c.byUnit.u1.learned, 1);
  assert.strictEqual(c.byUnit.u1.fresh + c.byUnit.u1.learning + c.byUnit.u1.learned, c.byUnit.u1.total);
});

test('counts() with due items in learning', async () => {
  const items = mkItems('u1', 2);
  const t = await setup({}, items);
  
  setRec(t.doc, 'u1-1', null);
  setRec(t.doc, 'u1-2', { s: 1, due: NOW - 1000, ok: 1, bad: 0, last: NOW });
  
  const c = t.engine.counts();
  assert.strictEqual(c.byUnit.u1.fresh, 1);
  assert.strictEqual(c.byUnit.u1.learning, 1);
  assert.strictEqual(c.byUnit.u1.learned, 0);
  assert.strictEqual(c.byUnit.u1.due, 1, 'due item is counted in learning and due');
  assert.strictEqual(c.due, 1);
});

test('counts() includes learning and learned in totals', async () => {
  const items = mkItems('u1', 2).concat(mkItems('u2', 1));
  const t = await setup({}, items);
  
  setRec(t.doc, 'u1-1', null);
  setRec(t.doc, 'u1-2', { s: 4, due: NOW + 7 * DAY, ok: 1, bad: 0, last: NOW });
  setRec(t.doc, 'u2-1', null);
  
  const c = t.engine.counts();
  assert.ok(c.totals, 'Should have totals');
  assert.strictEqual(c.totals.total, 3);
  assert.strictEqual(c.totals.fresh, 2);
  assert.strictEqual(c.totals.learning, 0);
  assert.strictEqual(c.totals.learned, 1);
  assert.strictEqual(c.totals.fresh + c.totals.learning + c.totals.learned, c.totals.total);
});

test('Home render: empty unit has no bar', async () => {
  const sb = { console: { warn() {}, log: console.log } };
  sb.self = sb;
  vm.createContext(sb);
  ['vendor/preact.min.js', 'vendor/htm.umd.js', 'ext.js', 'session.js'].forEach((f) => vm.runInContext(read(f), sb, { filename: f }));
  ['speech.js', 'types/registry.js', 'types/choice.js', 'types/gap.js', 'types/card.js', 'ui/app.js'].forEach((f) => vm.runInContext(read(f), sb, { filename: f }));
  
  const DojoApp = sb.DojoApp;
  
  const items = mkItems('u1', 1);
  const course = { id: 'c', title: 'C', units: [{ id: 'u1', title: 'U1' }, { id: 'u2', title: 'U2' }] };
  const content = { v: 1, items, course };
  const doc = { v: 1, t: 0, items: { 'u1-1': null }, stats: {}, settings: {} };
  const store = { doc, update() {} };
  const dojo = await getDojo();
  const engine = DojoSession.createEngine({ dojo, store, content, now: () => NOW, today: () => TODAY, random: () => 0.5 });
  
  const html = DojoApp._Home({ 
    t: (k, p) => {
      if (k === 'progress.aria' && p) {
        return p.fresh + ' new, ' + p.learning + ' learning, ' + p.learned + ' learned';
      }
      return k;
    },
    course,
    home: { counts: engine.counts(), streak: 0, weak: false, placementDone: false, resume: null },
    exams: [],
    status: 'local',
    resume: null,
    notice: null,
    examDaysLeft: null,
    onStart: () => {},
    onMoreNew: () => {},
    onPlacement: () => {},
    onResume: () => {},
    onStartOver: () => {},
    onDiscard: () => {},
    go: () => {}
  });
  
  const htmlStr = JSON.stringify(html);
  
  assert.ok(htmlStr.includes('U2'), 'Should have U2 unit');
  assert.ok(!htmlStr.includes('u2') || !htmlStr.includes('progress-bar') || htmlStr.indexOf('u2') > htmlStr.lastIndexOf('progress-bar'), 'Empty unit u2 should not have a bar');
});

test('Home render: total bar aria-label shows exact numbers', async () => {
  const sb = { console: { warn() {}, log: console.log } };
  sb.self = sb;
  vm.createContext(sb);
  ['vendor/preact.min.js', 'vendor/htm.umd.js', 'ext.js', 'session.js'].forEach((f) => vm.runInContext(read(f), sb, { filename: f }));
  ['speech.js', 'types/registry.js', 'types/choice.js', 'types/gap.js', 'types/card.js', 'ui/app.js'].forEach((f) => vm.runInContext(read(f), sb, { filename: f }));
  
  const DojoApp = sb.DojoApp;
  
  const items = mkItems('u1', 2).concat(mkItems('u2', 3));
  const course = { id: 'c', title: 'C', units: [{ id: 'u1', title: 'U1' }, { id: 'u2', title: 'U2' }, { id: 'u3', title: 'U3' }] };
  const content = { v: 1, items, course };
  const doc = { v: 1, t: 0, items: { 'u1-1': null, 'u1-2': null, 'u2-1': null, 'u2-2': null, 'u2-3': null }, stats: {}, settings: {} };
  const store = { doc, update() {} };
  const dojo = await getDojo();
  const engine = DojoSession.createEngine({ dojo, store, content, now: () => NOW, today: () => TODAY, random: () => 0.5 });
  const c = engine.counts();
  
  const html = DojoApp._Home({ 
    t: (k, p) => {
      if (k === 'progress.aria' && p) {
        return p.fresh + ' new, ' + p.learning + ' learning, ' + p.learned + ' learned';
      }
      return k;
    },
    course,
    home: { counts: c, streak: 0, weak: false, placementDone: false, resume: null },
    exams: [],
    status: 'local',
    resume: null,
    notice: null,
    examDaysLeft: null,
    onStart: () => {},
    onMoreNew: () => {},
    onPlacement: () => {},
    onResume: () => {},
    onStartOver: () => {},
    onDiscard: () => {},
    go: () => {}
  });
  
  const htmlStr = JSON.stringify(html);
  
  assert.ok(htmlStr.includes('5 new, 0 learning, 0 learned'), 'Total bar aria-label should show exact numbers');
});

test('per-unit ladder shorter than threshold uses last stage', async () => {
  const items = mkItems('u1', 3);
  const course = { 
    learnedStage: 10,
    units: [{ id: 'u1', title: 'U1', srs: { ladder: [0, DAY, 3 * DAY] } }]
  };
  const t = await setup(course, items);
  
  setRec(t.doc, 'u1-1', null);
  setRec(t.doc, 'u1-2', { s: 1, due: NOW + DAY, ok: 1, bad: 0, last: NOW });
  setRec(t.doc, 'u1-3', { s: 2, due: NOW + 3 * DAY, ok: 1, bad: 0, last: NOW });
  
  const c = t.engine.counts();
  assert.strictEqual(c.byUnit.u1.fresh, 1);
  assert.strictEqual(c.byUnit.u1.learning, 1, 's=1 < maxStage(2)');
  assert.strictEqual(c.byUnit.u1.learned, 1, 's=2 == maxStage(2), so learned');
  assert.strictEqual(c.byUnit.u1.total, 3);
});

test('learnedStage with 0 falls back to DEFAULT_LEARNED_STAGE', async () => {
  const items = mkItems('u1', 2);
  const course = { learnedStage: 0 };
  const t = await setup(course, items);
  
  setRec(t.doc, 'u1-1', null);
  setRec(t.doc, 'u1-2', { s: 4, due: NOW + 7 * DAY, ok: 1, bad: 0, last: NOW });
  
  const c = t.engine.counts();
  assert.strictEqual(c.byUnit.u1.fresh, 1);
  assert.strictEqual(c.byUnit.u1.learned, 1, 'With learnedStage=0, should use default 4, so s=4 >= 4 means learned');
});

test('learnedStage with null falls back to DEFAULT_LEARNED_STAGE', async () => {
  const items = mkItems('u1', 2);
  const course = { learnedStage: null };
  const t = await setup(course, items);
  
  setRec(t.doc, 'u1-1', null);
  setRec(t.doc, 'u1-2', { s: 4, due: NOW + 7 * DAY, ok: 1, bad: 0, last: NOW });
  
  const c = t.engine.counts();
  assert.strictEqual(c.byUnit.u1.fresh, 1);
  assert.strictEqual(c.byUnit.u1.learned, 1, 'With learnedStage=null, should use default 4, so s=4 >= 4 means learned');
});

test('ladder length 1 gives threshold 0', async () => {
  const items = mkItems('u1', 2);
  const course = { 
    learnedStage: 4,
    units: [{ id: 'u1', title: 'U1', srs: { ladder: [0] } }]
  };
  const t = await setup(course, items);
  
  setRec(t.doc, 'u1-1', null);
  setRec(t.doc, 'u1-2', { s: 0, due: NOW + DAY, ok: 1, bad: 0, last: NOW });
  
  const c = t.engine.counts();
  assert.strictEqual(c.byUnit.u1.fresh, 1);
  assert.strictEqual(c.byUnit.u1.learned, 1, 'With ladder length 1 (maxStage=0), threshold is 0, so s=0 >= 0 means learned');
});

test('ProgressBar percentages sum to exactly 100', async () => {
  const sb = { console: { warn() {}, log: console.log } };
  sb.self = sb;
  vm.createContext(sb);
  ['vendor/preact.min.js', 'vendor/htm.umd.js'].forEach((f) => vm.runInContext(read(f), sb, { filename: f }));
  vm.runInContext(read('ui/app.js'), sb, { filename: 'ui/app.js' });
  
  const ProgressBar = sb.DojoApp._ProgressBar;
  
  const counts = { total: 3, fresh: 1, learning: 1, learned: 1 };
  const html = ProgressBar({ counts, ariaLabel: '1 new, 1 learning, 1 learned' });
  const htmlStr = JSON.stringify(html);
  
  const widthMatches = htmlStr.match(/width: (\d+\.?\d*)%/g) || [];
  const totalPct = widthMatches.reduce((sum, w) => {
    const m = w.match(/width: (\d+\.?\d*)%/);
    return sum + (m ? parseFloat(m[1]) : 0);
  }, 0);
  assert.strictEqual(totalPct.toFixed(1), '100.0', 'Percentages should sum to exactly 100');
});

test('ProgressBar with learned > 0: learned segment width and aria-label', async () => {
  const sb = { console: { warn() {}, log: console.log } };
  sb.self = sb;
  vm.createContext(sb);
  ['vendor/preact.min.js', 'vendor/htm.umd.js'].forEach((f) => vm.runInContext(read(f), sb, { filename: f }));
  vm.runInContext(read('ui/app.js'), sb, { filename: 'ui/app.js' });
  
  const ProgressBar = sb.DojoApp._ProgressBar;
  
  const counts = { total: 6, fresh: 2, learning: 2, learned: 2 };
  const html = ProgressBar({ counts, ariaLabel: '2 new, 2 learning, 2 learned' });
  const htmlStr = JSON.stringify(html);
  
  const widthMatches = htmlStr.match(/width: (\d+\.?\d*)%/g) || [];
  const widths = widthMatches.map((w) => parseFloat(w.match(/width: (\d+\.?\d*)%/)[1]));
  
  const expectedLearnedPct = 2 / 6 * 100;
  const learnedWidth = widths.find(w => Math.abs(w - expectedLearnedPct) < 0.1);
  assert.ok(learnedWidth !== undefined, 'Learned segment width should be proportional to learned count');
  assert.ok(htmlStr.includes('2 new, 2 learning, 2 learned'), 'Aria-label should show the learned number');
});

test('CSS non-color cues for progress bars', async () => {
  const css = read('styles/app.css');
  
  assert.ok(css.includes('.progress-bar'), 'Should have .progress-bar rule');
  assert.ok(css.includes('border: 1px solid var(--border)'), 'progress-bar should have border using --border token');
  
  assert.ok(css.includes('.progress-segment.learning'), 'Should have .progress-segment.learning rule');
  assert.ok(css.includes('.progress-segment.learning {'), 'Should have .progress-segment.learning rule start');
  assert.ok(css.includes('box-shadow: inset 1px 0 0 var(--bg)'), 'progress-segment.learning should have inset box-shadow using --bg token');
  
  assert.ok(css.includes('.progress-segment.learned'), 'Should have .progress-segment.learned rule');
  assert.ok(css.includes('box-shadow: inset 1px 0 0 var(--bg)'), 'progress-segment.learned should have inset box-shadow using --bg token');
});

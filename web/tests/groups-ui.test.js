'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const DojoWasm = require('../dojo-wasm.js');
const DojoSession = require('../session.js');
const { checkWasmFresh } = require('./loader.js');
const { loadBundle } = require('./load-bundle.js');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const NOW = 1760000000000;
const TODAY = '2025-10-09';

function gap(id, unit, entity, tags) {
  const it = { id, unit, type: 'gap', prompt: 'Q ' + id, answers: ['a' + id], explanation: 'e' };
  if (entity) it.entity = entity;
  if (tags) it.tags = tags;
  return it;
}

function content(extra) {
  const items = [
    gap('k1', 'kanji', 'E1', ['n5']), gap('w1', 'vocab', 'E1', ['n5']),
    gap('k2', 'kanji', 'E2', ['n5']), gap('k3', 'kanji', 'E3'),
    gap('o1', 'other'), gap('o2', 'other')
  ];
  const course = Object.assign({ id: 'c', title: 'C', units: [{ id: 'kanji' }, { id: 'vocab' }, { id: 'other' }] }, extra);
  return { v: 1, course, items, version: 't', lock: items.map((i) => i.id) };
}

const GROUPS = [{ id: 'kv', title: 'KV group', units: ['kanji', 'vocab'], newPerDay: 2, extraNew: true, extraTags: ['n5'] }];

let dojoP;
function getDojo() {
  if (!dojoP) dojoP = DojoWasm.load(fs.readFileSync(checkWasmFresh()));
  return dojoP;
}

async function setup(c) {
  const doc = { v: 1, t: 0, items: {}, stats: { days: {}, newByDay: {} }, settings: {}, exams: {} };
  const store = { doc, update(fn) { fn(doc); doc.t = NOW; }, noteAnswer() {} };
  const engine = DojoSession.createEngine({ dojo: await getDojo(), store, content: c, now: () => NOW, today: () => TODAY, random: () => 0.5 });
  return { engine, doc };
}

function loadApp() {
  const sb = { console: { warn() {}, log: console.log } };
  loadBundle(sb, { only: ['vendor/preact.min.js', 'vendor/htm.umd.js', 'ext/registry.js', 'ext.js', 'types/registry.js', 'types/choice.js', 'types/gap.js', 'types/card.js', 'ui/i18n.js', 'ui/common.js', 'ui/detail.js'].concat(['ui/catalog.js']).concat(['ui/home.js']).concat(['ui/session-screen.js']).concat(['ui/results.js']).concat(['ui/placement.js']).concat(['ui/app.js']) });
  return sb;
}

// Expands function components so nested vnodes become visible.
function expand(n) {
  if (Array.isArray(n)) return n.map(expand);
  if (!n || typeof n !== 'object' || !n.props) return n;
  if (typeof n.type === 'function' && !(n.type.prototype && n.type.prototype.render)) {
    return expand(n.type(Object.assign({}, n.props)));
  }
  const kids = n.props.children;
  return { type: n.type, props: Object.assign({}, n.props, { children: kids === undefined ? kids : expand(kids) }) };
}

function walk(n, fn) {
  if (Array.isArray(n)) { n.forEach((c) => walk(c, fn)); return; }
  if (!n || typeof n !== 'object' || !n.props) return;
  fn(n);
  walk(n.props.children, fn);
}

function ids(tree) {
  const out = [];
  walk(tree, (n) => { if (n.props['data-testid']) out.push(n.props['data-testid']); });
  return out;
}

function find(tree, id) {
  let r = null;
  walk(tree, (n) => { if (!r && n.props['data-testid'] === id) r = n; });
  return r;
}

function text(n) {
  let s = '';
  (function rec(x) {
    if (Array.isArray(x)) return x.forEach(rec);
    if (typeof x === 'string' || typeof x === 'number') { s += x; return; }
    if (x && x.props) rec(x.props.children);
  })(n);
  return s;
}

function renderHome(sb, engine, c, onGroupSetting) {
  const en = JSON.parse(read('i18n/en.json'));
  const t = sb.DojoApp._makeT({ en }, 'en');
  const calls = [];
  const home = { counts: engine.counts(), streak: 0, weak: false, placementDone: false };
  const noop = () => {};
  const vnode = sb.DojoApp._Home({
    t, home, course: c.course, engine, exams: [], status: 'local', notice: null, examDaysLeft: null, resume: null,
    onStart: noop, onPlacement: noop, onMoreNew: noop, go: noop,
    onGroupSetting: onGroupSetting || ((g, f, v) => calls.push([g, f, v])),
    onResume: noop, onStartOver: noop, onDiscard: noop
  });
  return { tree: expand(vnode), calls };
}

test('group card shows counts() values and bars; extra buttons only on extraNew group', async () => {
  const c = content({ groups: GROUPS, bars: [{ title: 'N5', tags: ['n5'] }] });
  const { engine } = await setup(c);
  const g = engine.counts().groups.kv;
  const { tree } = renderHome(loadApp(), engine, c);
  assert.strictEqual(text(find(tree, 'group-kv-due')), 'Due ' + g.due);
  assert.strictEqual(text(find(tree, 'group-kv-new')), 'New today ' + g.newToday);
  assert.strictEqual(text(find(tree, 'group-kv-notstarted')), 'Not started yet: ' + g.fresh + ' of ' + g.total);
  assert.ok(find(tree, 'group-kv-extra'));
  assert.ok(find(tree, 'btn-extra-5-kv'));
  assert.ok(find(tree, 'bar-N5'));
  assert.strictEqual(find(tree, 'units-title'), null, 'ungrouped unit rows replaced by groups');
});

test('toggles call setGroupSetting with extraRandom / onlyTags', async () => {
  const c = content({ groups: GROUPS });
  const { engine } = await setup(c);
  const { tree, calls } = renderHome(loadApp(), engine, c);
  const input = (id) => { let r = null; walk(find(tree, id), (n) => { if (n.type === 'input') r = n; }); return r; };
  input('toggle-random-kv').props.onChange();
  input('toggle-onlyTags-kv').props.onChange();
  assert.deepStrictEqual(calls, [['kv', 'extraRandom', true], ['kv', 'onlyTags', true]]);
});

test('course without groups renders no group or bar sections', async () => {
  const c = content({});
  const { engine } = await setup(c);
  const { tree } = renderHome(loadApp(), engine, c);
  const all = ids(tree);
  assert.ok(!all.some((i) => /^group|^bars|^toggle-|^btn-extra/.test(i)), all.join(','));
  assert.ok(all.includes('btn-review'));
  assert.ok(find(tree, 'btn-more-5') || engine.counts().fresh <= engine.counts().newToday);
});

test('Home toggle for extraRandom reflects stored setting', async () => {
  const c = content({ groups: GROUPS });
  const { engine } = await setup(c);
  engine.setGroupSetting('kv', { extraRandom: true });
  const { tree } = renderHome(loadApp(), engine, c);
  let inp = null;
  walk(find(tree, 'toggle-random-kv'), (n) => { if (n.type === 'input') inp = n; });
  assert.strictEqual(inp.props.checked, true);
});

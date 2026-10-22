'use strict';
// Mutation coverage: drop `engine: p.engine` from the Home props in App.render -> 'real App renders group cards' fails;
// iterate Object.keys(groups) instead of course.groups order -> 'group card order' fails.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const DojoWasm = require('../dojo-wasm.js');
const DojoSession = require('../session.js');
const { checkWasmFresh } = require('./loader.js');
const { loadBundle } = require('./load-bundle.js');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const NOW = 1760000000000;
const TODAY = '2025-10-09';

function loadApp() {
  const sb = { console: { warn() {}, log: console.log } };
  loadBundle(sb, { only: ['vendor/preact.min.js', 'vendor/htm.umd.js', 'ext/registry.js', 'ext/ruby.js', 'ext/readings.js', 'ext.js', 'types/registry.js', 'types/choice.js', 'types/gap.js', 'types/card.js', 'ui/i18n.js', 'ui/common.js', 'ui/detail.js'].concat(['ui/catalog.js']).concat(['ui/home.js']).concat(['ui/stimulus.js']).concat(['ui/session-feedback.js']).concat(['ui/session-screen.js']).concat(['ui/results.js']).concat(['ui/placement.js']).concat(['ui/settings-speech.js']).concat(['ui/settings-sections.js']).concat(['ui/settings.js']).concat(['ui/app.js']) });
  return sb;
}
function expand(n) {
  if (Array.isArray(n)) return n.map(expand);
  if (!n || typeof n !== 'object' || !n.props) return n;
  if (typeof n.type === 'function' && !(n.type.prototype && n.type.prototype.render)) return expand(n.type(Object.assign({}, n.props)));
  const kids = n.props.children;
  return { type: n.type, props: Object.assign({}, n.props, { children: kids === undefined ? kids : expand(kids) }) };
}
function walk(n, fn) {
  if (Array.isArray(n)) { n.forEach((c) => walk(c, fn)); return; }
  if (!n || typeof n !== 'object' || !n.props) return;
  fn(n);
  walk(n.props.children, fn);
}
function find(tree, id) { let r = null; walk(tree, (n) => { if (!r && n.props['data-testid'] === id) r = n; }); return r; }
function text(n) {
  let s = '';
  (function rec(x) {
    if (Array.isArray(x)) return x.forEach(rec);
    if (typeof x === 'string' || typeof x === 'number') { s += x; return; }
    if (x && x.props) rec(x.props.children);
  })(n);
  return s;
}
function gap(id, unit, entity, tags) {
  const it = { id, unit, type: 'gap', prompt: 'Q ' + id, answers: ['a'], explanation: 'e' };
  if (entity) it.entity = entity;
  if (tags) it.tags = tags;
  return it;
}

async function mount(extra, settings) {
  const sb = loadApp();
  const dojo = await DojoWasm.load(fs.readFileSync(checkWasmFresh()));
  const items = [gap('k1', 'kanji', 'E1', ['n5']), gap('k2', 'kanji', 'E2', ['n5']), gap('g1', 'grammar'), gap('g2', 'grammar')];
  const groups = [
    { id: 'kv', title: 'KV', units: ['kanji'], newPerDay: 2, extraNew: true, extraTags: ['n5'] },
    { id: 'grammar', title: 'GR', units: ['grammar'], newPerDay: 2 }
  ];
  const course = Object.assign({ id: 'c', title: 'C', units: [{ id: 'kanji' }, { id: 'grammar' }], groups }, extra);
  const content = { v: 1, course, items, version: 't', lock: items.map((i) => i.id) };
  const doc = { v: 1, t: 0, items: {}, stats: { days: {}, newByDay: {} }, settings: settings || {}, exams: {} };
  const store = { doc, status: 'ok', update(fn) { fn(doc); doc.t = NOW; }, flush() {}, noteAnswer() {} };
  const engine = DojoSession.createEngine({ dojo, store, content, now: () => NOW, today: () => TODAY, random: () => 0.5 });
  const en = JSON.parse(read('i18n/en.json'));
  const t = sb.DojoApp._makeT({ en }, 'en');
  const byId = {};
  items.forEach((i) => { byId[i.id] = i; });
  const app = new sb.DojoApp._App({ store, engine, dojo, t, content, course, byId, now: () => NOW, today: () => TODAY, win: {} });
  app.setState = function (p) { this.state = Object.assign({}, this.state, typeof p === 'function' ? p(this.state) : p); };
  app.go('home');
  return { sb, app, engine, tree: () => expand(app.render(app.props, app.state)) };
}

test('real App renders group cards (Home receives engine)', async () => {
  const m = await mount({});
  const tree = m.tree();
  assert.ok(find(tree, 'group-kv'));
  assert.ok(find(tree, 'group-grammar'));
});

test('group card order follows course.groups, also after a toggle', async () => {
  const m = await mount({});
  const order = (tree) => { const o = []; walk(tree, (n) => { const id = n.props['data-testid']; if (n.type === 'li' && /^group-(kv|grammar)$/.test(id)) o.push(id); }); return o; };
  assert.deepStrictEqual(order(m.tree()), ['group-kv', 'group-grammar']);
  m.engine.setGroupSetting('kv', { onlyTags: true });
  m.app.refresh();
  assert.deepStrictEqual(order(m.tree()), ['group-kv', 'group-grammar']);
  const rev = await mount({ groups: [{ id: 'grammar', title: 'GR', units: ['grammar'], newPerDay: 2 }, { id: 'kv', title: 'KV', units: ['kanji'], newPerDay: 2, extraTags: ['n5'] }] });
  assert.deepStrictEqual(order(rev.tree()), ['group-grammar', 'group-kv']);
});

test('only-tag toggle label uses course.tagLabels, else the tag uppercased', async () => {
  const toggle = (m) => text(find(m.tree(), 'toggle-onlyTags-kv'));
  assert.strictEqual(toggle(await mount({})), 'Only N5');
  assert.strictEqual(toggle(await mount({ tagLabels: { n5: 'JLPT N5' } })), 'Only JLPT N5');
});

test('session count is shown once per page, from the daily queue length', async () => {
  const m = await mount({});
  const n = m.engine.start('daily', {}).total;
  assert.ok(n > 0);
  assert.strictEqual(m.engine.counts().queue, n);
  assert.strictEqual(text(find(m.tree(), 'session-count')), n + ' items in today\'s session');
  assert.strictEqual(find(m.tree(), 'group-kv-hint'), null);
});

test('exam countdown shows when settings.examDate is set', async () => {
  const m = await mount({}, { examDate: '2025-11-23' });
  assert.ok(/45/.test(text(find(m.tree(), 'exam-countdown'))));
});

test('fail() renders the error screen even when the previous tree is broken', () => {
  const sb = loadApp();
  const calls = [];
  const root = { textContent: 'x' };
  const realRender = sb.preact.render;
  sb.preact.render = (vnode, el) => { calls.push(vnode && vnode.type && vnode.type.name); if (calls.length === 2 && vnode) throw new Error('NotFoundError'); };
  assert.doesNotThrow(() => sb.DojoApp.fail(root, new Error('boom')));
  sb.preact.render = realRender;
  assert.ok(/boom/.test(root.textContent));
});

test('group card Start runs only that group\'s queue, top-level Review the whole one', async () => {
  const m = await mount({});
  const whole = m.engine.start('daily', {}).total;
  assert.strictEqual(whole, 4);
  for (const [gid, prefix] of [['kv', 'k'], ['grammar', 'g']]) {
    const btn = find(m.tree(), 'btn-start-group-' + gid);
    const shown = Number(text(find(m.tree(), 'group-' + gid + '-due')).replace(/\D/g, '')) + Number(text(find(m.tree(), 'group-' + gid + '-new')).replace(/\D/g, ''));
    assert.strictEqual(shown, 2);
    btn.props.onClick();
    const s = m.app.state.session;
    assert.strictEqual(s.total, shown);
    const seen = [];
    while (!s.done && seen.length < 10) { const c = s.current(); seen.push(c.item.id); s.skip ? s.skip() : s.next(); }
    assert.deepStrictEqual(seen.sort(), [prefix + '1', prefix + '2']);
    m.app.go('home');
  }
  find(m.tree(), 'btn-review').props.onClick();
  assert.strictEqual(m.app.state.session.total, 4);
});

test('home order: summary and buttons, then group cards, then the exams section', async () => {
  const exams = [{ id: 'e1', title: 'E1', sections: [{ unit: 'grammar', count: 1 }] }, { id: 'e2', title: 'E2', sections: [{ unit: 'grammar', count: 1 }] }];
  const m = await mount({ exams });
  const order = [];
  walk(m.tree(), (n) => {
    const id = n.props['data-testid'];
    if (id === 'btn-review' || id === 'groups' || id === 'exam-e1' || id === 'exam-e2') order.push(id);
  });
  assert.deepStrictEqual(order, ['btn-review', 'groups', 'exam-e1', 'exam-e2']);
  const sec = [];
  walk(m.tree(), (n) => { if (n.type === 'section' && n.props.class === 'exams') sec.push(n); });
  assert.strictEqual(sec.length, 1);
  assert.ok(find(sec[0], 'exam-e1') && find(sec[0], 'exam-e2'));
  assert.ok(/Mock exams/.test(text(sec[0])));
});

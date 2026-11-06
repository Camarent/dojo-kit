'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const DojoWasm = require('../dojo-wasm.js');
const DojoSession = require('../session.js');
const { checkWasmFresh } = require('./loader.js');
const { loadBundle } = require('./load-bundle.js');

const NOW = 1760000000000;
const TODAY = '2025-10-09';
const J = (x) => JSON.parse(JSON.stringify(x));
const tr = (k, v) => k + (v ? JSON.stringify(v) : '');

function mkItems(n) {
  const out = [];
  for (let i = 1; i <= n; i++) {
    out.push({ id: 'g' + i, unit: 'u', type: 'gap', prompt: 'P' + i, answers: ['x', 'xy'], explanation: 'E' + i, tags: ['a'] });
  }
  out[0].retry = ['y'];
  return out;
}

function mkContent(course, n) {
  const items = mkItems(n || 4);
  return {
    v: 1, version: 't', lock: items.map((i) => i.id), items,
    course: Object.assign({ id: 'c', title: 'C', units: [{ id: 'u', title: 'U' }] }, course)
  };
}

let dojoP;
function getDojo() {
  if (!dojoP) dojoP = DojoWasm.load(fs.readFileSync(checkWasmFresh()));
  return dojoP;
}

async function setup(course, opts) {
  const o = opts || {};
  const doc = { v: 1, t: 0, items: {}, stats: { days: {}, newByDay: {} }, settings: o.settings || {}, exams: {} };
  const clock = { t: NOW };
  const counters = { noted: 0 };
  const store = {
    doc,
    update(fn) { fn(doc); },
    noteAnswer() { counters.noted++; },
    exportText() { return JSON.stringify(doc); }
  };
  const content = o.content || mkContent(course, o.n);
  const dojo = o.wrapDojo ? o.wrapDojo(await getDojo()) : await getDojo();
  const engine = DojoSession.createEngine({ dojo, store, content, now: () => clock.t, today: () => TODAY, random: () => 0.5 });
  return { engine, doc, clock, store, content, counters, dojo };
}


function load(markup) {
  const sb = { console: { warn() {}, log: console.log } };
  loadBundle(sb, { only: ['vendor/preact.min.js', 'vendor/htm.umd.js', 'ext/registry.js', 'ext/input-script.js', 'ext.js', '../modules/ja/web/ruby-dict.js', '../modules/ja/web/ruby.js', '../modules/ja/web/readings.js', '../modules/ja/web/kanji-rows.js'] });
  sb.DojoSession = DojoSession;
  if (markup) {
    sb.DojoExt.registerMarkup('ruby', { render: (s) => s, plain: (s) => s.replace(/\{([^|}]*)\|[^}]*\}/g, '$1') });
    sb.DojoExt.use('ruby');
  }
  loadBundle(sb, { only: ['speech.js', 'types/registry.js', 'types/choice.js', 'types/gap.js', 'types/card.js', 'ui/i18n.js', 'ui/play-button.js', 'ui/common.js', 'ui/detail.js'].concat(['ui/catalog-audio.js']).concat(['ui/catalog.js']).concat(['ui/group-card.js']).concat(['ui/home.js']).concat(['ui/stimulus.js']).concat(['ui/session-feedback.js']).concat(['ui/session-focus.js']).concat(['ui/session-boundary.js']).concat(['ui/session-panels.js']).concat(['ui/session-screen.js']).concat(['ui/results.js']).concat(['ui/placement.js']).concat(['ui/settings-speech.js']).concat(['ui/settings-sections.js']).concat(['ui/settings-dialogs.js']).concat(['ui/settings.js']).concat(['ui/app-screens.js']).concat(['ui/app.js']) });
  return sb;
}

function find(n, id) {
  if (Array.isArray(n)) { for (const c of n) { const r = find(c, id); if (r) return r; } return null; }
  if (!n || typeof n !== 'object' || !n.props) return null;
  if (n.props['data-testid'] === id || n.props.testid === id) return n;
  return find(n.props.children, id);
}
function texts(n, out) {
  out = out || [];
  if (Array.isArray(n)) n.forEach((c) => texts(c, out));
  else if (n && typeof n === 'object' && n.props) texts(n.props.children, out);
  else if (n !== null && n !== undefined && n !== false) out.push(String(n));
  return out;
}
function classOf(n) { return n.props.class || n.props.className || ''; }

function inst(Cls, props) {
  const i = new Cls(props);
  i.props = props;
  i.setState = function (patch) { i.state = Object.assign({}, i.state, patch); };
  i.view = () => i.render(i.props, i.state);
  return i;
}


// ---- 1. Catalog + detail hook ----

async function catalogSetup() {
  const sb = load(true);
  const content = mkContent({ units: [{ id: 'u', title: 'U1' }, { id: 'v', title: 'U2' }] }, 3);
  content.items[0].prompt = '{Glyph|qzx}word';
  content.items[0].tags = ['kanji'];
  content.items[1].tags = ['kanji', 'extra'];
  content.items[2].unit = 'v';
  content.items[2].tags = ['other'];
  const t = await setup(null, { content });
  const cat = inst(sb.DojoApp._CatalogScreen, {
    t: tr, course: content.course, content, store: t.store, engine: t.engine, go() {}
  });
  return Object.assign(t, { sb, cat });
}




// ---- 2. Theme ----
function fakeEnv() {
  const attrs = {};
  return { attrs, document: { documentElement: { setAttribute(k, v) { attrs[k] = v; }, removeAttribute(k) { delete attrs[k]; } } } };
}




// ---- 3. Requeue counter ----


// ---- 4. More new ----



// ---- 5. Exam countdown ----


// ---- 6. allowOverride ----





// ---- 7. gap retry ----



// ---- 8. introNew ----


// ---- 9. deferred fixes ----

test('DojoExt.detail hands the hook deep clones and swallows plugin errors', () => {
  const sb = load();
  const ext = sb.DojoExt;
  const item = { id: 'a', prompt: 'p', meta: { k: [1] } };
  const items = [item];
  const records = { a: { s: 1 } };
  ext.registerDetail((it, ctx) => {
    it.prompt = 'changed'; it.meta.k.push(2);
    ctx.items[0].prompt = 'changed'; ctx.records.a.s = 9;
    return 'vnode';
  });
  assert.strictEqual(ext.detail(item, { items, records, t: tr }), 'vnode');
  assert.deepStrictEqual(J(item), { id: 'a', prompt: 'p', meta: { k: [1] } });
  assert.strictEqual(items[0].prompt, 'p');
  assert.strictEqual(records.a.s, 1);
  ext.registerDetail(() => { throw new Error('boom'); });
  assert.strictEqual(ext.detail(item, { items, records }), null);
});

test('Catalog: units are tabs, tags filter, stage colour from progress', async () => {
  const c = await catalogSetup();
  assert.ok(find(c.cat.view(), 'topic-g1') && find(c.cat.view(), 'topic-g2'));
  assert.strictEqual(find(c.cat.view(), 'topic-g3'), null);
  find(c.cat.view(), 'tab-v').props.onClick();
  assert.ok(find(c.cat.view(), 'topic-g3'));
  assert.strictEqual(find(c.cat.view(), 'topic-g1'), null);
  find(c.cat.view(), 'tab-u').props.onClick();
  find(c.cat.view(), 'tag-extra').props.onClick();
  assert.ok(find(c.cat.view(), 'topic-g2'));
  assert.strictEqual(find(c.cat.view(), 'topic-g1'), null);
  assert.ok(classOf(find(c.cat.view(), 'topic-state-g2')).includes('new'));
  find(c.cat.view(), 'tag-extra').props.onClick();
  const s = c.engine.start('daily');
  const answeredId = s.current().item.id;
  s.answer({ text: 'x' });
  const cls = classOf(find(c.cat.view(), 'topic-state-' + answeredId));
  assert.ok(!cls.includes('new'), cls);
});

test('Catalog: search matches DojoExt.plain() text and the raw reading', async () => {
  const c = await catalogSetup();
  const search = (q) => { find(c.cat.view(), 'catalog-search').props.onInput({ target: { value: q } }); };
  search('Glyphword');
  assert.ok(find(c.cat.view(), 'topic-g1'));
  assert.strictEqual(find(c.cat.view(), 'topic-g2'), null);
  search('qzx');
  assert.ok(find(c.cat.view(), 'topic-g1'));
  assert.strictEqual(find(c.cat.view(), 'topic-g2'), null);
  search('E2');
  assert.ok(find(c.cat.view(), 'topic-g2'));
});

test('Catalog detail: prompt, answers, explanation, stage and plugin hook with isolated clones', async () => {
  const c = await catalogSetup();
  let seen = null;
  c.sb.DojoExt.registerDetail((it, ctx) => { seen = { it, ctx }; it.prompt = 'MUTATED'; ctx.items.length = 0; return 'HOOK-OUT'; });
  find(c.cat.view(), 'topic-g2').props.children.props.onClick();
  const v = c.cat.view();
  assert.ok(find(v, 'catalog-detail'));
  assert.strictEqual(find(v, 'detail-prompt'), null);
  assert.ok(texts(find(v, 'detail-answers')).join('').includes('x'));
  assert.ok(texts(find(v, 'detail-explanation')).join('').includes('E2'));
  assert.ok(texts(find(v, 'detail-stage')).join('').includes('catalog.stage.new'));
  assert.deepStrictEqual(texts(find(v, 'detail-hook')), ['HOOK-OUT']);
  assert.ok(seen.ctx.items !== c.content.items);
  assert.strictEqual(c.content.items.length, 3);
  assert.strictEqual(c.content.items[1].prompt, 'P2');
  c.sb.DojoExt.registerDetail(() => { throw new Error('x'); });
  assert.strictEqual(find(c.cat.view(), 'detail-hook'), null);
});

test('Settings: theme select writes settings.theme with a timestamp and sets data-theme; auto clears it', async () => {
  const sb = load();
  const t = await setup();
  const win = fakeEnv();
  const set = inst(sb.DojoApp._SettingsScreen, { t: tr, store: t.store, engine: { globalNewPerDay: () => 10, unitSettings: () => ({}), unitConfig: () => ({ dropByType: {} }) }, content: t.content, course: t.content.course, now: () => NOW, win, status: 'ok', go() {}, onDataChanged() {} });
  const sel = () => find(set.view(), 'theme-select');
  sel().props.onChange({ target: { value: 'dark' } });
  assert.strictEqual(t.doc.settings.theme, 'dark');
  assert.strictEqual(t.doc.settings.ts.theme, NOW);
  assert.strictEqual(win.attrs['data-theme'], 'dark');
  sel().props.onChange({ target: { value: 'light' } });
  assert.strictEqual(win.attrs['data-theme'], 'light');
  sel().props.onChange({ target: { value: 'auto' } });
  assert.strictEqual(t.doc.settings.theme, 'auto');
  assert.strictEqual('data-theme' in win.attrs, false);
  assert.deepStrictEqual(texts(sel()), ['settings.theme.auto', 'settings.theme.light', 'settings.theme.dark']);
});

test('applyTheme: stored theme is applied at start, unknown value behaves as auto', () => {
  const sb = load();
  const win = fakeEnv();
  sb.DojoApp._applyTheme(win, 'dark');
  assert.strictEqual(win.attrs['data-theme'], 'dark');
  sb.DojoApp._applyTheme(win, 'neon');
  assert.strictEqual('data-theme' in win.attrs, false);
  sb.DojoApp._applyTheme(win, undefined);
  assert.strictEqual('data-theme' in win.attrs, false);
});

test('start() applies the saved theme before rendering', async () => {
  const sb = load();
  const win = fakeEnv();
  win.addEventListener = () => {};
  const doc = { settings: { theme: 'dark' } };
  sb.DojoMigrate = { create: () => () => null };
  sb.DojoStorage = { createStore: () => ({ doc, load: () => Promise.resolve(), attachLifecycle() {} }) };
  sb.DojoSession = { createEngine: () => ({}) };
  sb.preact.render = () => {};
  await sb.DojoApp.start({ root: {}, content: { course: { id: 'c' }, items: [] }, win, now: () => NOW, dojo: {} });
  assert.strictEqual(win.attrs['data-theme'], 'dark');
});

test('requeue counter: total stays initial, retry copies are counted separately', async () => {
  const t = await setup(null, { n: 3 });
  const s = t.engine.start('daily');
  assert.strictEqual(s.initialTotal, 3);
  assert.strictEqual(s.retryCount(), 0);
  s.answer({ text: 'zzz' });
  assert.strictEqual(s.retryCount(), 1);
  assert.strictEqual(s.initialTotal, 3);
  s.next();
  s.answer({ text: 'x' });
  s.next();
  s.answer({ text: 'x' });
  s.next();
  assert.strictEqual(s.current().position, 4);
  assert.strictEqual(s.initialTotal, 3);
  assert.strictEqual(s.retryCount(), 1);
});

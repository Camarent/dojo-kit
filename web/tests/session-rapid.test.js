'use strict';
// Real App + real Preact on a strict mini DOM (insertBefore/removeChild throw NotFoundError like browsers).
// Mutation checks: drop the `settled` guard in SessionScreen.next -> 'double next' fails;
// drop the SessionBoundary wrapper in App.render -> 'render error' tests fail.
// drop keyed() in ext.js text() -> the markup-shape test fails (NotFoundError).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const DojoWasm = require('../dojo-wasm.js');
const DojoSession = require('../session.js');
const { checkWasmFresh } = require('./loader.js');
const { loadBundle } = require('./load-bundle.js');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const NOW = 1760000000000;
const TODAY = '2025-10-09';

class Node_ {
  constructor(type, name) { this.nodeType = type; this.nodeName = name; this.childNodes = []; this.parentNode = null; this.attrs = {}; this.style = {}; this.listeners = {}; this.onclick = null; this.oninput = null; this.onsubmit = null; this.onkeydown = null; this.onchange = null; }
  get firstChild() { return this.childNodes[0] || null; }
  get nextSibling() { if (!this.parentNode) return null; const c = this.parentNode.childNodes; return c[c.indexOf(this) + 1] || null; }
  get localName() { return this.nodeName.toLowerCase(); }
  _detach(n) { if (n.parentNode) n.parentNode.removeChild(n); }
  appendChild(n) { this._detach(n); n.parentNode = this; this.childNodes.push(n); return n; }
  insertBefore(n, ref) {
    if (ref && ref.parentNode !== this) throw new Error("NotFoundError: Failed to execute 'insertBefore' on 'Node': The node before which the new node is to be inserted is not a child of this node.");
    if (ref === n) return n;
    this._detach(n);
    n.parentNode = this;
    this.childNodes.splice(ref ? this.childNodes.indexOf(ref) : this.childNodes.length, 0, n);
    return n;
  }
  removeChild(n) {
    if (n.parentNode !== this) throw new Error("NotFoundError: Failed to execute 'removeChild' on 'Node': The node to be removed is not a child of this node.");
    this.childNodes.splice(this.childNodes.indexOf(n), 1); n.parentNode = null; return n;
  }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  removeAttribute(k) { delete this.attrs[k]; }
  addEventListener(k, f) { (this.listeners[k] = this.listeners[k] || []).push(f); }
  removeEventListener(k, f) { this.listeners[k] = (this.listeners[k] || []).filter((x) => x !== f); }
  contains(n) { for (; n; n = n.parentNode) if (n === this) return true; return false; }
  focus() {}
  get textContent() { return this.nodeType === 3 ? this.data : this.childNodes.map((c) => c.textContent).join(''); }
  set textContent(v) { this.childNodes.forEach((c) => { c.parentNode = null; }); this.childNodes = []; if (v) this.appendChild(mkText(v)); }
  fire(type, ev) {
    if (type === 'click' && this.attrs.disabled !== undefined) return; (this.listeners[type] || []).slice().forEach((f) => f.call(this, Object.assign({ type, target: this, preventDefault() {}, stopPropagation() {} }, ev))); }
}
function mkText(s) { const n = new Node_(3, '#text'); n.data = String(s); return n; }
const doc = { createElement: (t) => new Node_(1, t.toUpperCase()), createElementNS: (ns, t) => new Node_(1, t), createTextNode: mkText, activeElement: null, addEventListener() {}, removeEventListener() {} };
function descend(n, fn) { fn(n); n.childNodes.forEach((c) => descend(c, fn)); }
const q = (root, id) => { let r = null; descend(root, (n) => { if (!r && n.attrs && n.attrs['data-testid'] === id) r = n; }); return r; };
const txt = (n) => (n ? n.textContent : '');

// Invented ruby-style markup: {base|reading} -> <ruby>, ___ -> <span class="blank">, rest <span> text.
// Its render() returns arrays that mix strings, <ruby> and <span>, and whose shape changes from prompt to prompt.
function installRubyPlugin(sb) {
  const h = sb.preact.h;
  const parts = (str) => str.split(/(\{[^|}]+\|[^}]+\}|___)/).filter((x) => x !== '');
  sb.DojoExt.registerMarkup('ruby-test', {
    render(str) {
      return parts(str).map((p) => {
        const m = /^\{([^|}]+)\|([^}]+)\}$/.exec(p);
        if (m) return h('ruby', null, m[1], h('rt', null, m[2]));
        return h('span', p === '___' ? { class: 'blank' } : null, p);
      });
    },
    plain: (str) => str.replace(/\{([^|}]+)\|[^}]+\}/g, '$1')
  });
}

function loadSandbox() {
  const win = new Node_(1, 'WINDOW');
  win.document = doc;
  const sb = { console: { warn() {}, log: console.log, error: console.error }, document: doc, window: win, setTimeout, clearTimeout, setInterval, clearInterval, Promise };
  loadBundle(sb, { only: ['vendor/preact.min.js', 'vendor/htm.umd.js', 'ext.js', 'types/registry.js', 'types/card.js', 'types/choice.js', 'types/cloze.js', 'types/gap.js', 'types/match.js', 'types/multi.js', 'types/numeric.js', 'types/order.js', 'ui/app.js'] });
  vm.runInContext(read('../examples/plugins/ja-readings/ja-readings.js'), sb);
  installRubyPlugin(sb);
  return { sb, win };
}

async function mount(items, courseExtra) {
  const { sb, win } = loadSandbox();
  const dojo = await DojoWasm.load(fs.readFileSync(checkWasmFresh()));
  const course = Object.assign({ id: 'c', title: 'C', units: [{ id: 'u' }], markup: 'ja-readings' }, courseExtra);
  const content = { v: 1, course, items, version: 't', lock: items.map((i) => i.id) };
  const d = { v: 1, t: 0, items: {}, stats: { days: {}, newByDay: {} }, settings: {}, exams: {} };
  const store = { doc: d, status: 'ok', update(fn) { fn(d); d.t = NOW; }, flush() {}, noteAnswer() {} };
  const engine = DojoSession.createEngine({ dojo, store, content, now: () => NOW, today: () => TODAY, random: () => 0.5 });
  sb.DojoExt.use(course.markup);
  const en = JSON.parse(read('i18n/en.json'));
  const t = sb.DojoApp._makeT({ en }, 'en');
  const byId = {};
  items.forEach((i) => { byId[i.id] = i; });
  const rootEl = new Node_(1, 'DIV');
  let app = null;
  sb.preact.render(sb.preact.h(sb.DojoApp._App, { ref: (a) => { app = a; }, t, lang: 'en', store, engine, dojo, content, course, byId, now: () => NOW, today: () => TODAY, win }), rootEl);
  const flush = async () => { await new Promise((r) => setTimeout(r, 5)); };
  return { sb, app, rootEl, engine, win, flush, errors: [] };
}
const click = (m, id) => { const b = q(m.rootEl, id); if (b) b.fire('click'); return b; };
function typeInto(m, id, value) {
  const el = q(m.rootEl, id);
  el.value = value;
  el.fire('input', { target: el });
}

const ITEMS = [];
for (let i = 0; i < 6; i++) {
  ITEMS.push({ id: 'g' + i, unit: 'u', type: 'gap', prompt: '{冷|れい}蔵庫 ' + i, answers: ['れいぞうこ'], explanation: '{冷|れい}' });
  ITEMS.push({ id: 'c' + i, unit: 'u', type: 'cloze', prompt: 'Fill', parts: ['すし', ['の'], '{私|わたし}'] });
  ITEMS.push({ id: 'o' + i, unit: 'u', type: 'order', prompt: 'Order', steps: ['one', 'two', 'three'] });
  ITEMS.push({ id: 'k' + i, unit: 'u', type: 'choice', prompt: 'Pick {冷|れい}', options: ['x', 'y'], correct: 0 });
  ITEMS.push({ id: 'm' + i, unit: 'u', type: 'multi', prompt: 'Primes?', options: ['2', '4', '5'], correct: [0, 2] });
  ITEMS.push({ id: 'n' + i, unit: 'u', type: 'numeric', prompt: 'Two?', answer: 2 });
}

async function startDaily(m) {
  m.app.startMode('daily', {});
  await m.flush();
  assert.ok(q(m.rootEl, 'session'), 'session screen mounted');
}
const counter = (m) => txt(q(m.rootEl, 'progress'));
const sessionOf = (m) => m.app.state.session;

// Answer the current item wrongly (typed kana / generic), then optionally override, then Next, all without awaiting renders.
async function answerCurrent(m, wrong) {
  if (q(m.rootEl, 'gap-input')) {
    typeInto(m, 'gap-input', wrong ? 'ばつ' : 'れいぞうこ');
    await m.flush();
    q(m.rootEl, 'gap-form').fire('submit');
  } else if (q(m.rootEl, 'cloze')) {
    typeInto(m, 'cloze-input-0', wrong ? 'ばつ' : 'の');
    await m.flush();
    click(m, 'btn-submit');
  } else {
    const b = q(m.rootEl, 'btn-dont-know');
    if (b) b.fire('click');
  }
}

test('rapid typed-wrong, override, next, double-fire: no exception and progress advances', async () => {
  const m = await mount(ITEMS, { dontKnow: true });
  await startDaily(m);
  const seen = new Set();
  for (let step = 0; step < 40 && q(m.rootEl, 'session'); step++) {
    const before = counter(m);
    await answerCurrent(m, step % 2 === 0);
    await m.flush();
    if (q(m.rootEl, 'btn-override')) {
      const ov = q(m.rootEl, 'btn-override');
      ov.fire('click'); ov.fire('click');
    }
    const nx = q(m.rootEl, 'btn-next');
    if (nx && !nx.attrs.disabled && nx.attrs.disabled !== '') {
      nx.fire('click'); nx.fire('click'); nx.fire('click');
    }
    await m.flush();
    seen.add(counter(m));
    assert.ok(!q(m.rootEl, 'render-error'), 'no render error at step ' + step + ' (' + before + ')');
  }
  assert.ok(seen.size > 5, 'progress advanced: ' + [...seen].join(','));
});

test('double next never skips an unanswered item', async () => {
  const m = await mount(ITEMS, { dontKnow: true });
  await startDaily(m);
  const s = sessionOf(m);
  const first = s.current().item.id;
  await answerCurrent(m, true);
  await m.flush();
  const nx = q(m.rootEl, 'btn-next');
  nx.fire('click'); nx.fire('click');
  await m.flush();
  assert.strictEqual(s.index, 1, 'only one step taken by a double click (first=' + first + ')');
});

// Invented course: mixed ruby / blank / plain prompts of changing shape, fullwidth brackets.
const RUBY_PROMPTS = [
  '{Last|ra}{year|yi}, {Moss|mo}{Field|fi}-san is',
  'Joe was a {Last|ra}{year|yi}, {com|ko}{pa|pa}{ny|ni} （　）.',
  '{Tokyo|toh-kyo} {city|shi}, {Ann|an}-san lives in the {big|dai} house',
  'Mr {Bell|beru} said: （　）.',
  'No, ___ ___',
  '{Today|kyo} is ___',
  'No',
  '{Red|aka}{blue|ao}{green|midori}',
  'Plain sentence without markup',
  '___'
];
function rubyCourseItems() {
  const items = [];
  for (let i = 0; i < 24; i++) {
    items.push({ id: 'r' + i, unit: 'u', type: 'gap', prompt: RUBY_PROMPTS[i % RUBY_PROMPTS.length] + ' ' + i, answers: ['x'] });
  }
  return items;
}
async function collectErrors(fn) {
  const errs = [];
  const onErr = (e) => errs.push(e);
  process.on('uncaughtException', onErr); process.on('unhandledRejection', onErr);
  try { await fn(); await new Promise((r) => setTimeout(r, 10)); } finally { process.off('uncaughtException', onErr); process.off('unhandledRejection', onErr); }
  return errs;
}

test('furigana prompts of changing shape keep the DOM intact (DojoExt.text keys markup arrays)', async () => {
  const { sb } = loadSandbox();
  const h = sb.preact.h;
  sb.DojoExt.use('ruby-test');
  const root = new Node_(1, 'DIV');
  const expect = (pr) => pr.replace(/\{([^|}]+)\|([^}]+)\}/g, '$1$2');
  RUBY_PROMPTS.forEach((p1) => RUBY_PROMPTS.forEach((p2) => RUBY_PROMPTS.forEach((p3) => {
    sb.preact.render(null, root);
    [p1, p2, p3].forEach((pr) => {
      sb.preact.render(h('p', null, sb.DojoExt.text(pr)), root);
      assert.strictEqual(root.textContent, expect(pr), pr);
    });
  })));


});

test('ruby-markup course daily: dont-know then Next through 24 items, no render error, progress advances', async () => {
  const items = rubyCourseItems();
  const errs = await collectErrors(async () => {
    const m = await mount(items, { markup: 'ruby-test', dontKnow: true });
    m.app.startMode('daily', {});
    await m.flush();
    const seen = new Set();
    for (let n = 0; n < 30 && q(m.rootEl, 'session'); n++) {
      seen.add(counter(m));
      const b = q(m.rootEl, 'btn-dont-know');
      if (b) b.fire('click');
      await m.flush();
      const nx = q(m.rootEl, 'btn-next');
      nx.fire('click'); nx.fire('click');
      await m.flush();
      assert.ok(!q(m.rootEl, 'render-error'));
    }
    assert.ok(seen.size >= 10, 'progress advanced: ' + seen.size);
  });
  assert.deepStrictEqual(errs.map((e) => e.message), []);
});

test('typed wrong, override and Next fired twice each: one step, no error', async () => {
  const m = await mount(ITEMS, { dontKnow: true });
  await startDaily(m);
  const s = sessionOf(m);
  typeInto(m, 'gap-input', 'ばつ');
  await m.flush();
  q(m.rootEl, 'gap-form').fire('submit');
  q(m.rootEl, 'gap-form').fire('submit');
  await m.flush();
  const ov = q(m.rootEl, 'btn-override');
  assert.ok(ov);
  ov.fire('click'); ov.fire('click');
  await m.flush();
  assert.ok(!q(m.rootEl, 'session-error'), 'second override click is ignored, not an error');
  assert.ok(/Correct|session\.correct|Right/i.test(txt(q(m.rootEl, 'verdict'))), txt(q(m.rootEl, 'verdict')));
  const nx = q(m.rootEl, 'btn-next');
  nx.fire('click'); nx.fire('click');
  await m.flush();
  assert.strictEqual(s.index, 1);
  assert.strictEqual(counter(m), '2 / 10');
});

test('render error shows a continue button that resumes the session; repeated failure moves past the item', async () => {
  const m = await mount(ITEMS, { dontKnow: true });
  const Types = m.sb.DojoTypes;
  const realGap = Types.get('gap');
  let boom = true;
  Types.register('gap', Object.assign({}, realGap, { Question: function (p) { if (boom && p.item.id === 'g1') throw new Error('boom'); return realGap.Question(p); } }));
  await startDaily(m);
  const s = sessionOf(m);
  const errs = await collectErrors(async () => {
    let guard = 0;
    while (!q(m.rootEl, 'render-error') && guard++ < 40) {
      if (q(m.rootEl, 'btn-dont-know')) q(m.rootEl, 'btn-dont-know').fire('click');
      await m.flush();
      const nx = q(m.rootEl, 'btn-next');
      if (nx) nx.fire('click');
      await m.flush();
    }
  });
  assert.deepStrictEqual(errs, []);
  assert.ok(q(m.rootEl, 'render-error'), 'boundary message shown');
  const stuckAt = s.index;
  click(m, 'btn-continue');
  await m.flush();
  assert.ok(q(m.rootEl, 'render-error'), 'still failing on the same item');
  assert.strictEqual(s.index, stuckAt, 'first continue keeps the item');
  click(m, 'btn-continue');
  await m.flush();
  assert.ok(!q(m.rootEl, 'render-error'), 'second continue moves past it');
  assert.ok(q(m.rootEl, 'session'));
  assert.ok(s.index > stuckAt);
});

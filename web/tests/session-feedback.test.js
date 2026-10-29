'use strict';
// Session feedback after an answer: correct vs wrong verdict, class, and expected line.
// Harness copied from session-rapid.test.js (real App + real Preact on a strict mini DOM).
// Mutation check (not run here, src untouched): in ui/session-feedback.js resultBody swap
// `res.correct ? 'right' : 'wrong'` -> `res.correct ? 'wrong' : 'right'` -> 'typed correct shows right' fails.
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
  constructor(type, name) { this.nodeType = type; this.nodeName = name; this.childNodes = []; this.parentNode = null; this.attrs = {}; this.style = { setProperty(k, v) { this[k] = v; } }; this.listeners = {}; this.onclick = null; this.oninput = null; this.onsubmit = null; this.onkeydown = null; this.onchange = null; }
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
  loadBundle(sb, { only: ['vendor/preact.min.js', 'vendor/htm.umd.js', 'ext/registry.js', 'ext/ruby.js', 'ext/readings.js', 'ext.js', 'types/registry.js', 'types/card.js', 'types/choice.js', 'types/cloze.js', 'types/gap.js', 'types/match.js', 'types/multi.js', 'types/numeric.js', 'types/order.js', 'ui/i18n.js', 'ui/play-button.js', 'ui/common.js', 'ui/detail.js'].concat(['ui/catalog-audio.js']).concat(['ui/catalog.js']).concat(['ui/group-card.js']).concat(['ui/home.js']).concat(['ui/stimulus.js']).concat(['ui/session-feedback.js']).concat(['ui/session-focus.js']).concat(['ui/session-screen.js']).concat(['ui/results.js']).concat(['ui/placement.js']).concat(['ui/settings-speech.js']).concat(['ui/settings-sections.js']).concat(['ui/settings-dialogs.js']).concat(['ui/settings.js']).concat(['ui/app.js']) });
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
function typeInto(m, id, value) {
  const el = q(m.rootEl, id);
  el.value = value;
  el.fire('input', { target: el });
}

const ITEMS = [];
for (let i = 0; i < 4; i++) {
  ITEMS.push({ id: 'g' + i, unit: 'u', type: 'gap', prompt: '{冷|れい}蔵庫 ' + i, answers: ['れいぞうこ'], explanation: '{冷|れい}' });
}

async function startDaily(m) {
  m.app.startMode('daily', {});
  await m.flush();
  assert.ok(q(m.rootEl, 'session'), 'session screen mounted');
}

// Type the answer into the gap input, submit, then let the render settle.
async function answerGap(m, value) {
  assert.ok(q(m.rootEl, 'gap-input'), 'gap input shown');
  typeInto(m, 'gap-input', value);
  await m.flush();
  q(m.rootEl, 'gap-form').fire('submit');
  await m.flush();
}

test('typed correct answer shows right feedback with Correct verdict and no expected line', async () => {
  const m = await mount(ITEMS);
  await startDaily(m);
  await answerGap(m, 'れいぞうこ');
  const fb = q(m.rootEl, 'feedback');
  assert.ok(fb, 'feedback shown after answer');
  assert.ok(fb.attrs.class.split(' ').includes('right'), fb.attrs.class);
  assert.ok(!fb.attrs.class.split(' ').includes('wrong'), fb.attrs.class);
  assert.strictEqual(txt(q(m.rootEl, 'verdict')), 'Correct');
  assert.strictEqual(q(m.rootEl, 'expected'), null, 'no expected line for a correct answer');
});

test('typed wrong answer shows wrong feedback with Wrong verdict and expected line', async () => {
  const m = await mount(ITEMS);
  await startDaily(m);
  await answerGap(m, 'れいぞうく');
  const fb = q(m.rootEl, 'feedback');
  assert.ok(fb, 'feedback shown after answer');
  assert.ok(fb.attrs.class.split(' ').includes('wrong'), fb.attrs.class);
  assert.ok(!fb.attrs.class.split(' ').includes('right'), fb.attrs.class);
  assert.strictEqual(txt(q(m.rootEl, 'verdict')), 'Wrong');
  const exp = q(m.rootEl, 'expected');
  assert.ok(exp, 'expected line shown for a wrong answer');
  assert.ok(txt(exp).includes('れいぞうこ'), txt(exp));
});

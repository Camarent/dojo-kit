'use strict';
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

class Node_ {
  constructor(type, name) { this.nodeType = type; this.nodeName = name; this.childNodes = []; this.parentNode = null; this.attrs = {}; this.style = {}; this.listeners = {}; this.onclick = null; this.oninput = null; this.onsubmit = null; this.onkeydown = null; this.onchange = null; }
  get firstChild() { return this.childNodes[0] || null; }
  get nextSibling() { if (!this.parentNode) return null; const c = this.parentNode.childNodes; return c[c.indexOf(this) + 1] || null; }
  get tagName() { return this.nodeName; }
  get localName() { return this.nodeName.toLowerCase(); }
  _detach(n) { if (n.parentNode) n.parentNode.removeChild(n); }
  appendChild(n) { this._detach(n); n.parentNode = this; this.childNodes.push(n); return n; }
  insertBefore(n, ref) {
    if (ref && ref.parentNode !== this) throw new Error("NotFoundError: Failed to execute 'insertBefore' on 'Node': The node to be removed is not a child of this node.");
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
  focus() { doc.activeElement = this; }
  get ownerDocument() { return doc; }
  getAttribute(k) { return this.attrs[k] === undefined ? null : this.attrs[k]; }
  get textContent() { return this.nodeType === 3 ? this.data : this.childNodes.map((c) => c.textContent).join(''); }
  set textContent(v) { this.childNodes.forEach((c) => { c.parentNode = null; }); this.childNodes = []; if (v) this.appendChild(mkText(v)); }
  fire(type, ev) {
    if (type === 'click' && this.attrs.disabled !== undefined) return;
    (this.listeners[type] || []).slice().forEach((f) => f.call(this, Object.assign({ type, target: this, preventDefault() {}, stopPropagation() {} }, ev)));
  }
}
function mkText(s) { const n = new Node_(3, '#text'); n.data = String(s); return n; }
const doc = { createElement: (t) => new Node_(1, t.toUpperCase()), createElementNS: (ns, t) => new Node_(1, t), createTextNode: mkText, activeElement: null, root: null,
  querySelector(sel) { const m = /data-testid="([^"]+)"/.exec(sel); return m ? q(doc.root, m[1]) : null; },
  addEventListener() {}, removeEventListener() {} };
function descend(n, fn) { fn(n); n.childNodes.forEach((c) => descend(c, fn)); }
const q = (root, id) => { let r = null; descend(root, (n) => { if (!r && n.attrs && n.attrs['data-testid'] === id) r = n; }); return r; };

function loadSandbox() {
  const win = new Node_(1, 'WINDOW');
  win.document = doc;
  const sb = { console: { warn() {}, log() {}, error() {} }, document: doc, window: win, setTimeout, clearTimeout, setInterval, clearInterval, Promise };
  loadBundle(sb, { only: ['vendor/preact.min.js', 'vendor/htm.umd.js', 'ext/registry.js', 'ext.js', 'types/registry.js', 'types/card.js', 'types/choice.js', 'types/cloze.js', 'types/gap.js', 'types/match.js', 'types/multi.js', 'types/numeric.js', 'types/order.js', 'ui/i18n.js', 'ui/common.js', 'ui/detail.js'].concat(['ui/catalog.js']).concat(['ui/home.js']).concat(['ui/session-screen.js']).concat(['ui/results.js']).concat(['ui/placement.js']).concat(['ui/settings-speech.js']).concat(['ui/settings-sections.js']).concat(['ui/settings.js']).concat(['ui/app.js']) });
  return { sb, win };
}

const mounted = [];
test.after(() => mounted.forEach((f) => f()));

async function mount(items, courseExtra, intros) {
  const { sb, win } = loadSandbox();
  const dojo = await DojoWasm.load(fs.readFileSync(checkWasmFresh()));
  const course = Object.assign({ id: 'c', title: 'C', units: [{ id: 'u' }], markup: 'ja-readings' }, courseExtra);
  const content = { v: 1, course, items, version: 't', lock: items.map((i) => i.id) };
  if (intros) content.intros = intros;
  const d = { v: 1, t: 0, items: {}, stats: { days: {}, newByDay: {} }, settings: {}, exams: {} };
  const store = { doc: d, status: 'ok', update(fn) { fn(d); d.t = NOW; }, flush() {}, answers: 0, noteAnswer() { store.answers++; } };
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
  doc.root = rootEl;
  mounted.push(() => sb.preact.render(null, rootEl));
  return { sb, app, rootEl, engine, win, flush, store };
}

function click(m, id) {
  const b = q(m.rootEl, id);
  if (b) b.fire('click');
  return b;
}

async function startSession(m, mode) {
  m.app.startMode(mode || 'daily', {});
  await m.flush();
}

const key = (k, target, extra) => { const e = Object.assign({ key: k, target, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false }, extra); e.preventDefault = () => { e.prevented = true; }; return e; };
const cur = (m) => m.app.state.session.current().item.id;
const press = async (m, ev) => { m.win.fire('keydown', ev); await m.flush(); return ev; };
const answered = async (m) => { click(m, 'btn-dont-know'); await m.flush(); };

const GAP = { id: 'g1', unit: 'u', type: 'gap', prompt: 'Fill gap', answers: ['test'] };
const GAP2 = { id: 'g2', unit: 'u', type: 'gap', prompt: 'Fill gap 2', answers: ['test2'] };
const CLOZE = { id: 'cl1', unit: 'u', type: 'cloze', prompt: 'Fill blanks', parts: ['A', ['x'], 'B', ['y']] };
const ITEMS2 = [GAP, GAP2];

test('arrow keys typed in a text field do not move the session', async () => {
  const m = await mount([GAP]);
  await startSession(m);
  const first = cur(m);
  const input = q(m.rootEl, 'gap-input');
  for (const k of ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown']) {
    const ev = await press(m, key(k, input));
    assert.strictEqual(cur(m), first, k);
    assert.strictEqual(ev.prevented, undefined, k + ' preventDefault not called');
  }
});

test('space typed in a text field does not move the session', async () => {
  const m = await mount([GAP]);
  await startSession(m);
  const first = cur(m);
  const input = q(m.rootEl, 'gap-input');
  const ev = await press(m, key(' ', input));
  assert.strictEqual(cur(m), first);
  assert.strictEqual(ev.prevented, undefined, 'preventDefault not called');
});

test('typed value stays intact after arrow keys in gap input', async () => {
  const m = await mount([GAP]);
  await startSession(m);
  const input = q(m.rootEl, 'gap-input');
  input.fire('input', { target: { value: 'typed' } });
  await m.flush();
  for (const k of ['ArrowRight', 'ArrowLeft']) await press(m, key(k, input));
  assert.strictEqual(input.getAttribute('value'), 'typed');
});

test('Enter in gap input submits once', async () => {
  const m = await mount(ITEMS2);
  await startSession(m);
  const first = cur(m);
  const input = q(m.rootEl, 'gap-input');
  input.fire('input', { target: { value: 'test' } });
  await m.flush();
  const form = q(m.rootEl, 'gap-form');
  assert.strictEqual(m.store.answers, 0);
  await press(m, key('Enter', input));
  assert.strictEqual(m.store.answers, 0, 'keydown alone does not submit');
  form.fire('submit', { preventDefault() {} });
  await m.flush();
  assert.strictEqual(m.store.answers, 1, 'one Enter records exactly one answer');
  form.fire('submit', { preventDefault() {} });
  await m.flush();
  assert.strictEqual(m.store.answers, 1, 'second submit on result screen records no extra answer');
  assert.strictEqual(cur(m), first, 'still on the answered item');
});

test('ArrowRight after result with INPUT focus does not advance', async () => {
  const m = await mount([GAP]);
  await startSession(m);
  const input = q(m.rootEl, 'gap-input');
  input.fire('input', { target: { value: 'test' } });
  await m.flush();
  const form = q(m.rootEl, 'gap-form');
  form.fire('submit', { preventDefault() {} });
  await m.flush();
  const first = cur(m);
  const ev = await press(m, key('ArrowRight', input));
  assert.strictEqual(cur(m), first);
  assert.strictEqual(ev.prevented, undefined, 'preventDefault not called');
});

test('Enter after result with INPUT focus advances', async () => {
  const m = await mount([GAP, GAP2]);
  await startSession(m);
  const input = q(m.rootEl, 'gap-input');
  input.fire('input', { target: { value: 'test' } });
  await m.flush();
  const form = q(m.rootEl, 'gap-form');
  form.fire('submit', { preventDefault() {} });
  await m.flush();
  const first = cur(m);
  await press(m, key('Enter', input));
  assert.notStrictEqual(cur(m), first);
});

test('cloze arrow keys ignored in first input', async () => {
  const m = await mount([CLOZE]);
  await startSession(m);
  const first = cur(m);
  const input0 = q(m.rootEl, 'cloze-input-0');
  for (const k of ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown']) {
    const ev = await press(m, key(k, input0));
    assert.strictEqual(cur(m), first, k);
    assert.strictEqual(ev.prevented, undefined, k + ' preventDefault not called');
  }
});

test('cloze arrow keys ignored in second input', async () => {
  const m = await mount([CLOZE]);
  await startSession(m);
  const first = cur(m);
  const input1 = q(m.rootEl, 'cloze-input-1');
  for (const k of ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown']) {
    const ev = await press(m, key(k, input1));
    assert.strictEqual(cur(m), first, k);
    assert.strictEqual(ev.prevented, undefined, k + ' preventDefault not called');
  }
});

test('TEXTAREA target ignores arrow keys and Enter after result; BODY target advances', async () => {
  const m = await mount(ITEMS2, { dontKnow: true });
  await startSession(m);
  const first = cur(m);
  await answered(m);
  const firstId = cur(m);
  const textarea = new Node_(1, 'TEXTAREA');
  for (const k of ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Enter']) {
    await press(m, key(k, textarea));
    assert.strictEqual(cur(m), firstId, k + ' from TEXTAREA');
  }
  await press(m, key('ArrowRight', m.win));
  assert.notStrictEqual(cur(m), firstId, 'ArrowRight from BODY advances');
});

test('SELECT target ignores arrow keys and Enter after result; BODY target advances', async () => {
  const m = await mount(ITEMS2, { dontKnow: true });
  await startSession(m);
  const first = cur(m);
  await answered(m);
  const firstId = cur(m);
  const select = new Node_(1, 'SELECT');
  for (const k of ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Enter']) {
    await press(m, key(k, select));
    assert.strictEqual(cur(m), firstId, k + ' from SELECT');
  }
  await press(m, key('ArrowRight', m.win));
  assert.notStrictEqual(cur(m), firstId, 'ArrowRight from BODY advances');
});

test('BUTTON target ignores ArrowRight and Enter after result; BODY target advances', async () => {
  const m = await mount(ITEMS2, { dontKnow: true });
  await startSession(m);
  const first = cur(m);
  await answered(m);
  const firstId = cur(m);
  const btn = new Node_(1, 'BUTTON');
  for (const k of ['ArrowRight', 'Enter']) {
    await press(m, key(k, btn));
    assert.strictEqual(cur(m), firstId, k + ' from BUTTON');
  }
  await press(m, key('ArrowRight', m.win));
  assert.notStrictEqual(cur(m), firstId, 'ArrowRight from BODY advances');
});

test('A target ignores ArrowRight and Enter after result; BODY target advances', async () => {
  const m = await mount(ITEMS2, { dontKnow: true });
  await startSession(m);
  const first = cur(m);
  await answered(m);
  const firstId = cur(m);
  const a = new Node_(1, 'A');
  for (const k of ['ArrowRight', 'Enter']) {
    await press(m, key(k, a));
    assert.strictEqual(cur(m), firstId, k + ' from A');
  }
  await press(m, key('ArrowRight', m.win));
  assert.notStrictEqual(cur(m), firstId, 'ArrowRight from BODY advances');
});

test('modifier keys block advance after result; plain ArrowRight from BODY advances', async () => {
  const m = await mount(ITEMS2, { dontKnow: true });
  await startSession(m);
  const first = cur(m);
  await answered(m);
  const firstId = cur(m);
  for (const mod of ['ctrlKey', 'metaKey', 'altKey', 'shiftKey']) {
    const ev = key('ArrowRight', m.win, { [mod]: true });
    await press(m, ev);
    assert.strictEqual(cur(m), firstId, mod + ' + ArrowRight does not advance');
  }
  await press(m, key('ArrowRight', m.win));
  assert.notStrictEqual(cur(m), firstId, 'plain ArrowRight from BODY advances');
});

test('modifier keys do not close intro card; plain ArrowRight from BODY closes it', async () => {
  const intro = [GAP, GAP2].map((i) => Object.assign({}, i, { entity: 'E1', explanation: 'x' }));
  const intros = [{ id: 'E1', title: 'Intro', text: 'Body' }];
  const m = await mount(intro, { introNew: true }, intros);
  await startSession(m);
  assert.ok(q(m.rootEl, 'intro-card'), 'intro shown');
  for (const mod of ['ctrlKey', 'metaKey', 'altKey', 'shiftKey']) {
    await press(m, key('ArrowRight', m.win, { [mod]: true }));
    assert.ok(q(m.rootEl, 'intro-card'), mod + ' + ArrowRight does not close intro');
  }
  await press(m, key('ArrowRight', m.win));
  assert.strictEqual(q(m.rootEl, 'intro-card'), null, 'plain ArrowRight from BODY closes intro');
  assert.strictEqual(cur(m), 'g1');
});

test('modifier keys do not close intro card from INPUT; plain ArrowRight from BODY closes it', async () => {
  const intro = [GAP, GAP2].map((i) => Object.assign({}, i, { entity: 'E1', explanation: 'x' }));
  const intros = [{ id: 'E1', title: 'Intro', text: 'Body' }];
  const m = await mount(intro, { introNew: true }, intros);
  await startSession(m);
  assert.ok(q(m.rootEl, 'intro-card'), 'intro shown');
  const input = new Node_(1, 'INPUT');
  for (const mod of ['ctrlKey', 'metaKey', 'altKey', 'shiftKey']) {
    await press(m, key('ArrowRight', input, { [mod]: true }));
    assert.ok(q(m.rootEl, 'intro-card'), mod + ' + ArrowRight from INPUT does not close intro');
  }
  await press(m, key('ArrowRight', m.win));
  assert.strictEqual(q(m.rootEl, 'intro-card'), null, 'plain ArrowRight from BODY closes intro');
  assert.strictEqual(cur(m), 'g1');
});

test('Space with INPUT focus after result does not advance; BODY target advances', async () => {
  const m = await mount(ITEMS2, { dontKnow: true });
  await startSession(m);
  const input = q(m.rootEl, 'gap-input');
  input.fire('input', { target: { value: 'test' } });
  await m.flush();
  const form = q(m.rootEl, 'gap-form');
  form.fire('submit', { preventDefault() {} });
  await m.flush();
  const firstId = cur(m);
  const ev = await press(m, key(' ', input));
  assert.strictEqual(cur(m), firstId, 'Space from INPUT after result does not advance');
  assert.strictEqual(ev.prevented, undefined, 'preventDefault not called');
  await press(m, key('ArrowRight', m.win));
  assert.notStrictEqual(cur(m), firstId, 'ArrowRight from BODY advances');
});

test('intro card ArrowRight from body closes it and first question is current', async () => {
  const intro = [GAP].map((i) => Object.assign({}, i, { entity: 'E1', explanation: 'x' }));
  const intros = [{ id: 'E1', title: 'Intro', text: 'Body' }];
  const m = await mount(intro, { introNew: true }, intros);
  await startSession(m);
  assert.ok(q(m.rootEl, 'intro-card'), 'intro shown');
  await press(m, key('ArrowRight', m.win));
  assert.strictEqual(q(m.rootEl, 'intro-card'), null);
  assert.strictEqual(cur(m), 'g1');
});

test('intro card ArrowRight from INPUT does not close it', async () => {
  const intro = [GAP].map((i) => Object.assign({}, i, { entity: 'E1', explanation: 'x' }));
  const intros = [{ id: 'E1', title: 'Intro', text: 'Body' }];
  const m = await mount(intro, { introNew: true }, intros);
  await startSession(m);
  assert.ok(q(m.rootEl, 'intro-card'), 'intro shown');
  const input = new Node_(1, 'INPUT');
  await press(m, key('ArrowRight', input));
  assert.ok(q(m.rootEl, 'intro-card'), 'intro still shown');
});

test('intro card ArrowRight from BUTTON does not close it', async () => {
  const intro = [GAP].map((i) => Object.assign({}, i, { entity: 'E1', explanation: 'x' }));
  const intros = [{ id: 'E1', title: 'Intro', text: 'Body' }];
  const m = await mount(intro, { introNew: true }, intros);
  await startSession(m);
  assert.ok(q(m.rootEl, 'intro-card'), 'intro shown');
  const btn = new Node_(1, 'BUTTON');
  await press(m, key('ArrowRight', btn));
  assert.ok(q(m.rootEl, 'intro-card'), 'intro still shown');
});

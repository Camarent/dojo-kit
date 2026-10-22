'use strict';
// Test arrow key navigation in sessions
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const DojoWasm = require('../dojo-wasm.js');
const DojoSession = require('../session.js');
const { checkWasmFresh } = require('./loader.js');

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
    if (type === 'click' && this.attrs.disabled !== undefined) return; (this.listeners[type] || []).slice().forEach((f) => f.call(this, Object.assign({ type, target: this, preventDefault() {}, stopPropagation() {} }, ev))); }
}
function mkText(s) { const n = new Node_(3, '#text'); n.data = String(s); return n; }
const doc = { createElement: (t) => new Node_(1, t.toUpperCase()), createElementNS: (ns, t) => new Node_(1, t), createTextNode: mkText, activeElement: null, root: null, querySelector(sel) { const m = /data-testid="([^"]+)"/.exec(sel); return m ? q(doc.root, m[1]) : null; }, addEventListener() {}, removeEventListener() {} };
function descend(n, fn) { fn(n); n.childNodes.forEach((c) => descend(c, fn)); }
const q = (root, id) => { let r = null; descend(root, (n) => { if (!r && n.attrs && n.attrs['data-testid'] === id) r = n; }); return r; };

function loadSandbox() {
  const win = new Node_(1, 'WINDOW');
  win.document = doc;
  const sb = { console: { warn() {}, log() {}, error() {} }, document: doc, window: win, setTimeout, clearTimeout, setInterval, clearInterval, Promise };
  sb.self = sb;
  vm.createContext(sb);
  ['vendor/preact.min.js', 'vendor/htm.umd.js', 'ext.js'].forEach((f) => vm.runInContext(read(f), sb, { filename: f }));
  ['types/registry.js', 'types/card.js', 'types/choice.js', 'types/cloze.js', 'types/gap.js', 'types/match.js', 'types/multi.js', 'types/numeric.js', 'types/order.js', 'ui/app.js']
    .forEach((f) => vm.runInContext(read(f), sb, { filename: f }));
  return { sb, win };
}

const ITEMS = [
  { id: 'c1', unit: 'u', type: 'choice', prompt: 'Pick one', options: ['Option A', 'Option B', 'Option C'], answer: 0 },
  { id: 'c2', unit: 'u', type: 'choice', prompt: 'Pick two', options: ['Option X', 'Option Y', 'Option Z'], answer: 1 },
  { id: 'g1', unit: 'u', type: 'gap', prompt: 'Fill', answers: ['test'] }
];

const mounted = [];
test.after(() => mounted.forEach((f) => f()));

async function mount(items, courseExtra, intros) {
  const { sb, win } = loadSandbox();
  const dojo = await DojoWasm.load(fs.readFileSync(checkWasmFresh()));
  const course = Object.assign({ id: 'c', title: 'C', units: [{ id: 'u' }], markup: 'ja-readings' }, courseExtra);
  const content = { v: 1, course, items, version: 't', lock: items.map((i) => i.id) };
  if (intros) content.intros = intros;
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
  doc.root = rootEl;
  mounted.push(() => sb.preact.render(null, rootEl));
  return { sb, app, rootEl, engine, win, flush };
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

const TAGGED = ITEMS.slice(0, 2).map((i) => Object.assign({}, i, { tags: ['a'] }));
const EXAM = { id: 'e1', passMark: 0.5, minutes: 30, sections: [{ title: 'A', count: 2, tags: ['a'] }] };
const CHOICES = ITEMS.slice(0, 2);
const key = (k, target, extra) => { const e = Object.assign({ key: k, target, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false }, extra); e.preventDefault = () => { e.prevented = true; }; return e; };
const cur = (m) => m.app.state.session.current().item.id;
const press = async (m, ev) => { m.win.fire('keydown', ev); await m.flush(); return ev; };
const answered = async (m) => { click(m, 'btn-dont-know'); await m.flush(); };

test('ArrowRight with a result advances; Enter too', async () => {
  for (const k of ['ArrowRight', 'Enter']) {
    const m = await mount(ITEMS, { dontKnow: true });
    await startSession(m);
    const first = cur(m);
    await answered(m);
    await press(m, key(k, m.win));
    assert.notStrictEqual(cur(m), first, k);
  }
});

test('ArrowRight / ArrowLeft / ArrowUp without a result do nothing', async () => {
  const m = await mount(ITEMS);
  await startSession(m);
  const first = cur(m);
  for (const k of ['ArrowRight', 'ArrowLeft', 'ArrowUp']) await press(m, key(k, m.win));
  assert.strictEqual(cur(m), first);
});

test('ArrowRight after a result on nextBtn advances; on other buttons does not', async () => {
  const m = await mount(ITEMS, { dontKnow: true });
  await startSession(m);
  await answered(m);
  const nextBtn = q(m.rootEl, 'btn-next');
  assert.ok(nextBtn, 'nextBtn exists');
  const first = cur(m);
  await press(m, key('ArrowRight', nextBtn));
  assert.notStrictEqual(cur(m), first, 'ArrowRight on nextBtn advances');
  const m2 = await mount([
    { id: 'g1', unit: 'u', type: 'gap', prompt: 'Fill', answers: ['test'] },
    { id: 'g2', unit: 'u', type: 'gap', prompt: 'Fill2', answers: ['test2'] }
  ]);
  await startSession(m2);
  const inp = q(m2.rootEl, 'gap-input');
  inp.value = 'wrong';
  inp.fire('input', { target: inp });
  await m2.flush();
  q(m2.rootEl, 'gap-form').fire('submit');
  await m2.flush();
  const overrideBtn = q(m2.rootEl, 'btn-override');
  const first2 = cur(m2);
  assert.ok(overrideBtn, 'override button exists');
  await press(m2, key('ArrowRight', overrideBtn));
  assert.strictEqual(cur(m2), first2, 'ArrowRight on override button does not advance');
});

test('ArrowRight after a result: no advance from INPUT/TEXTAREA/SELECT/contentEditable', async () => {
  for (const tag of ['INPUT', 'TEXTAREA', 'SELECT', 'DIV']) {
    const m = await mount(ITEMS, { dontKnow: true });
    await startSession(m);
    const first = cur(m);
    await answered(m);
    const target = new Node_(1, tag);
    if (tag === 'DIV') target.isContentEditable = true;
    await press(m, key('ArrowRight', target));
    assert.strictEqual(cur(m), first, tag);
  }
});

test('Enter after a result: not from BUTTON/TEXTAREA/contentEditable, but from INPUT', async () => {
  for (const [tag, moves] of [['BUTTON', false], ['TEXTAREA', false], ['DIV', false], ['INPUT', true]]) {
    const m = await mount(ITEMS, { dontKnow: true });
    await startSession(m);
    const first = cur(m);
    await answered(m);
    const target = new Node_(1, tag);
    if (tag === 'DIV') target.isContentEditable = true;
    await press(m, key('Enter', target));
    assert.strictEqual(cur(m) !== first, moves, tag);
  }
});

test('modifiers block ArrowRight after a result', async () => {
  for (const mod of ['shiftKey', 'ctrlKey', 'metaKey', 'altKey']) {
    const m = await mount(ITEMS, { dontKnow: true });
    await startSession(m);
    const first = cur(m);
    await answered(m);
    await press(m, key('ArrowRight', m.win, { [mod]: true }));
    assert.strictEqual(cur(m), first, mod);
  }
});

test('exam mode without a result: arrows and Enter do nothing', async () => {
  const m = await mount(TAGGED, { exams: [EXAM] });
  m.app.startMode('exam', { examId: 'e1' }, true);
  await m.flush();
  assert.ok(m.app.state.session && m.app.state.session.mode === 'exam', 'exam session started');
  const first = cur(m);
  for (const k of ['ArrowRight', 'ArrowDown', 'Enter']) await press(m, key(k, q(m.rootEl, 'option-0') || m.win));
  assert.strictEqual(cur(m), first);
  assert.strictEqual(q(m.rootEl, 'option-0').attrs['aria-pressed'], 'false');
});

test('intro card: Enter and ArrowRight dismiss it, but not from INPUT/BUTTON/modifier', async () => {
  const intro = ITEMS.slice(0, 2).map((i) => Object.assign({}, i, { entity: 'E1', explanation: 'x' }));
  const intros = [{ id: 'E1', title: 'Intro', text: 'Body' }];
  const cases = [['ArrowRight', 'DIV', {}, true], ['Enter', 'DIV', {}, true], ['ArrowRight', 'INPUT', {}, false], ['ArrowRight', 'BUTTON', {}, false], ['ArrowRight', 'DIV', { shiftKey: true }, false], ['ArrowDown', 'DIV', {}, false]];
  for (const [k, tag, extra, dismiss] of cases) {
    const m = await mount(intro, { introNew: true }, intros);
    await startSession(m);
    assert.ok(q(m.rootEl, 'intro-card'), 'intro shown');
    await press(m, key(k, new Node_(1, tag), extra));
    assert.strictEqual(!q(m.rootEl, 'intro-card'), dismiss, k + tag);
  }
});

test('ArrowDown / ArrowUp move focus among options (wrapping); Enter and Space pick the focused one', async () => {
  const m = await mount(CHOICES);
  await startSession(m);
  const id = cur(m);
  const opts = ['option-0', 'option-1', 'option-2'].map((i) => q(m.rootEl, i));
  assert.ok(opts.every(Boolean));
  const ev = await press(m, key('ArrowDown', m.win));
  assert.ok(ev.prevented);
  assert.strictEqual(doc.activeElement, opts[0]);
  await press(m, key('ArrowDown', opts[0]));
  assert.strictEqual(doc.activeElement, opts[1]);
  await press(m, key('ArrowUp', opts[1]));
  await press(m, key('ArrowUp', opts[0]));
  assert.strictEqual(doc.activeElement, opts[2], 'wraps to last');
  await press(m, key('ArrowDown', opts[2]));
  assert.strictEqual(doc.activeElement, opts[0], 'wraps to first');
  await press(m, key('ArrowDown', opts[0]));
  const pick = await press(m, key(' ', opts[1]));
  assert.ok(pick.prevented);
  assert.strictEqual(m.app.state.session.current().item.id, id);
  assert.ok(q(m.rootEl, 'btn-next') && !q(m.rootEl, 'btn-next').attrs.disabled, 'answered');
});

test('Enter on an option button picks it', async () => {
  const m = await mount(CHOICES);
  await startSession(m);
  await press(m, key('Enter', q(m.rootEl, 'option-1')));
  assert.ok(!q(m.rootEl, 'btn-next').attrs.disabled);
});

test('choice onKey guards: INPUT/TEXTAREA/SELECT/contentEditable/modifiers/result ignore arrows and Enter', async () => {
  const { sb } = loadSandbox();
  const def = sb.DojoTypes.get('choice');
  const btn = new Node_(1, 'BUTTON'); btn.attrs['data-index'] = '1';
  const view = { options: [{ index: 0 }, { index: 1 }, { index: 2 }] };
  const hit = (ev, extra) => def.onKey(ev, Object.assign({ view, result: null, exam: false }, extra));
  assert.deepStrictEqual(JSON.parse(JSON.stringify(hit(key('Enter', btn)))), { input: { index: 1 }, picked: 1 });
  for (const tag of ['INPUT', 'TEXTAREA', 'SELECT']) {
    const t = new Node_(1, tag); t.attrs['data-index'] = '1';
    assert.strictEqual(hit(key('Enter', t)), null, tag);
    assert.strictEqual(hit(key('2', t)), null, tag);
  }
  const ce = new Node_(1, 'DIV'); ce.attrs['data-index'] = '1'; ce.isContentEditable = true;
  assert.strictEqual(hit(key('Enter', ce)), null);
  for (const mod of ['shiftKey', 'ctrlKey', 'metaKey', 'altKey']) assert.strictEqual(hit(key('2', btn, { [mod]: true })), null, mod);
  assert.strictEqual(hit(key('Enter', btn), { result: {} }), null);
  assert.strictEqual(hit(key('Enter', btn), { exam: true }), null);
  assert.strictEqual(hit(key('ArrowLeft', btn)), null);
  doc.root = new Node_(1, 'DIV');
  const o0 = new Node_(1, 'BUTTON'); o0.attrs['data-testid'] = 'option-0'; doc.root.appendChild(o0);
  for (const i of [1, 2]) { const o = new Node_(1, 'BUTTON'); o.attrs['data-testid'] = 'option-' + i; doc.root.appendChild(o); }
  doc.activeElement = null;
  const down = key('ArrowDown', btn);
  hit(down, { exam: true });
  assert.ok(!down.prevented && doc.activeElement === null, 'exam: arrows do not move focus');
  hit(key('ArrowDown', new Node_(1, 'DIV')));
  assert.strictEqual(doc.activeElement, o0);
});

test('DojoTypes.keyBlocked returns true for modifiers and contentEditable; INPUT/TEXTAREA/SELECT with allowInput false', async () => {
  const { sb } = loadSandbox();
  const blocked = sb.DojoTypes.keyBlocked;
  const baseEv = { key: 'ArrowRight', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, target: {} };
  assert.strictEqual(blocked(baseEv), false, 'no modifiers, no target');
  for (const mod of ['ctrlKey', 'metaKey', 'altKey', 'shiftKey']) {
    const ev = Object.assign({}, baseEv, { [mod]: true });
    assert.strictEqual(blocked(ev), true, mod);
  }
  const ce = { nodeType: 1, tagName: 'DIV', isContentEditable: true };
  assert.strictEqual(blocked(Object.assign({}, baseEv, { target: ce })), true, 'contentEditable');
  for (const tag of ['INPUT', 'TEXTAREA', 'SELECT']) {
    const t = { nodeType: 1, tagName: tag };
    assert.strictEqual(blocked(Object.assign({}, baseEv, { target: t })), true, tag);
    assert.strictEqual(blocked(Object.assign({}, baseEv, { target: t }), { allowInput: true }), false, tag + ' with allowInput');
  }
});

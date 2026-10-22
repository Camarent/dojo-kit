'use strict';
// Shared test fixtures for web/tests
// Do not edit production code; this file contains only test helpers.

const fs = require('node:fs');
const path = require('node:path');
const DojoWasm = require('../dojo-wasm.js');
const DojoSession = require('../session.js');
const { checkWasmFresh } = require('./loader.js');

// ============================================================================
// Constants
// ============================================================================

const ROOT = path.join(__dirname, '..', '..');
const DAY = 86400000;
const NOW = 1760000000000;
const TODAY = '2025-10-09';

// ============================================================================
// Content builders
// ============================================================================

/**
 * Creates simple gap-item content for testing.
 * @param {Array} units - Array of unit objects with {id, title}
 * @returns {object} Content object with items and course
 */
function simpleContent(units) {
  const items = [];
  units.forEach((u, uidx) => {
    for (let i = 1; i <= 3; i++) {
      items.push({
        id: u.id + '-' + i,
        unit: u.id,
        type: 'gap',
        prompt: 'Q ' + u.id + ' ' + i,
        answers: ['a' + u.id + i],
        explanation: 'e'
      });
    }
  });
  return { v: 1, course: { units: units }, items: items, version: 't', lock: items.map(i => i.id) };
}

/**
 * Creates gap-item content for testing.
 * @param {Array} units - Array of unit objects with {id, title}
 * @returns {object} Content object with items and course
 */
function mkContent(units) {
  const items = [];
  units.forEach((u) => {
    for (let i = 1; i <= 3; i++) {
      items.push({
        id: u.id + '-' + i,
        unit: u.id,
        type: 'gap',
        prompt: 'Q ' + u.id + ' ' + i,
        answers: ['a' + u.id + i],
        explanation: 'e'
      });
    }
  });
  return {
    v: 1, version: 't', lock: items.map((i) => i.id), items,
    course: { id: 'c', title: 'C', units: units }
  };
}

/**
 * Loads demo course content from examples/demo.
 * @returns {object} Content object with items and course
 */
function loadContent() {
  const dir = path.join(ROOT, 'examples', 'demo');
  const course = JSON.parse(fs.readFileSync(path.join(dir, 'course.json'), 'utf8'));
  const items = [];
  course.units.forEach((u) => {
    const text = fs.readFileSync(path.join(dir, 'content', u.id + '.jsonl'), 'utf8');
    text.split('\n').filter(Boolean).forEach((line) => items.push(JSON.parse(line)));
  });
  return { v: 1, course, items, version: 'test', lock: items.map((i) => i.id) };
}

/**
 * Loads i18n dictionaries.
 * @returns {object} Object with en and ru translations
 */
function mkI18n() {
  const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
  const en = JSON.parse(read('i18n/en.json'));
  const ru = JSON.parse(read('i18n/ru.json'));
  return { en: en, ru: ru };
}

// ============================================================================
// WASM / Dojo setup
// ============================================================================

let dojoPromise;

/**
 * Gets or loads the Dojo WASM instance.
 * @returns {Promise} Resolves to the Dojo WASM instance
 */
async function getDojo() {
  if (!dojoPromise) {
    checkWasmFresh();
    dojoPromise = DojoWasm.load(fs.readFileSync(checkWasmFresh()));
  }
  return dojoPromise;
}

// ============================================================================
// Fake DOM / Node implementation
// ============================================================================

/**
 * Fake DOM Node class for testing UI interactions.
 */
class Node_ {
  constructor(type, name) {
    this.nodeType = type;
    this.nodeName = name;
    this.childNodes = [];
    this.parentNode = null;
    this.attrs = {};
    this.style = {};
    this.listeners = {};
    this.onclick = null;
    this.oninput = null;
    this.onsubmit = null;
    this.onkeydown = null;
    this.onchange = null;
  }
  get firstChild() { return this.childNodes[0] || null; }
  get nextSibling() {
    if (!this.parentNode) return null;
    const c = this.parentNode.childNodes;
    return c[c.indexOf(this) + 1] || null;
  }
  get tagName() { return this.nodeName; }
  get localName() { return this.nodeName.toLowerCase(); }
  _detach(n) { if (n.parentNode) n.parentNode.removeChild(n); }
  appendChild(n) {
    this._detach(n);
    n.parentNode = this;
    this.childNodes.push(n);
    return n;
  }
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
    this.childNodes.splice(this.childNodes.indexOf(n), 1);
    n.parentNode = null;
    return n;
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
  set textContent(v) {
    this.childNodes.forEach((c) => { c.parentNode = null; });
    this.childNodes = [];
    if (v) this.appendChild(mkText(v));
  }
  fire(type, ev) {
    if (type === 'click' && this.attrs.disabled !== undefined) return;
    (this.listeners[type] || []).slice().forEach((f) => f.call(this, Object.assign({ type, target: this, preventDefault() {}, stopPropagation() {} }, ev)));
  }
}

function mkText(s) {
  const n = new Node_(3, '#text');
  n.data = String(s);
  return n;
}

function descend(n, fn) { fn(n); n.childNodes.forEach((c) => descend(c, fn)); }
const q = (root, id) => { let r = null; descend(root, (n) => { if (!r && n.attrs && n.attrs['data-testid'] === id) r = n; }); return r; };

const doc = { createElement: (t) => new Node_(1, t.toUpperCase()), createElementNS: (ns, t) => new Node_(1, t), createTextNode: mkText, activeElement: null, root: null, querySelector(sel) { const m = /data-testid="([^"]+)"/.exec(sel); return m ? q(doc.root, m[1]) : null; }, addEventListener() {}, removeEventListener() {} };

// ============================================================================
// Engine setup helpers
// ============================================================================

/**
 * Creates a test engine with fake store (with noteAnswer counter).
 * @param {object} content - Course content
 * @param {object} opts - Optional overrides: {doc, now, random, content}
 * @returns {Promise<object>} Test context with engine, doc, store, clock, content
 */
async function setup(opts) {
  const o = opts || {};
  const doc = o.doc || { v: 1, t: 0, items: {}, stats: { days: {}, newByDay: {} }, settings: {}, exams: {} };
  const clock = { t: o.now || NOW };
  let noted = 0;
  const store = {
    doc,
    update(fn) { fn(doc); doc.t = clock.t; },
    noteAnswer() { noted++; }
  };
  const content = o.content || loadContent();
  const dojo = o.dojo || await getDojo();
  let seq = 0;
  const engine = DojoSession.createEngine({
    dojo, store, content,
    now: () => clock.t,
    today: () => TODAY,
    random: o.random || (() => ((seq++ * 0.37) % 1)),
  });
  return { engine, doc, store, clock, content, notes: () => noted };
}

/**
 * Creates a test engine with fake store (without noteAnswer counter).
 * @param {object} content - Course content
 * @param {object} settings - Initial settings
 * @returns {Promise<object>} Test context with engine, doc, store, clock, content, dojo
 */
async function setup2(content, settings) {
  const doc = { v: 1, t: 0, items: {}, stats: { days: {}, newByDay: {} }, settings: settings || {}, exams: {} };
  const clock = { t: NOW };
  const store = {
    doc,
    update(fn) { fn(doc); doc.t = clock.t; },
    noteAnswer() {},
    exportText() { return JSON.stringify(doc); },
    importText() { return { ok: false }; },
    reset() {},
    flush() {},
    attachLifecycle() {},
    onStatus() {},
    onRemoteChange() {}
  };
  const dojo = await getDojo();
  const engine = DojoSession.createEngine({
    dojo, store, content,
    now: () => clock.t,
    today: () => TODAY,
    random: () => 0.5
  });
  return { engine, doc, clock, store, content, dojo };
}

// ============================================================================
// Session helpers
// ============================================================================

/**
 * Extracts item IDs from a session.
 * @param {object} session - Session object
 * @returns {Array<string>} Array of item IDs
 */
function ids(session) {
  const out = [];
  for (let c = session.current(); c; c = session.next()) out.push(c.item.id);
  return out;
}

// ============================================================================
// Bundle loading
// ============================================================================

/**
 * Loads the app bundle into a sandbox.
 * @param {object} sb - Sandbox object
 * @param {object} opts - Options for loadBundle
 * @returns {object} The sandbox with loaded bundle
 */
function loadApp(sb, opts) {
  const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
  const console_ = { warn() {}, log: console.log };
  const sandbox = Object.assign({ console: console_ }, sb || {});
  const { loadBundle } = require('./load-bundle.js');
  loadBundle(sandbox, opts || {});
  return sandbox;
}

/**
 * Loads sandbox for UI tests.
 * @returns {object} Sandbox with loaded bundle
 */
function loadSandbox(opts) {
  const win = new Node_(1, 'WINDOW');
  win.document = doc;
  const sb = { console: { warn() {}, log() {}, error() {} }, document: doc, window: win, setTimeout, clearTimeout, setInterval, clearInterval, Promise };
  const { loadBundle } = require('./load-bundle.js');
  loadBundle(sb, opts || { only: ['vendor/preact.min.js', 'vendor/htm.umd.js', 'ext/ruby.js', 'ext/readings.js', 'ext.js', 'types/registry.js', 'types/card.js', 'types/choice.js', 'types/cloze.js', 'types/gap.js', 'types/match.js', 'types/multi.js', 'types/numeric.js', 'types/order.js', 'ui/common.js', 'ui/detail.js'].concat(['ui/stimulus.js']).concat(['ui/session-feedback.js']).concat(['ui/session-screen.js']).concat(['ui/results.js']).concat(['ui/placement.js']).concat(['ui/settings-speech.js']).concat(['ui/settings-sections.js']).concat(['ui/settings.js']).concat(['ui/app.js']) });
  return { sb, win };
}

// ============================================================================
// Test utilities
// ============================================================================

/**
 * Finds node by testid recursively.
 * @param {object} n - Node or tree to search
 * @param {string} id - Test ID to find
 * @returns {object|null} Node with matching testid or null
 */
function find(n, id) {
  if (Array.isArray(n)) {
    for (const c of n) {
      const r = find(c, id);
      if (r) return r;
    }
    return null;
  }
  if (!n || typeof n !== 'object' || !n.props) return null;
  if (n.props['data-testid'] === id || n.props.testid === id) return n;
  return find(n.props.children, id);
}

/**
 * Creates instance with props and setState.
 * @param {Function} Cls - Component class
 * @param {object} props - Props to pass
 * @returns {object} Instance with props and setState
 */
function inst(Cls, props) {
  const i = new Cls(props);
  i.props = props;
  i.setState = function (patch) {
    i.state = Object.assign({}, this.state, patch);
  };
  return i;
}

/**
 * Renders a settings screen for testing.
 * @param {object} sb - Sandbox with loaded app bundle
 * @param {object} engine - Dojo engine
 * @param {object} content - Course content
 * @param {object} doc - Document state
 * @param {object} win - Window object (optional)
 * @param {Function} t - Translation function (optional)
 * @param {Function} onDataChanged - Callback for data changes (optional)
 * @returns {object} Settings screen instance
 */
function renderSettings(sb, engine, content, doc, win, t, onDataChanged) {
  win = win || { addEventListener() {}, removeEventListener() {}, navigator: {}, document: { createElement: () => ({}) } };
  onDataChanged = onDataChanged || function() {};
  t = t || (function(k) { return k; });
  const store = {
    doc: doc,
    exportText: function() { return JSON.stringify(doc); },
    update: function(fn) { fn(doc); },
    noteAnswer() {},
    importText() { return { ok: false }; },
    reset() {},
    flush() {},
    attachLifecycle() {},
    onStatus() {},
    onRemoteChange() {}
  };
  return inst(sb.DojoApp._SettingsScreen, {
    t: t,
    course: content.course,
    content: content,
    status: 'local',
    store: store,
    engine: engine,
    win: win,
    now: () => NOW,
    onDataChanged: onDataChanged,
    onPlacement: function() {}
  });
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  // Constants
  ROOT,
  DAY,
  NOW,
  TODAY,
  doc,
  Node_,
  mkText,
  q,
  descend,
  // Content builders
  simpleContent,
  mkContent,
  loadContent,
  mkI18n,
  // Setup
  getDojo,
  setup,
  setup2,
  // Session helpers
  ids,
  // Bundle loading
  loadApp,
  loadSandbox,
  // Test utilities
  find,
  inst,
  renderSettings
};

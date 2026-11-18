'use strict';
// Render matrix: one synthetic item per question type (kana words, ruby on kanji in prompt, options, answer).
// Each type is rendered in a real session (real App, real Preact, fake DOM) on the wrong path (the don't-know button)
// and, where the interaction is a single click or a typed value, on the right path.
// Checks per type: no state class on unchosen options, the buttons carry no overflow clip rule,
// the correct answer comes before the explanation after a wrong answer, ruby is present for marked kanji.
// Catalog detail and intro card: no internal-field labels.
// Fake DOM and ruby plugin copied from render-feedback-wrong.test.js (no shared helper exists in web/tests).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const DojoWasm = require('../dojo-wasm.js');
const DojoSession = require('../session.js');
const { checkWasmFresh } = require('./loader.js');
const { loadBundle } = require('./load-bundle.js');
const H = require('./app-harness.js');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const NOW = 1760000000000;
const TODAY = '2025-10-09';
// Whole words only: the internal label (Povtor) must not match inside the longer sentence word (Povtorite). Literals escaped.
const INTERNAL = /(?:^|[^\u0430-\u044f\u0451\u0410-\u042f\u0401])(?:\u0421\u0442\u0430\u0434\u0438\u044f|\u0423\u0440\u043e\u0432\u043d\u0438|\u041e\u0431\u0449\u0438\u0439 \u0443\u0440\u043e\u0432\u0435\u043d\u044c|\u042d\u0442\u0430\u043f|\u041f\u043e\u0432\u0442\u043e\u0440)(?![\u0430-\u044f\u0451\u0410-\u042f\u0401])/;

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
const qAll = (root, pred) => { const r = []; descend(root, (n) => { if (pred(n)) r.push(n); }); return r; };
const hasClass = (n, c) => ((n.attrs && n.attrs.class) || '').split(' ').indexOf(c) >= 0;

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
  loadBundle(sb, { only: ['vendor/preact.min.js', 'vendor/htm.umd.js', 'ext/registry.js', 'ext/input-script.js', 'ext.js', 'types/registry.js', 'types/card.js', 'types/choice.js', 'ui/answer-block.js', 'types/cloze.js', 'types/gap.js', 'types/match.js', 'types/multi.js', 'types/numeric.js', 'types/order.js', 'ui/i18n.js', 'ui/play-button.js', 'ui/common.js', 'ui/detail.js', 'ui/catalog-audio.js', 'ui/catalog-detail.js', 'ui/catalog.js', 'ui/group-card.js', 'ui/home.js', 'ui/stimulus.js', 'ui/session-feedback.js', 'ui/session-focus.js', 'ui/session-boundary.js', 'ui/session-panels.js', 'ui/session-screen.js', 'ui/results.js', 'ui/placement.js', 'ui/settings-speech.js', 'ui/settings-unit-dialogs.js', 'ui/settings-sections.js', 'ui/settings-plugin.js', 'ui/settings-dialogs.js', 'ui/settings.js', 'ui/app-screens.js', 'ui/app.js'] });
  installRubyPlugin(sb);
  return { sb, win };
}

async function mount(items) {
  const { sb, win } = loadSandbox();
  const dojo = await DojoWasm.load(fs.readFileSync(checkWasmFresh()));
  const course = { id: 'c', title: 'C', units: [{ id: 'u' }], markup: 'ruby-test', dontKnow: true };
  const content = { v: 1, course, items, version: 't', lock: items.map((i) => i.id) };
  const d = { v: 1, t: 0, items: {}, stats: { days: {}, newByDay: {} }, settings: {}, exams: {} };
  const store = { doc: d, status: 'ok', update(fn) { fn(d); d.t = NOW; }, flush() {}, noteAnswer() {} };
  const engine = DojoSession.createEngine({ dojo, store, content, now: () => NOW, today: () => TODAY, random: () => 0.5 });
  sb.DojoExt.use(course.markup);
  const en = JSON.parse(read('i18n/en.json'));
  const ru = JSON.parse(read('i18n/ru.json'));
  const t = sb.DojoApp._makeT({ en, ru }, 'ru');
  const byId = {};
  items.forEach((i) => { byId[i.id] = i; });
  const rootEl = new Node_(1, 'DIV');
  let app = null;
  sb.preact.render(sb.preact.h(sb.DojoApp._App, { ref: (a) => { app = a; }, t, lang: 'ru', store, engine, dojo, content, course, byId, now: () => NOW, today: () => TODAY, win }), rootEl);
  const flush = async () => { await new Promise((r) => setImmediate(r)); };
  return { sb, app, rootEl, engine, win, flush };
}

// Synthetic items: kana words, ruby on the kanji \u732b in prompt/options/answer, one item per type.
const CAT = '{\u732b|\u306d\u3053}';
const ITEMS = {
  gap: { type: 'gap', prompt: CAT + '\u306e\u8aad\u307f\u65b9\u306f\uff1f', answers: ['\u306d\u3053'], explanation: CAT + '\u306f\u300c\u306d\u3053\u300d\u3068\u8aad\u307f\u307e\u3059\u3002' },
  choice: { type: 'choice', prompt: CAT + '\u306f\u3069\u308c\uff1f', options: ['\u3044\u306c', CAT, '\u3068\u308a'], answer: 1, explanation: CAT + '\u306f\u732b\u3067\u3059\u3002' },
  cloze: { type: 'cloze', prompt: '\u7a7a\u6b04\u3092\u57cb\u3081\u3066\u304f\u3060\u3055\u3044', parts: ['\u3053\u308c\u306f ', ['\u306d\u3053'], ' \u3067\u3059\u3002'], explanation: CAT + '\u3067\u3059\u3002' },
  card: { type: 'card', prompt: CAT, back: '\u306d\u3053', explanation: CAT + '\u306e\u610f\u5473\u3002' },
  order: { type: 'order', prompt: CAT + '\u306e\u624b\u9806\u3092\u4e26\u3079\u3066\u304f\u3060\u3055\u3044', steps: ['\u307e\u305a', '\u3064\u304e\u306b', '\u3055\u3044\u3054\u306b'], explanation: '\u9806\u756a\u306f\u300c\u307e\u305a\u300d\u304b\u3089\u3002' },
  match: { type: 'match', prompt: '\u7d44\u307f\u5408\u308f\u305b\u3066\u304f\u3060\u3055\u3044', pairs: [{ left: CAT, right: 'cat' }, { left: '\u3044\u306c', right: 'dog' }], explanation: CAT + '\uff1dcat\u3002' },
  multi: { type: 'multi', prompt: CAT + '\u3092\u9078\u3093\u3067\u304f\u3060\u3055\u3044\uff08\u8907\u6570\uff09', options: ['\u306d\u3053', '\u3044\u306c', '\u3068\u308a'], correct: [0, 2], explanation: CAT + '\u306f\u300c\u306d\u3053\u300d\u3002' },
  numeric: { type: 'numeric', prompt: CAT + '\u306f\u4f55\u5339\uff1f', answer: 3, explanation: '\u4e09\u5339\u3067\u3059\u3002' }
};
const TYPES = Object.keys(ITEMS);
const itemFor = (type) => Object.assign({ id: 'syn-' + type, unit: 'u' }, ITEMS[type]);

// Session view: the question block, the feedback, and the buttons, after a result.
async function startDaily(m) {
  m.app.startMode('daily', {});
  await m.flush();
  assert.ok(q(m.rootEl, 'session'), 'session screen mounted');
}
function orderOf(root) {
  const ids = [];
  descend(root, (n) => { if (n.attrs && n.attrs['data-testid']) ids.push(n.attrs['data-testid']); });
  return ids;
}
function within(ancestor, id) {
  let found = false;
  descend(ancestor, (n) => { if (n.attrs && n.attrs['data-testid'] === id) found = true; });
  return found;
}

// Text of a virtual tree with a space between text nodes, so a label cannot hide inside a longer word.
function spacedText(n) {
  const out = [];
  (function rec(x) {
    if (Array.isArray(x)) return x.forEach(rec);
    if (typeof x === 'string' || typeof x === 'number') { out.push(String(x)); return; }
    if (x && x.props) rec(x.props.children);
  })(n);
  return out.join(' ');
}

// CSS: the rule for the .btn selector (not .btn-*) must not clip or hide overflow.
function assertButtonsUnclipped() {
  const css = read('styles/app.css');
  const rule = /(^|\n)\.btn\s*\{([^}]*)\}/.exec(css);
  assert.ok(rule, 'rule .btn exists');
  assert.doesNotMatch(rule[2], /overflow(-x|-y)?:\s*(hidden|clip)/);
  assert.doesNotMatch(rule[2], /(^|[;\s])clip:/);
}

// Wrong path: "\u041d\u0435 \u0437\u043d\u0430\u044e" (every type but card); card wrong path: show answer, then "\u0421\u043d\u043e\u0432\u0430".
async function wrongPath(m, type) {
  if (type === 'card') {
    assert.ok(q(m.rootEl, 'btn-show'), 'card: show-answer button present');
    q(m.rootEl, 'btn-show').fire('click');
    await m.flush();
    q(m.rootEl, 'btn-again').fire('click');
  } else {
    assert.ok(q(m.rootEl, 'btn-dont-know'), type + ': "\u041d\u0435 \u0437\u043d\u0430\u044e" button present');
    q(m.rootEl, 'btn-dont-know').fire('click');
  }
  await m.flush();
}

// Types with a "\u041f\u0440\u043e\u0432\u0435\u0440\u0438\u0442\u044c" submit button (choice answers on click, card has \u041f\u043e\u043a\u0430\u0437\u0430\u0442\u044c).
const SUBMIT_TYPES = ['gap', 'cloze', 'order', 'match', 'multi', 'numeric'];

for (const type of TYPES) {
  test(`render-all-types ${type}: wrong path keeps the right answer first, no state on unchosen options`, async () => {
    const m = await mount([itemFor(type)]);
    await startDaily(m);
    assert.ok(q(m.rootEl, 'prompt') || qAll(m.rootEl, (n) => n.nodeName === 'RUBY').length > 0, type + ' question rendered');
    if (SUBMIT_TYPES.includes(type)) assert.ok(q(m.rootEl, 'btn-submit'), type + ': "\u041f\u0440\u043e\u0432\u0435\u0440\u0438\u0442\u044c" button present');
    await wrongPath(m, type);
    const ids = orderOf(m.rootEl);
    const at = (id) => ids.indexOf(id);
    if (type !== 'card') {
      assert.ok(at('expected') >= 0, type + ': expected line shown');
      assert.ok(at('feedback-card') >= 0, type + ': feedback card shown after wrong answer: ' + ids.join(','));
      assert.ok(at('expected') < at('feedback-card'), type + ': answer before card: ' + ids.join(','));
      assert.ok(within(q(m.rootEl, 'feedback-card'), 'explanation'), type + ': explanation in card');
    }
    // Unchosen options: no right/wrong/picked state after "\u041d\u0435 \u0437\u043d\u0430\u044e" (choice and multi render option buttons).
    const opts = qAll(m.rootEl, (n) => n.attrs && /^option-\d+$/.test(n.attrs['data-testid'] || ''));
    opts.forEach((o) => {
      if (type === 'choice' || type === 'multi') {
        assert.ok(!hasClass(o, 'picked') && !hasClass(o, 'wrong'), type + ': option has no picked/wrong state');
      }
    });
    assertButtonsUnclipped();
    assert.ok(q(m.rootEl, 'btn-next'), type + ': "\u0414\u0430\u043b\u0435\u0435" button present after wrong answer');
    assert.ok(qAll(m.rootEl, (n) => n.nodeName === 'RUBY').length > 0, type + ': ruby element for marked kanji');
  });
}

test('render-all-types gap and choice: right path shows the right feedback without a card', async () => {
  const g = await mount([itemFor('gap')]);
  await startDaily(g);
  q(g.rootEl, 'gap-input').value = '\u306d\u3053';
  q(g.rootEl, 'gap-input').fire('input', { target: q(g.rootEl, 'gap-input') });
  await g.flush();
  q(g.rootEl, 'gap-form').fire('submit');
  await g.flush();
  assert.ok(q(g.rootEl, 'feedback'), 'gap: feedback shown');
  assert.strictEqual(q(g.rootEl, 'feedback-card'), null, 'gap: no card on right answer');

  const c = await mount([itemFor('choice')]);
  await startDaily(c);
  q(c.rootEl, 'option-1').fire('click');
  await c.flush();
  assert.ok(qAll(c.rootEl, (n) => hasClass(n, 'right')).length >= 1, 'choice: right option marked');
  assert.ok(q(c.rootEl, 'btn-next'), 'choice: next button shown');
});

test('render-all-types numeric: right path accepts the answer', async () => {
  const m = await mount([itemFor('numeric')]);
  await startDaily(m);
  q(m.rootEl, 'numeric-input').value = '3';
  q(m.rootEl, 'numeric-input').fire('input', { target: q(m.rootEl, 'numeric-input') });
  await m.flush();
  q(m.rootEl, 'numeric-form').fire('submit');
  await m.flush();
  assert.ok(q(m.rootEl, 'feedback'), 'numeric: feedback shown');
});

test('render-all-types multi: right path marks the chosen correct options', async () => {
  const m = await mount([itemFor('multi')]);
  await startDaily(m);
  q(m.rootEl, 'option-0').fire('click');
  await m.flush();
  q(m.rootEl, 'option-2').fire('click');
  await m.flush();
  q(m.rootEl, 'btn-submit').fire('click');
  await m.flush();
  assert.ok(q(m.rootEl, 'feedback'), 'multi: feedback shown');
});

// Right path for the types the gap/choice/numeric/multi tests above do not cover.
const RIGHT_DRIVERS = {
  cloze: async (m) => {
    q(m.rootEl, 'cloze-input-0').value = '\u306d\u3053';
    q(m.rootEl, 'cloze-input-0').fire('input', { target: q(m.rootEl, 'cloze-input-0') });
    await m.flush();
    q(m.rootEl, 'btn-submit').fire('click');
  },
  order: async (m) => {
    for (const i of [0, 1, 2]) {
      q(m.rootEl, 'order-item-' + i).fire('click');
      await m.flush();
    }
    q(m.rootEl, 'btn-submit').fire('click');
  },
  match: async (m) => {
    for (const i of [0, 1]) {
      const sel = q(m.rootEl, 'match-select-' + i);
      // Row 0 is the ruby cat (pairs with "cat"); row 1 is \u3044\u306c (pairs with "dog").
      const want = sel.attrs['aria-label'] === CAT ? 'cat' : 'dog';
      sel.value = sel.childNodes.find((o) => o.textContent === want).attrs.value;
      sel.fire('change', { target: sel });
      await m.flush();
    }
    q(m.rootEl, 'match').fire('submit');
  },
  card: async (m) => {
    q(m.rootEl, 'btn-show').fire('click');
    await m.flush();
    q(m.rootEl, 'btn-known').fire('click');
  }
};

for (const type of Object.keys(RIGHT_DRIVERS)) {
  test(`render-all-types ${type}: right path shows feedback and the next button`, async () => {
    const m = await mount([itemFor(type)]);
    await startDaily(m);
    await RIGHT_DRIVERS[type](m);
    await m.flush();
    assert.ok(q(m.rootEl, 'feedback'), type + ': feedback shown on right answer');
    assert.ok(q(m.rootEl, 'btn-next'), type + ': "\u0414\u0430\u043b\u0435\u0435" button present after right answer');
  });
}

test('render-all-types catalog detail: no internal-field labels, ruby on the kanji title', async () => {
  const items = [Object.assign(itemFor('choice'), { meta: { meaning: CAT, reading: '\u306d\u3053' } })];
  const course = { id: 'c', title: 'C', units: [{ id: 'u', title: 'U' }], markup: 'ruby-test', detail: { fields: [{ key: 'meta.meaning', label: 'Meaning' }, { key: 'meta.reading', label: 'Reading' }] } };
  const m = await H.mount({ items, course, lang: 'ru', settings: {}, setup: installRubyPlugin });
  m.sb.DojoExt.use('ruby-test');
  m.app.go('catalog');
  const cat = m.screen(m.sb.DojoApp._CatalogScreen);
  cat.setState({ detailItem: items[0] });
  const v = cat.view();
  const text = spacedText(v);
  assert.ok(!INTERNAL.test(text), 'catalog detail has no internal label');
  assert.ok(H.find(v, 'declarative-detail'), 'declarative detail rendered');
  let rubies = 0;
  H.walk(H.expand(v), (n) => { if (n.type === 'ruby') rubies++; });
  assert.ok(rubies > 0, 'catalog detail: ruby element for marked kanji');
});

test('render-all-types intro card: no internal-field labels', async () => {
  const items = [Object.assign(itemFor('gap'), { entity: 'e-k' })];
  const m = await H.mount({ items, course: { id: 'c', title: 'C', units: [{ id: 'u', title: 'U' }], introNew: true }, intros: [{ id: 'e-k', title: ITEMS.gap.prompt, text: 'T', meta: { kind: 'kanji' } }], lang: 'ru' });
  m.app.go('catalog');
  const cat = m.screen(m.sb.DojoApp._CatalogScreen);
  const v = cat.view();
  assert.ok(H.find(v, 'catalog-list'), 'catalog list rendered');
  assert.ok(H.find(v, 'topic-e-k'), 'intro topic row rendered');
  const text = spacedText(v);
  assert.ok(text.trim().length > 0, 'intro/catalog text is not empty');
  assert.ok(!INTERNAL.test(text), 'intro/catalog has no internal label');
});

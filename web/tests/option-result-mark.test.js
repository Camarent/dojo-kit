'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const { loadBundle } = require('./load-bundle.js');
const web = path.join(__dirname, '..');
const sb = { console };
loadBundle(sb, { only: ['vendor/preact.min.js', 'vendor/htm.umd.js', 'types/registry.js', 'types/choice.js'] });

const t = (k) => k;
function walk(n, fn) {
  if (Array.isArray(n)) n.forEach((c) => walk(c, fn));
  else if (n && typeof n === 'object' && n.props) { fn(n); walk(n.props.children, fn); }
}
function textContent(n) {
  let s = '';
  (function rec(x) {
    if (Array.isArray(x)) return x.forEach(rec);
    if (typeof x === 'string' || typeof x === 'number') { s += x; return; }
    if (x && x.props) rec(x.props.children);
  })(n);
  return s;
}
function findByTestId(n, id) {
  let result = null;
  walk(n, (node) => {
    if (node.props && node.props['data-testid'] === id) {
      result = node;
    }
  });
  return result;
}
function getChildrenText(n) {
  const children = [];
  walk(n, (node) => {
    if (node.props && node.props.children !== undefined) {
      const txt = textContent(node.props.children);
      if (txt) children.push(txt);
    }
  });
  return children;
}

function q(type, view, state, extra) {
  const def = sb.DojoTypes.get(type);
  return def.Question(Object.assign({
    item: { answer: 0 }, view, result: null, picked: null, exam: false, t,
    state: state || def.initialState(view), setState() {}, onSubmit() {}, onReveal() {}
  }, extra));
}

const opts = { options: [{ index: 0, id: 'a', label: 'A' }, { index: 1, id: 'b', label: 'B' }] };

// Test (a): Choice render after result
test('choice: correct pick shows check glyph', () => {
  const v = q('choice', opts, null, { result: { correct: true }, picked: 0 });
  const option0 = findByTestId(v, 'option-0');
  assert.ok(option0, 'option-0 should exist');
  const txt = textContent(option0);
  assert.ok(txt.includes('\u2713'), 'option-0 should contain check glyph');
});

test('choice: wrong pick shows cross glyph on picked and check on correct', () => {
  const v = q('choice', opts, null, { result: { correct: false }, picked: 1 });
  const option0 = findByTestId(v, 'option-0');
  const option1 = findByTestId(v, 'option-1');
  assert.ok(option0, 'option-0 should exist');
  assert.ok(option1, 'option-1 should exist');
  const txt0 = textContent(option0);
  const txt1 = textContent(option1);
  assert.ok(txt0.includes('\u2713'), 'correct option-0 should contain check glyph');
  assert.ok(txt1.includes('\u2717'), 'wrong picked option-1 should contain cross glyph');
});

test('choice: no result shows no glyphs', () => {
  const v = q('choice', opts);
  const option0 = findByTestId(v, 'option-0');
  const option1 = findByTestId(v, 'option-1');
  assert.ok(option0, 'option-0 should exist');
  assert.ok(option1, 'option-1 should exist');
  const txt0 = textContent(option0);
  const txt1 = textContent(option1);
  assert.ok(!txt0.includes('\u2713') && !txt0.includes('\u2717'), 'option-0 should not contain glyphs');
  assert.ok(!txt1.includes('\u2713') && !txt1.includes('\u2717'), 'option-1 should not contain glyphs');
});

test('choice: exam mode shows no glyphs', () => {
  const v = q('choice', opts, null, { result: { correct: true }, picked: 0, exam: true });
  const option0 = findByTestId(v, 'option-0');
  assert.ok(option0, 'option-0 should exist');
  const txt = textContent(option0);
  assert.ok(!txt.includes('\u2713') && !txt.includes('\u2717'), 'exam mode should not show glyphs');
});

function fakeEl() {
  const attrs = {};
  return {
    attrs, focused: false,
    setAttribute(k, v) { attrs[k] = v; }, removeAttribute(k) { delete attrs[k]; },
    focus() { this.focused = true; }
  };
}
const H = require('./app-harness.js');
async function focusOnLoad(kbd) {
  const items = [{ id: 'x1', unit: 'u1', type: 'choice', prompt: 'P', options: ['a', 'b'], answer: 0 }];
  const m = await H.mount({ items, course: { id: 'c', title: 'C', units: [{ id: 'u1', title: 'U1' }] } });
  m.app.startMode('daily', {});
  const scr = m.screen(m.sb.DojoApp._SessionScreen);
  m.sb.setTimeout = setTimeout;
  const el = fakeEl();
  scr.qbox = { querySelector: (sel) => (sel === '[data-autofocus]' ? el : null), querySelectorAll: (sel) => (sel === '[data-nofocusring]' && 'data-nofocusring' in el.attrs ? [el] : []), contains: () => false };
  if (kbd) scr.onModality({ type: 'keydown' });
  scr.focusSoon();
  await new Promise((r) => setTimeout(r, 5));
  return { scr, el };
}

test('mount: first option is focused on load without a focus ring', async () => {
  const { el } = await focusOnLoad(false);
  assert.ok(el.focused);
  assert.ok('data-nofocusring' in el.attrs);
});

test('mount: keyboard-initiated focus keeps the ring and keydown clears the mark', async () => {
  const { el } = await focusOnLoad(true);
  assert.ok(el.focused);
  assert.ok(!('data-nofocusring' in el.attrs));
  const a = await focusOnLoad(false);
  a.scr.onModality({ type: 'keydown' });
  assert.ok(!('data-nofocusring' in a.el.attrs));
});

test('sr-only result text is separated from the option label', () => {
  const html = fs.readFileSync(path.join(web, 'types/choice.js'), 'utf8');
  assert.ok(/class="sr-only"> \$\{p\.t\('session\.correct'\)\}/.test(html));
  assert.ok(/class="sr-only"> \$\{p\.t\('session\.wrong'\)\}/.test(html));
});

test('CSS: programmatic focus ring is suppressed via [data-nofocusring]', () => {
  const css = fs.readFileSync(path.join(web, 'styles/app.css'), 'utf8');
  assert.ok(/\[data-nofocusring\]:focus-visible\s*\{\s*outline:\s*none/.test(css));
});

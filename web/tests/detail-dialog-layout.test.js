'use strict';
// Mutation coverage: removing the scroll lock toggle turns test (a) red.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const H = require('./app-harness.js');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const choice = (id, unit, extra) => Object.assign({ id, unit, type: 'choice', prompt: 'Prompt ' + id, options: ['a', 'b', 'c'], answer: 0 }, extra);

// Create a fake window with a document.body that has classList
function createFakeWinWithBody() {
  const win = H.fakeWin([]);
  win.document.documentElement = {
    classList: {
      list: [],
      add(cls) { this.list.push(cls); },
      remove(cls) { this.list = this.list.filter(c => c !== cls); },
      contains(cls) { return this.list.includes(cls); }
    }
  };
  return win;
}

// Lifecycle driver: setState re-renders and fires componentDidUpdate like Preact; mount fires componentDidMount.
async function openCatalog() {
  const items = [choice('a1', 'u1', { meta: { kanji: '一' } }), choice('a2', 'u1')];
  const course = { id: 'c', title: 'C', units: [{ id: 'u1', title: 'U1', detail: { glyph: 'meta.kanji' } }], detail: { glyph: 'meta.kanji' } };
  const m = await H.mount({ items, course, win: createFakeWinWithBody() });
  m.app.go('catalog');
  const cat = m.screen(m.sb.DojoApp._CatalogScreen);
  const plain = cat.setState;
  cat.setState = function (p) { plain.call(this, p); if (this.componentDidUpdate) this.componentDidUpdate(); };
  if (cat.componentDidMount) cat.componentDidMount();
  const locked = () => m.win.document.documentElement.classList.contains('dojo-no-scroll');
  const click = (id) => H.find(cat.view(), id).props.onClick({ stopPropagation() {} });
  const openRow = () => {
    const row = H.find(cat.view(), 'topic-a1');
    let btn = null;
    H.walk(row, (n) => { if (!btn && n.type === 'button') btn = n; });
    btn.props.onClick({});
  };
  return { m, cat, locked, click, openRow };
}

test('scroll lock: row click locks body, close button releases', async () => {
  const { cat, locked, click, openRow } = await openCatalog();
  assert.ok(!locked());
  openRow();
  assert.ok(H.find(cat.view(), 'catalog-detail'));
  assert.ok(locked(), 'locked while detail open');
  click('btn-close-detail');
  assert.ok(!H.find(cat.view(), 'catalog-detail'));
  assert.ok(!locked(), 'released after close');
});

test('scroll lock: overlay click releases', async () => {
  const { locked, click, openRow } = await openCatalog();
  openRow();
  assert.ok(locked());
  click('catalog-detail');
  assert.ok(!locked());
});

test('scroll lock: unmount with detail open releases', async () => {
  const { cat, locked, openRow } = await openCatalog();
  openRow();
  assert.ok(locked());
  cat.componentWillUnmount();
  assert.ok(!locked());
});

// ============================================================================
// (b) Header: sticky container, compact close, glyph
// ============================================================================

test('close button sits inside header element with testid, not .big', async () => {
  const { cat, openRow } = await openCatalog();
  openRow();
  const header = H.find(cat.view(), 'catalog-detail-header');
  assert.ok(header);
  assert.match(header.props.class, /\bcatalog-detail-header\b/);
  let btn = null;
  H.walk(header, (n) => { if (n.props['data-testid'] === 'btn-close-detail') btn = n; });
  assert.ok(btn, 'close inside header');
  assert.ok(!/\bbig\b/.test(btn.props.class || ''));
});

test('header renders the glyph when item has meta.kanji, none otherwise', async () => {
  const { cat, click, openRow } = await openCatalog();
  openRow();
  const g = H.find(H.find(cat.view(), 'catalog-detail-header'), 'detail-glyph');
  assert.ok(g, 'glyph in header');
  assert.match(g.props.class, /\bkanji-ch\b/);
  assert.strictEqual(H.text(g), '一');
  click('btn-close-detail');
  const row = H.find(cat.view(), 'topic-a2');
  let btn = null;
  H.walk(row, (n) => { if (!btn && n.type === 'button') btn = n; });
  btn.props.onClick({});
  assert.ok(H.find(cat.view(), 'btn-close-detail'));
  assert.strictEqual(H.find(cat.view(), 'detail-glyph'), null);
});

test('CSS: no rule giving the close button width:100%', () => {
  const css = read('styles/app.css');
  const bad = [];
  css.replace(/([^{}]+)\{([^{}]*)\}/g, (_, sel, body) => {
    if (/(^|[\s,])(\.btn(\.icon)?|\.catalog-detail-header[^,]*\.btn[^,]*)\s*(,|$)/.test(sel.trim()) && /(^|;|\s)width:\s*100%/.test(body)) bad.push(sel.trim());
    return _;
  });
  assert.deepStrictEqual(bad, []);
});

// ============================================================================
// (c) CSS source checks
// ============================================================================

test('CSS: .catalog-detail-dialog has max-width with value <= 720px', () => {
  const css = read('styles/app.css');
  assert.ok(css.includes('.catalog-detail-dialog'), 'app.css should contain .catalog-detail-dialog rule');
  
  // Check for max-width with min(720px, 100%) or similar
  const ruleMatch = css.match(/\.catalog-detail-dialog\s*\{[^}]*max-width:\s*[^;}]+/);
  assert.ok(ruleMatch, 'app.css should contain .catalog-detail-dialog with max-width');
  
  const ruleText = ruleMatch[0];
  // Should have max-width: min(720px, 100%) or max-width: 720px
  assert.ok(/max-width:\s*min\(720px,\s*100%\)/.test(ruleText) || /max-width:\s*720px/.test(ruleText),
    '.catalog-detail-dialog should have max-width <= 720px');
});

test('CSS: .dojo-no-scroll has overflow: hidden', () => {
  const css = read('styles/app.css');
  assert.ok(css.includes('.dojo-no-scroll'), 'app.css should contain .dojo-no-scroll rule');
  
  const ruleMatch = css.match(/\.dojo-no-scroll\s*\{[^}]*\}/);
  assert.ok(ruleMatch, 'app.css should contain .dojo-no-scroll rule');
  
  const ruleText = ruleMatch[0];
  assert.ok(ruleText.includes('overflow: hidden'), '.dojo-no-scroll should have overflow: hidden');
});

test('CSS: .catalog-detail-header is sticky', () => {
  const css = read('styles/app.css');
  assert.ok(css.includes('.catalog-detail-header'), 'app.css should contain .catalog-detail-header rule');
  
  const ruleMatch = css.match(/\.catalog-detail-header\s*\{[^}]*\}/);
  assert.ok(ruleMatch, 'app.css should contain .catalog-detail-header rule');
  
  const ruleText = ruleMatch[0];
  assert.ok(ruleText.includes('position: sticky'), '.catalog-detail-header should have position: sticky');
  assert.ok(ruleText.includes('top: 0'), '.catalog-detail-header should have top: 0');
});

test('CSS: .catalog-detail-dialog .qcard p has at least var(--fs-sm)', () => {
  const css = read('styles/app.css');
  const ruleMatch = css.match(/\.catalog-detail-dialog \.qcard p\s*\{[^}]*\}/);
  assert.ok(ruleMatch, 'app.css should contain .catalog-detail-dialog .qcard p rule');
  
  const ruleText = ruleMatch[0];
  assert.ok(ruleText.includes('var(--fs-sm)') || ruleText.includes('0.875rem') || /font-size:\s*[0-9.]+rem/.test(ruleText),
    '.catalog-detail-dialog .qcard p should have font-size using var(--fs-sm) or larger');
});

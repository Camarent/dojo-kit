'use strict';
// Tests for detail glyph path feature in catalog detail header.

const test = require('node:test');
const assert = require('node:assert');
const H = require('./app-harness.js');

const choice = (id, unit, extra) => Object.assign({ id, unit, type: 'choice', prompt: 'Prompt ' + id, options: ['a', 'b', 'c'], answer: 0 }, extra);

// Helper to create a course with detail config
function courseWithGlyph(glyph, units) {
  return Object.assign({
    id: 'test-course',
    title: 'Test Course',
    uiLanguage: 'en',
    units: units || [{ id: 'u1', title: 'Unit 1' }]
  }, glyph !== undefined ? { detail: { glyph: glyph } } : {});
}

// Helper to create a unit with detail config
function unitWithGlyph(id, title, glyph) {
  var unit = { id: id, title: title };
  if (glyph !== undefined) unit.detail = { glyph: glyph };
  return unit;
}

test('glyph path set (meta.char) shows the value in detail-glyph', async () => {
  const course = courseWithGlyph('meta.char');
  const items = [
    choice('a', 'u1', { meta: { kanji: '旧', char: '字' } })
  ];
  const m = await H.mount({ items, course });
  m.app.go('catalog');
  const cat = m.screen(m.sb.DojoApp._CatalogScreen);
  
  cat.setState({ detailItem: items[0] });
  const v = cat.view();
  
  // Check that detail-glyph is rendered with the custom path value
  const glyphEl = H.find(v, 'detail-glyph');
  assert.ok(glyphEl, 'detail-glyph element exists');
  assert.strictEqual(H.text(glyphEl), '字', 'glyph shows meta.char value');
});

test('glyph path set but resolves to empty/missing -> no detail-glyph element even when meta.kanji is set', async () => {
  const course = courseWithGlyph('meta.char');
  const items = [
    choice('a', 'u1', { meta: { kanji: '旧' } })
  ];
  const m = await H.mount({ items, course });
  m.app.go('catalog');
  const cat = m.screen(m.sb.DojoApp._CatalogScreen);
  
  cat.setState({ detailItem: items[0] });
  const v = cat.view();
  
  // Check that detail-glyph is NOT rendered when the custom path resolves to missing
  // even though meta.kanji is set
  assert.strictEqual(H.find(v, 'detail-glyph'), null, 'no detail-glyph when glyph path resolves to missing');
});

test('glyph unset -> old behaviour: meta.kanji shown', async () => {
  const course = courseWithGlyph(undefined);
  const items = [
    choice('a', 'u1', { meta: { kanji: '旧' } })
  ];
  const m = await H.mount({ items, course });
  m.app.go('catalog');
  const cat = m.screen(m.sb.DojoApp._CatalogScreen);
  
  cat.setState({ detailItem: items[0] });
  const v = cat.view();
  
  // Check that detail-glyph is rendered with meta.kanji (old behavior)
  const glyphEl = H.find(v, 'detail-glyph');
  assert.ok(glyphEl, 'detail-glyph element exists');
  assert.strictEqual(H.text(glyphEl), '旧', 'glyph shows meta.kanji value (fallback)');
});

test('glyph path with nested property works', async () => {
  const course = courseWithGlyph('meta.data.character');
  const items = [
    choice('a', 'u1', { meta: { data: { character: '漢' } } })
  ];
  const m = await H.mount({ items, course });
  m.app.go('catalog');
  const cat = m.screen(m.sb.DojoApp._CatalogScreen);
  
  cat.setState({ detailItem: items[0] });
  const v = cat.view();
  
  const glyphEl = H.find(v, 'detail-glyph');
  assert.ok(glyphEl, 'detail-glyph element exists');
  assert.strictEqual(H.text(glyphEl), '漢', 'glyph shows nested path value');
});

test('glyph path set but resolves to null -> no detail-glyph', async () => {
  const course = courseWithGlyph('meta.char');
  const items = [
    choice('a', 'u1', { meta: { char: null, kanji: '旧' } })
  ];
  const m = await H.mount({ items, course });
  m.app.go('catalog');
  const cat = m.screen(m.sb.DojoApp._CatalogScreen);
  
  cat.setState({ detailItem: items[0] });
  const v = cat.view();
  
  assert.strictEqual(H.find(v, 'detail-glyph'), null, 'no detail-glyph when path resolves to null');
});

test('glyph path set but resolves to empty string -> no detail-glyph', async () => {
  const course = courseWithGlyph('meta.char');
  const items = [
    choice('a', 'u1', { meta: { char: '', kanji: '旧' } })
  ];
  const m = await H.mount({ items, course });
  m.app.go('catalog');
  const cat = m.screen(m.sb.DojoApp._CatalogScreen);
  
  cat.setState({ detailItem: items[0] });
  const v = cat.view();
  
  assert.strictEqual(H.find(v, 'detail-glyph'), null, 'no detail-glyph when path resolves to empty string');
});

test('unit-level glyph config overrides course-level', async () => {
  const course = courseWithGlyph('meta.kanji', [
    { id: 'u1', title: 'Unit 1' },
    unitWithGlyph('u2', 'Unit 2', 'meta.char')
  ]);
  
  const items = [
    choice('a', 'u1', { meta: { kanji: '旧', char: 'A' } }),
    choice('b', 'u2', { meta: { kanji: '新', char: 'B' } })
  ];
  const m = await H.mount({ items, course });
  m.app.go('catalog');
  const cat = m.screen(m.sb.DojoApp._CatalogScreen);
  
  // Test u1 item (should use course glyph config: meta.kanji)
  cat.setState({ detailItem: items[0] });
  let v = cat.view();
  let glyphEl = H.find(v, 'detail-glyph');
  assert.ok(glyphEl, 'detail-glyph element exists for u1');
  assert.strictEqual(H.text(glyphEl), '旧', 'u1 glyph shows meta.kanji');
  
  // Test u2 item (should use unit glyph config: meta.char)
  cat.setState({ detailItem: items[1] });
  v = cat.view();
  glyphEl = H.find(v, 'detail-glyph');
  assert.ok(glyphEl, 'detail-glyph element exists for u2');
  assert.strictEqual(H.text(glyphEl), 'B', 'u2 glyph shows meta.char (unit override)');
});

test('glyph path with meta.kanji different from custom path - mutation guard', async () => {
  // This test verifies that we are NOT hard-coding meta.kanji
  // We use meta.char as the glyph path, and meta.kanji has a different value
  const course = courseWithGlyph('meta.char');
  const items = [
    choice('a', 'u1', { meta: { kanji: 'WRONG', char: 'CORRECT' } })
  ];
  const m = await H.mount({ items, course });
  m.app.go('catalog');
  const cat = m.screen(m.sb.DojoApp._CatalogScreen);
  
  cat.setState({ detailItem: items[0] });
  const v = cat.view();
  
  const glyphEl = H.find(v, 'detail-glyph');
  assert.ok(glyphEl, 'detail-glyph element exists');
  // If hard-coded to meta.kanji, this would be 'WRONG'
  // But since we use the glyph path, it should be 'CORRECT'
  assert.strictEqual(H.text(glyphEl), 'CORRECT', 'glyph shows meta.char value, not meta.kanji');
});

test('glyph unset and meta.kanji missing -> no detail-glyph', async () => {
  const course = courseWithGlyph(undefined);
  const items = [
    choice('a', 'u1', { meta: { meaning: 'test' } })
  ];
  const m = await H.mount({ items, course });
  m.app.go('catalog');
  const cat = m.screen(m.sb.DojoApp._CatalogScreen);
  
  cat.setState({ detailItem: items[0] });
  const v = cat.view();
  
  assert.strictEqual(H.find(v, 'detail-glyph'), null, 'no detail-glyph when glyph unset and meta.kanji missing');
});

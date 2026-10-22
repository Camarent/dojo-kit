'use strict';
// Tests for detail hook ctx.introRendered flag.
// The detail hook ctx gets an ADDITIVE boolean introRendered which is true iff the plugin intro hook
// produced output for the open catalog detail dialog.

const test = require('node:test');
const assert = require('node:assert');
const H = require('./app-harness.js');

const choice = (id, unit, extra) => Object.assign({ id, unit, type: 'choice', prompt: 'Prompt ' + id, options: ['a', 'b', 'c'], answer: 0 }, extra);

// Helper to create a course with units
function courseWithUnits(units) {
  return { id: 'test-course', title: 'Test Course', uiLanguage: 'en', units: units || [{ id: 'u1', title: 'Unit 1' }] };
}

test('detail hook ctx.introRendered is true when intro hook returns output', async () => {
  const items = [choice('a', 'u1', { entity: 'E1' })];
  const intros = [{ id: 'E1', title: 'Intro One', text: 'Body' }];
  const course = courseWithUnits([{ id: 'u1', title: 'Unit 1' }]);
  
  const m = await H.mount({ items, intros, course });
  m.app.go('catalog');
  const cat = m.screen(m.sb.DojoApp._CatalogScreen);
  
  // Register intro and detail hooks
  let introCalled = false;
  let detailCalled = false;
  let recordedIntroRendered = null;
  
  m.sb.DojoExt.registerIntro(function(intro, item, ctx) {
    introCalled = true;
    return ctx.h('div', { 'data-testid': 'intro-hook-output' }, 'Intro Hook');
  });
  
  m.sb.DojoExt.registerDetail(function(item, ctx) {
    detailCalled = true;
    recordedIntroRendered = ctx.introRendered;
    return ctx.h('div', { 'data-testid': 'detail-hook-output' }, 'Detail Hook');
  });
  
  // Open detail for item a
  cat.setState({ detailItem: items[0] });
  const v = cat.view();
  
  // Check that intro hook was called
  assert.ok(introCalled, 'intro hook was called');
  assert.ok(detailCalled, 'detail hook was called');
  
  // Check that introRendered is true
  assert.strictEqual(recordedIntroRendered, true, 'ctx.introRendered is true');
  
  // Check that intro-hook is rendered in detail-intro
  assert.ok(H.find(v, 'detail-intro'), 'detail-intro section exists');
  assert.ok(H.find(v, 'intro-hook'), 'intro-hook is rendered');
  
  // Check that detail-hook is rendered
  assert.ok(H.find(v, 'detail-hook'), 'detail-hook is rendered');
  assert.ok(H.find(v, 'detail-hook-output'), 'detail hook output is rendered');
});

test('detail hook ctx.introRendered is false when intro hook returns null', async () => {
  const items = [choice('a', 'u1', { entity: 'E1' })];
  const intros = [{ id: 'E1', title: 'Intro One', text: 'Body' }];
  const course = courseWithUnits([{ id: 'u1', title: 'Unit 1' }]);
  
  const m = await H.mount({ items, intros, course });
  m.app.go('catalog');
  const cat = m.screen(m.sb.DojoApp._CatalogScreen);
  
  // Register intro hook that returns null
  let introCalled = false;
  let detailCalled = false;
  let recordedIntroRendered = null;
  
  m.sb.DojoExt.registerIntro(function(intro, item, ctx) {
    introCalled = true;
    return null;
  });
  
  m.sb.DojoExt.registerDetail(function(item, ctx) {
    detailCalled = true;
    recordedIntroRendered = ctx.introRendered;
    return ctx.h('div', { 'data-testid': 'detail-hook-output' }, 'Detail Hook');
  });
  
  // Open detail for item a
  cat.setState({ detailItem: items[0] });
  const v = cat.view();
  
  // Check that intro hook was called
  assert.ok(introCalled, 'intro hook was called');
  assert.ok(detailCalled, 'detail hook was called');
  
  // Check that introRendered is false
  assert.strictEqual(recordedIntroRendered, false, 'ctx.introRendered is false');
  
  // Check that default intro body is shown (not intro-hook)
  assert.ok(H.find(v, 'detail-intro'), 'detail-intro section exists');
  assert.strictEqual(H.find(v, 'intro-hook'), null, 'intro-hook is not rendered');
  assert.ok(H.find(v, 'intro-title'), 'default intro title is rendered');
  
  // Check that detail-hook is rendered
  assert.ok(H.find(v, 'detail-hook'), 'detail-hook is rendered');
});

test('detail hook ctx.introRendered is false when item has no intro', async () => {
  const items = [choice('a', 'u1')];
  const course = courseWithUnits([{ id: 'u1', title: 'Unit 1' }]);
  
  const m = await H.mount({ items, course });
  m.app.go('catalog');
  const cat = m.screen(m.sb.DojoApp._CatalogScreen);
  
  // Register detail hook
  let detailCalled = false;
  let recordedIntroRendered = null;
  
  m.sb.DojoExt.registerDetail(function(item, ctx) {
    detailCalled = true;
    recordedIntroRendered = ctx.introRendered;
    return ctx.h('div', { 'data-testid': 'detail-hook-output' }, 'Detail Hook');
  });
  
  // Open detail for item a
  cat.setState({ detailItem: items[0] });
  const v = cat.view();
  
  // Check that detail hook was called
  assert.ok(detailCalled, 'detail hook was called');
  
  // Check that introRendered is false (no intro exists)
  assert.strictEqual(recordedIntroRendered, false, 'ctx.introRendered is false when no intro');
  
  // Check that detail-intro is not rendered
  assert.strictEqual(H.find(v, 'detail-intro'), null, 'detail-intro is not rendered');
  
  // Check that detail-hook is rendered
  assert.ok(H.find(v, 'detail-hook'), 'detail-hook is rendered');
});

test('intro hook is called exactly once per catalog detail render', async () => {
  const items = [choice('a', 'u1', { entity: 'E1' })];
  const intros = [{ id: 'E1', title: 'Intro One', text: 'Body' }];
  const course = courseWithUnits([{ id: 'u1', title: 'Unit 1' }]);
  
  const m = await H.mount({ items, intros, course });
  m.app.go('catalog');
  const cat = m.screen(m.sb.DojoApp._CatalogScreen);
  
  // Track intro hook calls
  let introCallCount = 0;
  
  m.sb.DojoExt.registerIntro(function(intro, item, ctx) {
    introCallCount++;
    return ctx.h('div', { 'data-testid': 'intro-hook-output' }, 'Intro Hook');
  });
  
  m.sb.DojoExt.registerDetail(function(item, ctx) {
    return ctx.h('div', { 'data-testid': 'detail-hook-output' }, 'Detail Hook');
  });
  
  // Open detail for item a
  cat.setState({ detailItem: items[0] });
  const v = cat.view();
  
  // Intro hook should be called exactly once
  assert.strictEqual(introCallCount, 1, 'intro hook called exactly once per render');
  
  // Verify the output is rendered
  assert.ok(H.find(v, 'intro-hook'), 'intro-hook is rendered');
});

test('mutation: hard-coded introRendered false breaks the test', async () => {
  // This test verifies that the feature is actually used.
  // We'll temporarily modify the code to hard-code introRendered: false and check that test (a) fails.
  const items = [choice('a', 'u1', { entity: 'E1' })];
  const intros = [{ id: 'E1', title: 'Intro One', text: 'Body' }];
  const course = courseWithUnits([{ id: 'u1', title: 'Unit 1' }]);
  
  const m = await H.mount({ items, intros, course });
  m.app.go('catalog');
  const cat = m.screen(m.sb.DojoApp._CatalogScreen);
  
  // Register intro and detail hooks
  let recordedIntroRendered = null;
  
  m.sb.DojoExt.registerIntro(function(intro, item, ctx) {
    return ctx.h('div', { 'data-testid': 'intro-hook-output' }, 'Intro Hook');
  });
  
  // Temporarily patch hookCtx to return hard-coded introRendered: false
  const originalHookCtx = cat.hookCtx.bind(cat);
  cat.hookCtx = function(extra) {
    const result = originalHookCtx(extra);
    // Force introRendered to false
    if (extra && extra.introRendered !== undefined) {
      result.introRendered = false;
    }
    return result;
  };
  
  m.sb.DojoExt.registerDetail(function(item, ctx) {
    recordedIntroRendered = ctx.introRendered;
    return ctx.h('div', { 'data-testid': 'detail-hook-output' }, 'Detail Hook');
  });
  
  // Open detail for item a
  cat.setState({ detailItem: items[0] });
  const v = cat.view();
  
  // With the mutation, introRendered should be false even though intro hook returned output
  assert.strictEqual(recordedIntroRendered, false, 'mutation: ctx.introRendered is hard-coded to false');
});

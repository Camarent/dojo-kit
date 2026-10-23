'use strict';
// Tests for detail hook ctx.feedback flag.
// The detail hook ctx gets an ADDITIVE boolean feedback which is true when called from session
// wrong-answer feedback, and absent (undefined) when called from the Catalog.

const test = require('node:test');
const assert = require('node:assert');
const H = require('./app-harness.js');

const gap = (id, unit, extra) => Object.assign({ id, unit, type: 'gap', prompt: 'Fill ' + id, answers: ['x'] }, extra);

function courseWithUnits(units) {
  return { id: 'test-course', title: 'Test Course', uiLanguage: 'en', contentLanguage: 'en', units: units || [{ id: 'u1', title: 'Unit 1' }] };
}

test('detail hook ctx.feedback is true in session wrong-answer feedback', async () => {
  const items = [gap('a', 'u1')];
  const course = courseWithUnits([{ id: 'u1', title: 'Unit 1' }]);
  
  const m = await H.mount({ items, course });
  m.app.go('home');
  
  // Register a detail hook that records ctx.feedback
  let recordedFeedback = null;
  let detailCalled = false;
  
  m.sb.DojoExt.registerDetail(function(item, ctx) {
    detailCalled = true;
    recordedFeedback = ctx.feedback;
    return ctx.h('div', { 'data-testid': 'detail-hook-output' }, 'Detail Hook');
  });
  
  // Start a practice session
  m.app.startMode('practice', { types: ['gap'] });
  const ss = m.screen(m.sb.DojoApp._SessionScreen);
  
  // Answer wrong
  ss.answer({ text: 'nope' }, undefined);
  
  // Force a render to trigger the feedback
  const v = ss.view();
  
  // Check that detail hook was called
  assert.ok(detailCalled, 'detail hook was called');
  
  // Check that feedback is true
  assert.strictEqual(recordedFeedback, true, 'ctx.feedback is true in session feedback');
  
  // Check that feedback-detail is rendered
  assert.ok(H.find(v, 'feedback-detail'), 'feedback-detail is rendered');
});

test('intro hook ctx.feedback is true in session wrong-answer feedback with intro', async () => {
  const items = [gap('a', 'u1', { entity: 'E1' })];
  const intros = [{ id: 'E1', title: 'Intro One', text: 'Body' }];
  const course = courseWithUnits([{ id: 'u1', title: 'Unit 1' }]);
  
  const m = await H.mount({ items, intros, course });
  m.app.go('home');
  
  // Register intro hook that records ctx.feedback
  let introFeedback = null;
  let introCalled = false;
  
  m.sb.DojoExt.registerIntro(function(intro, item, ctx) {
    introCalled = true;
    introFeedback = ctx.feedback;
    return ctx.h('div', { 'data-testid': 'intro-hook-output' }, 'Intro Hook');
  });
  
  // Start a practice session
  m.app.startMode('practice', { types: ['gap'] });
  const ss = m.screen(m.sb.DojoApp._SessionScreen);
  
  // Answer wrong
  ss.answer({ text: 'nope' }, undefined);
  
  // Force a render to trigger the feedback
  const v = ss.view();
  
  // Check that intro hook was called
  assert.ok(introCalled, 'intro hook was called');
  
  // Check that feedback is true
  assert.strictEqual(introFeedback, true, 'ctx.feedback is true in intro hook');
  
  // Check that feedback-detail is rendered
  assert.ok(H.find(v, 'feedback-detail'), 'feedback-detail is rendered');
  // When there's an intro, detail hook is NOT called (renderIntroBody doesn't call it)
  assert.strictEqual(H.find(v, 'detail-hook'), null, 'detail-hook is not rendered when intro exists');
});

test('detail hook ctx.feedback is undefined in catalog detail view', async () => {
  const items = [gap('a', 'u1')];
  const course = courseWithUnits([{ id: 'u1', title: 'Unit 1' }]);
  
  const m = await H.mount({ items, course });
  m.app.go('catalog');
  const cat = m.screen(m.sb.DojoApp._CatalogScreen);
  
  // Register a detail hook that records ctx.feedback
  let recordedFeedback = null;
  let detailCalled = false;
  
  m.sb.DojoExt.registerDetail(function(item, ctx) {
    detailCalled = true;
    recordedFeedback = ctx.feedback;
    return ctx.h('div', { 'data-testid': 'detail-hook-output' }, 'Detail Hook');
  });
  
  // Open detail for item a
  cat.setState({ detailItem: items[0] });
  const v = cat.view();
  
  // Check that detail hook was called
  assert.ok(detailCalled, 'detail hook was called');
  
  // Check that feedback is undefined (not set) in catalog
  assert.strictEqual(recordedFeedback, undefined, 'ctx.feedback is undefined in catalog');
  
  // Check that detail-hook is rendered
  assert.ok(H.find(v, 'detail-hook'), 'detail-hook is rendered');
});

test('intro hook ctx.feedback is undefined in catalog detail view', async () => {
  const items = [gap('a', 'u1', { entity: 'E1' })];
  const intros = [{ id: 'E1', title: 'Intro One', text: 'Body' }];
  const course = courseWithUnits([{ id: 'u1', title: 'Unit 1' }]);
  
  const m = await H.mount({ items, intros, course });
  m.app.go('catalog');
  const cat = m.screen(m.sb.DojoApp._CatalogScreen);
  
  // Register intro hook that records ctx.feedback
  let introFeedback = null;
  let introCalled = false;
  
  m.sb.DojoExt.registerIntro(function(intro, item, ctx) {
    introCalled = true;
    introFeedback = ctx.feedback;
    return ctx.h('div', { 'data-testid': 'intro-hook-output' }, 'Intro Hook');
  });
  
  // Open detail for item a
  cat.setState({ detailItem: items[0] });
  const v = cat.view();
  
  // Check that intro hook was called
  assert.ok(introCalled, 'intro hook was called');
  
  // Check that feedback is undefined in catalog
  assert.strictEqual(introFeedback, undefined, 'ctx.feedback is undefined in catalog intro');
  
  // Check that intro-hook is rendered
  assert.ok(H.find(v, 'intro-hook'), 'intro-hook is rendered');
});

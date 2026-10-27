'use strict';
// Mutation coverage: removing the intro field from the feedback detail ctx turns the first test red.
// ctx.intro is the session entity intro (session.entityIntro(item)), set on correct and wrong answers, null when absent.

const test = require('node:test');
const assert = require('node:assert');
const H = require('./app-harness.js');

const gap = (id, unit, extra) => Object.assign({ id, unit, type: 'gap', prompt: 'Fill ' + id, answers: ['x'] }, extra);
const course = { id: 'test-course', title: 'Test Course', uiLanguage: 'en', contentLanguage: 'en', units: [{ id: 'u1', title: 'Unit 1' }] };

async function feedbackCtx(items, intros, answer) {
  const m = await H.mount(intros ? { items, intros, course } : { items, course });
  m.app.go('home');
  let seen = null;
  m.sb.DojoExt.registerDetail(function (item, ctx) {
    seen = ctx;
    return ctx.h('div', { 'data-testid': 'detail-hook-output' }, 'Detail Hook');
  });
  m.app.startMode('practice', { types: ['gap'] });
  const ss = m.screen(m.sb.DojoApp._SessionScreen);
  ss.answer(answer, undefined);
  ss.view();
  return seen;
}

test('detail hook ctx.intro carries the entity intro on a correct answer', async () => {
  const items = [gap('a', 'u1', { entity: 'E1' })];
  const intros = [{ id: 'E1', title: 'Intro One', text: 'Body' }];
  const ctx = await feedbackCtx(items, intros, { text: 'x' });
  assert.ok(ctx, 'detail hook was called');
  assert.strictEqual(ctx.correct, true);
  assert.ok(ctx.intro, 'ctx.intro is set');
  assert.strictEqual(ctx.intro.id, 'E1');
  assert.strictEqual(ctx.intro.title, 'Intro One');
});

test('detail hook ctx.intro is null when the session has no entity intro', async () => {
  const items = [gap('a', 'u1')];
  const ctx = await feedbackCtx(items, null, { text: 'nope' });
  assert.ok(ctx, 'detail hook was called');
  assert.strictEqual(ctx.intro, null);
});

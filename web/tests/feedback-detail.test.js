'use strict';
// Mutation coverage: drop `this.feedbackDetail` from renderFeedback -> every test fails; drop the `correct` guard ->
// 'correct answer stays short' fails; drop the entityIntro branch -> 'wrong answer shows the entity intro' fails.
const test = require('node:test');
const assert = require('node:assert');
const H = require('./app-harness.js');

const gap = (id, entity, extra) => Object.assign({ id, unit: 'u1', type: 'gap', prompt: 'Prompt ' + id, answers: ['a'], entity, tags: ['t1', 'hid'], meta: { reading: 'rd-' + id } }, extra);
const course = {
  tagLabels: { t1: 'Tag One', hid: { label: 'Hidden', kind: 'internal' } },
  detail: { fields: [{ key: 'reading', label: 'Reading' }] }
};

async function start(o) {
  const m = await H.mount(Object.assign({ items: [gap('x1', 'E1')], course }, o));
  m.app.startMode('daily', {});
  const scr = m.screen(m.sb.DojoApp._SessionScreen);
  return { m, scr };
}

test('wrong answer shows declarative detail and visible tags', async () => {
  const { scr } = await start();
  scr.answer({ text: 'zzz' });
  const fb = H.find(scr.view(), 'feedback-detail');
  assert.ok(fb);
  assert.ok(/rd-x1/.test(H.text(fb)));
  assert.ok(/Tag One/.test(H.text(H.find(fb, 'feedback-tags'))));
  assert.ok(!/Hidden/.test(H.text(fb)));
});

test('correct answer stays short', async () => {
  const { scr } = await start();
  scr.answer({ text: 'a' });
  assert.ok(H.find(scr.view(), 'feedback'));
  assert.strictEqual(H.find(scr.view(), 'feedback-detail'), null);
});

test('Dont know shows the detail too', async () => {
  const { scr } = await start({ course: Object.assign({ dontKnow: true }, course) });
  scr.dontKnowAnswer();
  assert.ok(H.find(scr.view(), 'feedback-detail'));
});

test('wrong answer shows the entity intro (plugin hook body) even when the intro was seen', async () => {
  const { m, scr } = await start({ intros: [{ id: 'E1', title: 'Intro One', text: 'Body one' }], course: Object.assign({ introNew: true }, course) });
  scr.introDone();
  m.sb.DojoExt.registerIntro((intro, item, ctx) => ctx.h('b', { 'data-testid': 'x-hook' }, 'hook:' + intro.title));
  scr.answer({ text: 'zzz' });
  const fb = H.find(scr.view(), 'feedback-detail');
  assert.ok(/hook:Intro One/.test(H.text(fb)));
});

test('exam feedback is not extended', async () => {
  const m = await H.mount({ items: [gap('x1', 'E1')], course: Object.assign({ exam: { passMark: 0.5, sections: [{ title: 'A', count: 1, tags: ['t1'] }] } }, course) });
  m.app.startMode('exam', {});
  const scr = m.screen(m.sb.DojoApp._SessionScreen);
  scr.answer({ text: 'zzz' });
  assert.strictEqual(H.find(scr.view(), 'feedback-detail'), null);
});

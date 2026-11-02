'use strict';
// Mutation coverage: drop captionFor's tag loop -> 'tag caption beats type caption' fails; drop the bigPrompt class -> 'short prompt is large' fails;
// render renderDontKnow outside .actions-row -> 'Dont know and Next share one action row' fails.
const test = require('node:test');
const assert = require('node:assert');
const H = require('./app-harness.js');

const choice = (id, prompt, tags) => ({ id, unit: 'u1', type: 'choice', prompt, options: ['x', 'y'], answer: 0, tags });
async function start(items, course) {
  const m = await H.mount({ items, course: Object.assign({ dontKnow: true }, course) });
  m.app.startMode('daily', {});
  const scr = m.screen(m.sb.DojoApp._SessionScreen);
  return { m, scr, v: () => scr.view() };
}

test('tag caption beats type caption, type caption beats the built-in one', async () => {
  const a = await start([choice('a', 'Q', ['meaning'])], { captions: { meaning: 'MEANING', choice: 'TYPE' } });
  assert.strictEqual(H.text(H.find(a.v(), 'caption')), 'MEANING');
  const b = await start([choice('a', 'Q', ['other'])], { captions: { choice: 'TYPE' } });
  assert.strictEqual(H.text(H.find(b.v(), 'caption')), 'TYPE');
  const c = await start([choice('a', 'Q', [])], {});
  assert.strictEqual(H.text(H.find(c.v(), 'caption')), 'Choose the answer');
});

test('short prompt is large, long prompt is not', async () => {
  const a = await start([choice('a', '一', [])]);
  assert.ok(/\bbig\b/.test(H.find(a.v(), 'prompt').props.class));
  const b = await start([choice('a', 'A fairly long sentence prompt', [])]);
  assert.ok(!/\bbig\b/.test(H.find(b.v(), 'prompt').props.class));
});

test('Dont know and Next share one action row; exit is an icon button with a label', async () => {
  const { v } = await start([choice('a', 'Q', [])]);
  let row = null;
  H.walk(v(), (n) => { if (n.props.class === 'row actions-row') row = n; });
  assert.ok(row);
  assert.ok(H.find(row, 'btn-dont-know') && H.find(row, 'btn-next'));
  const exit = H.find(v(), 'btn-exit');
  assert.strictEqual(exit.props['aria-label'], 'Exit');
  assert.ok(/icon-btn/.test(exit.props.class));
});

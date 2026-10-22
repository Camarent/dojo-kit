'use strict';
const test = require('node:test');
const assert = require('node:assert');
const H = require('./app-harness.js');

// Simple test without stimuli first
async function start(o) {
  const m = await H.mount(Object.assign({ win: H.fakeWin([{ name: 'Kyoko', lang: 'ja-JP' }]), course: { contentLanguage: 'ja' }, items: [{ id: 'i1', unit: 'u1', type: 'gap', prompt: 'P', answers: ['a'], speak: 'hello' }] }, o));
  m.app.startMode('daily', {});
  const scr = m.screen(m.sb.DojoApp._SessionScreen);
  return { m, scr };
}

test('SessionScreen shows play button for item with speak', async () => {
  const { scr } = await start();
  const tree = scr.view();
  let pb = null;
  H.walk(tree, (n) => { if (!pb && n.props.testid === 'play-item') pb = n; });
  assert.ok(pb, 'play-item button should be present');
  assert.strictEqual(pb.props.lines.map((l) => l.text).join('|'), 'hello');
  const renderedText = H.text(tree);
  assert.ok(!renderedText.includes('{'), 'no raw {');
  assert.ok(!renderedText.includes('['), 'no raw [');
  assert.ok(!renderedText.includes('undefined'), 'no undefined');
});

test('SessionScreen hides play button for item without speak', async () => {
  const { scr } = await start({ items: [{ id: 'i1', unit: 'u1', type: 'gap', prompt: 'P', answers: ['a'] }] });
  const tree = scr.view();
  let pb = null;
  H.walk(tree, (n) => { if (!pb && n.props.testid === 'play-item') pb = n; });
  assert.strictEqual(pb, null, 'play-item should be absent');
  const renderedText = H.text(tree);
  assert.ok(!renderedText.includes('{'), 'no raw {');
  assert.ok(!renderedText.includes('['), 'no raw [');
  assert.ok(!renderedText.includes('undefined'), 'no undefined');
});

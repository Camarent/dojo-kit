'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const web = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(web, p), 'utf8');
const H = require('./app-harness.js');

async function start(o) {
  const m = await H.mount(Object.assign({ 
    win: H.fakeWin([{ name: 'Kyoko', lang: 'ja-JP' }]), 
    course: { contentLanguage: 'ja' }, 
    items: [{ id: 'i1', unit: 'u1', type: 'gap', prompt: 'P', answers: ['a'], speak: 'hello' }] 
  }, o));
  m.app.startMode('daily', {});
  const scr = m.screen(m.sb.DojoApp._SessionScreen);
  return { m, scr };
}

test('play-item is inside qline with prompt', async () => {
  const { scr } = await start();
  const tree = scr.view();
  
  let qline = null;
  let playItem = null;
  let prompt = null;
  
  H.walk(tree, (n) => {
    if (n.props && n.props.class === 'qline') qline = n;
    if (n.props && (n.props.testid === 'play-item' || n.props['data-testid'] === 'play-item')) playItem = n;
    if (n.props && (n.props.testid === 'prompt' || n.props['data-testid'] === 'prompt')) prompt = n;
  });
  
  assert.ok(qline, 'qline element should exist');
  assert.ok(playItem, 'play-item should exist');
  assert.ok(prompt, 'prompt should exist');
  
  // Check that play-item is inside qline
  function checkChildrenForTestid(parent, testid) {
    if (!parent || typeof parent !== 'object') return false;
    const props = parent.props;
    if (props && (props.testid === testid || props['data-testid'] === testid)) return true;
    const children = props && props.children;
    if (Array.isArray(children)) {
      return children.some((c) => checkChildrenForTestid(c, testid));
    }
    return checkChildrenForTestid(children, testid);
  }
  
  assert.ok(checkChildrenForTestid(qline, 'play-item'), 'play-item should be inside qline');
  assert.ok(checkChildrenForTestid(qline, 'prompt'), 'prompt should be inside qline');
});

test('CSS: .qline is flex with gap, .btn.play has no width:100% or flex:1, no position:absolute', () => {
  const css = read('styles/app.css');
  
  // Check .qline is flex
  const qlineMatch = css.match(/\.qline\s*\{[^}]*\}/);
  assert.ok(qlineMatch, 'app.css should contain .qline rule');
  const qlineRule = qlineMatch[0];
  assert.ok(qlineRule.includes('display: flex'), '.qline should have display: flex');
  assert.ok(qlineRule.includes('gap: var(--space-2)'), '.qline should have gap: var(--space-2)');
  assert.ok(qlineRule.includes('align-items: flex-start'), '.qline should have align-items: flex-start');
  
  // Check .btn.play
  const playMatch = css.match(/\.btn\.play\s*\{[^}]*\}/);
  assert.ok(playMatch, 'app.css should contain .btn.play rule');
  const playRule = playMatch[0];
  assert.ok(!playRule.includes('width: 100%'), '.btn.play should not have width: 100%');
  assert.ok(!playRule.includes('width:100%'), '.btn.play should not have width:100%');
  assert.ok(!playRule.includes('flex: 1'), '.btn.play should not have flex: 1');
  assert.ok(!playRule.includes('flex:1'), '.btn.play should not have flex:1');
  assert.ok(!playRule.includes('position: absolute'), '.btn.play should not have position: absolute');
  assert.ok(!playRule.includes('position:absolute'), '.btn.play should not have position:absolute');
  
  // Check that .qline doesn't have position:absolute
  assert.ok(!qlineRule.includes('position: absolute'), '.qline should not have position: absolute');
  assert.ok(!qlineRule.includes('position:absolute'), '.qline should not have position:absolute');
});

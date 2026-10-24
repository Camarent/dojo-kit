'use strict';
const test = require('node:test');
const assert = require('node:assert');
const H = require('./app-harness.js');

async function view(item, course) {
  const m = await H.mount({ win: H.fakeWin([{ name: 'K', lang: 'fr-FR' }]), course: Object.assign({ contentLanguage: 'fr' }, course), items: [item] });
  m.app.startMode('daily', {});
  const scr = m.screen(m.sb.DojoApp._SessionScreen);
  let cap = null;
  H.walk(scr.view(), (n) => { if (n.props && n.props['data-testid'] === 'caption') cap = n; });
  return cap;
}

test('numeric item with its own prompt shows no second framework caption', async () => {
  assert.strictEqual(await view({ id: 'n1', unit: 'u1', type: 'numeric', prompt: 'Напишите число', answer: 3 }), null);
});

test('a course caption for numeric is still shown', async () => {
  assert.ok(await view({ id: 'n1', unit: 'u1', type: 'numeric', prompt: 'P', answer: 3 }, { captions: { numeric: 'Cap' } }));
});

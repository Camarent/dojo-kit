'use strict';
const test = require('node:test');
const assert = require('node:assert');
const H = require('./app-harness.js');

const num = (id, ans, st) => ({ id, unit: 'u1', type: 'gap', inputMode: 'numeric', prompt: 'How many do you hear? Enter the number', answers: [ans], stimulus: st });
const ITEMS = [num('n1', '11', 's1'), num('n2', '11', 's2'), num('n3', '7', 's3'), { id: 'p1', unit: 'u1', type: 'gap', prompt: 'Plain prompt', answers: ['x'] }];
const STIMULI = [
  { id: 's1', text: 'onze', hideText: true, audio: ['c1'] },
  { id: 's2', text: 'onze', hideText: true, audio: ['c2'] },
  { id: 's3', text: 'seven', hideText: true }
];

async function open(clips) {
  const m = await H.mount({ items: ITEMS, stimuli: STIMULI, course: { units: [{ id: 'u1', title: 'U1' }] },
    setup: (sb) => { sb.DojoAudio = { ready: () => clips, status: () => ({}), unlock() {}, stop() {} }; } });
  m.app.go('catalog');
  const cat = m.screen(m.sb.DojoApp._CatalogScreen);
  return cat;
}
const label = (cat, id) => H.text(H.find(cat.view(), 'topic-label-' + id));
const btn = (v) => { let r = null; H.walk(v, (n) => { if (n.props && n.props.testid === 'play-detail') r = n; }); return r; };
const detail = (cat, id) => { cat.setState({ detailItem: cat.topics().find((r) => r.id === id).item }); return cat.view(); };

test('catalog row label of an audio numeric item is the answer without ordinal', async () => {
  const cat = await open(true);
  assert.strictEqual(label(cat, 'n1'), '11');
  assert.strictEqual(label(cat, 'n2'), '11');
  assert.strictEqual(label(cat, 'n3'), '7');
  assert.strictEqual(label(cat, 'p1'), 'Plain prompt');
});

test('detail of an audio numeric item renders the play button', async () => {
  const v = detail(await open(true), 'n1');
  assert.ok(btn(v));
});

test('detail of a plain item has no play button', async () => {
  const v = detail(await open(true), 'p1');
  assert.strictEqual(btn(v), null);
});

test('detail of an audio numeric item without clips or speech lines has no play button', async () => {
  const v = detail(await open(false), 'n3');
  assert.strictEqual(btn(v), null);
});

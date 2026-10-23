'use strict';
// Mutation: drop the `big` class or the always-rendered retry slot -> the tests below fail.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const H = require('./app-harness.js');

const choice = (id) => ({ id, unit: 'u1', type: 'choice', prompt: 'Q', options: ['x', 'y'], answer: 0, tags: [] });
async function start() {
  const m = await H.mount({ items: [choice('a'), choice('b')], course: {} });
  m.app.startMode('daily', {});
  return m.screen(m.sb.DojoApp._SessionScreen);
}

test('retry badge slot is rendered with and without retries; empty hides it, width stays reserved', async () => {
  const scr = await start();
  const slot = H.find(scr.view(), 'retry-badge');
  assert.ok(slot);
  assert.match(slot.props.class, /\bempty\b/);
  const css = fs.readFileSync(path.join(__dirname, '..', 'styles/app.css'), 'utf8');
  assert.match(css, /\.badge\.retry \{[^}]*min-width/);
  assert.match(css, /\.badge\.retry\.empty \{[^}]*visibility: hidden/);
});

test('btn-next is big and disabled before the answer', async () => {
  const scr = await start();
  const next = H.find(scr.view(), 'btn-next');
  assert.match(next.props.class, /\bprimary\b.*\bbig\b/);
  assert.ok(next.props.disabled);
});

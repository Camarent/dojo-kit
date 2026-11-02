'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { simpleContent, setup2: setup } = require('./fixtures.js');

async function offered(answer, input, numeric) {
  const content = simpleContent([{ id: 'u', title: 'U' }]);
  content.items = [numeric ? { id: 'u-1', unit: 'u', type: 'numeric', prompt: 'P', answer: Number(answer) } : { id: 'u-1', unit: 'u', type: 'gap', prompt: 'P', answers: [answer] }];
  const t = await setup(content);
  const s = t.engine.start('practice', { limit: 3 });
  s.answer({ text: input });
  return s.canOverride();
}

test('9 vs 1 no offer', async () => assert.strictEqual(await offered('1', '9'), false));
test('12 vs 1 no offer', async () => assert.strictEqual(await offered('1', '12'), false));
test('1245 vs 1254 no offer', async () => assert.strictEqual(await offered('1254', '1245'), false));
test('1245 vs 1246 offer', async () => assert.strictEqual(await offered('1246', '1245'), true));
test('12 vs 13 offer', async () => assert.strictEqual(await offered('13', '12'), true));
test('numeric 9 vs 1 no offer', async () => assert.strictEqual(await offered('1', '9', true), false));
test('numeric 1245 vs 1246 offer', async () => assert.strictEqual(await offered('1246', '1245', true), true));

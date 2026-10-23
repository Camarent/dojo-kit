'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { setup } = require('./fixtures.js');

const sessionDir = path.join(__dirname, '..', 'session');
const MODULES = ['overrides', 'queues', 'placement-queue', 'run', 'counts', 'exam'];

async function recordEngine() {
  const mods = MODULES.map((n) => require(path.join(sessionDir, n + '.js')));
  const originals = mods.map((m) => m.create);
  const owners = {};
  let ctx = null;
  let base = null;
  mods.forEach((m, i) => {
    m.create = function (c) {
      ctx = c;
      if (!base) base = Object.keys(c.fn);
      const out = originals[i].call(m, c);
      owners[MODULES[i]] = Object.keys(out || {});
      return out;
    };
  });
  try {
    await setup();
  } finally {
    mods.forEach((m, i) => { m.create = originals[i]; });
  }
  return { ctx, base, owners };
}

test('no ctx.fn key is registered by two sources', async () => {
  const { base, owners } = await recordEngine();
  const seen = new Map(base.map((k) => [k, 'session.js']));
  for (const [mod, keys] of Object.entries(owners)) {
    for (const k of keys) {
      assert.ok(!seen.has(k), `ctx.fn.${k} registered by ${seen.get(k)} and ${mod}`);
      seen.set(k, mod);
    }
  }
});

test('every ctx.fn.<name> used in web/session/*.js is registered', async () => {
  const { ctx } = await recordEngine();
  const used = new Set();
  for (const f of fs.readdirSync(sessionDir).filter((n) => n.endsWith('.js'))) {
    const src = fs.readFileSync(path.join(sessionDir, f), 'utf8');
    for (const m of src.matchAll(/ctx\.fn\.([A-Za-z_$][\w$]*)/g)) used.add(m[1]);
  }
  assert.ok(used.size > 0);
  for (const k of used) assert.ok(k in ctx.fn, `ctx.fn.${k} is used but never registered`);
});

test('ctx.fn is frozen after createEngine', async () => {
  const { ctx } = await recordEngine();
  assert.ok(Object.isFrozen(ctx.fn));
});

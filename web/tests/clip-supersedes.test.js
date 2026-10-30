'use strict';
const test = require('node:test');
const assert = require('node:assert');
const ClipFlags = require('../session/clip-flags.js');

const META = { 'b-1': { supersedes: ['a-1', 'a-2'] } };
function mk(settings, withMeta) {
  const store = { doc: { settings }, update(fn) { fn(store.doc); } };
  const ctx = { store, now: () => 1000 };
  if (withMeta !== false) ctx.clipMeta = (id) => META[id] || null;
  return { store, flags: ClipFlags.create(ctx) };
}

test('inherited flag from predecessor', () => {
  const { flags } = mk({ 'clipFlag:a-2': true });
  assert.strictEqual(flags.isFlagged('b-1'), true);
});

test('heardAt is max predecessor heardAt', () => {
  const { flags } = mk({ 'heard:a-1': 5, 'heard:a-2': 9 });
  assert.strictEqual(flags.heardAt('b-1'), 9);
});

test('own heard key wins over predecessors', () => {
  const { flags } = mk({ 'heard:a-1': 5, 'heard:b-1': 2 });
  assert.strictEqual(flags.heardAt('b-1'), 2);
});

test('un-flag after inherited flag: tombstone wins, old keys untouched', () => {
  const { flags, store } = mk({ 'clipFlag:a-1': true });
  assert.strictEqual(flags.isFlagged('b-1'), true);
  flags.setFlag('b-1', false);
  assert.strictEqual(store.doc.settings['clipFlag:b-1'], null);
  assert.strictEqual(flags.isFlagged('b-1'), false);
  assert.strictEqual(store.doc.settings['clipFlag:a-1'], true);
});

test('read-through does not write', () => {
  const { flags, store } = mk({ 'clipFlag:a-1': true, 'heard:a-1': 3 });
  const before = JSON.stringify(store.doc);
  flags.isFlagged('b-1'); flags.heardAt('b-1'); flags.flagged();
  assert.strictEqual(JSON.stringify(store.doc), before);
});

test('unknown id and no manifest', () => {
  const a = mk({ 'clipFlag:a-1': true });
  assert.strictEqual(a.flags.isFlagged('zzz'), false);
  assert.strictEqual(a.flags.heardAt('zzz'), undefined);
  const b = mk({ 'clipFlag:a-1': true, 'heard:a-1': 3 }, false);
  assert.strictEqual(b.flags.isFlagged('b-1'), false);
  assert.strictEqual(b.flags.heardAt('b-1'), undefined);
});

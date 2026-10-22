'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const DojoWasm = require('../dojo-wasm.js');
const DojoSession = require('../session.js');
const DojoExt = require('../ext.js');
const { checkWasmFresh } = require('./loader.js');

const NOW = 1760000000000;
const TODAY = '2025-10-09';

function mkContent(course, withIntros) {
  const items = [
    { id: 'k-1', unit: 'u', type: 'gap', prompt: 'P1', answers: ['x'], entity: 'e-k' },
    { id: 'k-2', unit: 'u', type: 'gap', prompt: 'P2', answers: ['x'], entity: 'e-k' },
    { id: 'k-3', unit: 'u', type: 'gap', prompt: 'P3', answers: ['x'], entity: 'e-k' },
    { id: 'v-1', unit: 'u', type: 'gap', prompt: 'P4', answers: ['x'], explanation: 'E4' },
    { id: 'w-1', unit: 'u', type: 'gap', prompt: 'P5', answers: ['x'] }
  ];
  const content = {
    v: 1, version: 't', lock: items.map((i) => i.id), items,
    course: Object.assign({ id: 'c', title: 'C', units: [{ id: 'u', title: 'U' }], introNew: true }, course)
  };
  if (withIntros !== false) content.intros = [{ id: 'e-k', title: 'Kanji', text: 'T', meta: { kind: 'kanji' } }, { id: 'v-1', title: 'Word' }];
  return content;
}

let dojoP;
const getDojo = () => dojoP || (dojoP = DojoWasm.load(fs.readFileSync(checkWasmFresh())));

async function setup(course, o) {
  o = o || {};
  const doc = { v: 1, t: 0, items: {}, stats: { days: {}, newByDay: {} }, settings: o.settings || {}, exams: {} };
  if (o.intros) doc.intros = o.intros;
  const store = { doc, update(fn) { fn(doc); }, noteAnswer() {}, exportText() { return JSON.stringify(doc); } };
  const content = mkContent(course, o.withIntros);
  const engine = DojoSession.createEngine({ dojo: await getDojo(), store, content, now: () => NOW, today: () => TODAY, random: () => 0.5 });
  return { engine, doc, content };
}

test('introFor: entity intro for the first item, null once marked seen, timestamp stored', async () => {
  const t = await setup();
  const s = t.engine.start('daily');
  const k1 = t.content.items[0];
  assert.strictEqual(s.introFor(k1).id, 'e-k');
  assert.strictEqual(s.introFor(k1).id, 'e-k', 'introFor is pure');
  s.markIntroSeen('e-k');
  assert.strictEqual(t.doc.intros['e-k'], NOW);
  assert.strictEqual(s.introFor(k1), null);
  assert.strictEqual(t.engine.start('daily').introFor(k1), null, 'a new session reads doc.intros');
});

test('introFor: entity-level new check, second item of the entity never re-triggers', async () => {
  const t = await setup();
  const s = t.engine.start('daily');
  const [k1, k2, k3] = t.content.items;
  assert.strictEqual(s.introFor(k2).id, 'e-k', 'same card for any item of an unseen entity');
  s.markIntroSeen(k1);
  assert.strictEqual(s.introFor(k2), null);
  assert.strictEqual(s.introFor(k3), null);
});

test('introFor: a record on a sibling item suppresses the card even when doc.intros is empty', async () => {
  const t = await setup();
  t.doc.items['k-1'] = { s: 1, due: NOW + 1, ok: 1, bad: 0, last: NOW };
  const s = t.engine.start('daily');
  assert.strictEqual(s.introFor(t.content.items[1]), null);
  assert.strictEqual(s.introFor(t.content.items[2]), null);
});

test('introFor: entity defaults to the item id; no intro line, no introNew -> null', async () => {
  const t = await setup();
  const s = t.engine.start('daily');
  assert.strictEqual(s.introFor(t.content.items[3]).id, 'v-1');
  assert.strictEqual(s.introFor(t.content.items[4]), null);
  const off = await setup({ introNew: false });
  assert.strictEqual(off.engine.start('daily').introFor(off.content.items[0]), null);
  const none = await setup(null, { withIntros: false });
  assert.strictEqual(none.engine.start('daily').introFor(none.content.items[0]), null);
});

test('introFor: only in daily sessions (not practice, weak, placement, exam)', async () => {
  const t = await setup({ placement: { perUnit: 1, mode: 'self' }, exam: { passMark: 0.5, minutes: 5, sections: [{ title: 'A', count: 2 }] } });
  t.doc.items['v-1'] = { s: 1, due: NOW + 1, ok: 1, bad: 0, last: NOW };
  for (const mode of ['practice', 'placement', 'exam']) {
    const s = t.engine.start(mode);
    assert.ok(!s.error, mode);
    assert.strictEqual(s.introFor(t.content.items[0]), null, mode);
  }
});

test('markIntroSeen does not consume the new allowance or touch records and stats', async () => {
  const t = await setup(null, { settings: { newPerDay: 2 } });
  const before = t.engine.counts().newToday;
  const s = t.engine.start('daily');
  s.markIntroSeen('e-k');
  s.markIntroSeen('v-1');
  assert.strictEqual(t.engine.counts().newToday, before);
  assert.deepStrictEqual(t.doc.items, {});
  assert.deepStrictEqual(t.doc.stats, { days: {}, newByDay: {} });
});

test('markIntroSeen keeps the earliest timestamp, ignores unknown entities, junk doc.intros is replaced', async () => {
  const t = await setup(null, { intros: { 'e-k': 5 } });
  const s = t.engine.start('daily');
  assert.strictEqual(s.introFor(t.content.items[0]), null);
  s.markIntroSeen('e-k');
  assert.strictEqual(t.doc.intros['e-k'], 5);
  s.markIntroSeen('nope');
  assert.strictEqual(t.doc.intros.nope, undefined);
  const j = await setup(null, { intros: 'junk' });
  const js = j.engine.start('daily');
  assert.strictEqual(js.introFor(j.content.items[0]).id, 'e-k');
  js.markIntroSeen('e-k');
  assert.deepStrictEqual(j.doc.intros, { 'e-k': NOW });
});

test('the legacy explanation intro still works next to introFor', async () => {
  const t = await setup();
  const s = t.engine.start('daily');
  assert.strictEqual(s.shouldShowIntro(t.content.items[3]), true);
});

test('DojoExt.registerIntro: hook gets clones, errors and undefined yield null', () => {
  DojoExt.reset();
  assert.strictEqual(DojoExt.intro({ id: 'a' }, { id: 'i' }, {}), null);
  assert.throws(() => DojoExt.registerIntro('x'), /function required/);
  const intro = { id: 'a', meta: { n: 1 } };
  DojoExt.registerIntro((i, item, ctx) => { i.meta.n = 2; ctx.items.push(1); return { tag: 'card', item: item.id, t: ctx.t }; });
  const items = [];
  assert.deepStrictEqual(DojoExt.intro(intro, { id: 'i' }, { items, records: {}, t: 'T' }), { tag: 'card', item: 'i', t: 'T' });
  assert.strictEqual(intro.meta.n, 1);
  assert.strictEqual(items.length, 0);
  DojoExt.registerIntro(() => undefined);
  assert.strictEqual(DojoExt.intro(intro, {}, {}), null);
  const warn = console.warn; console.warn = () => {};
  DojoExt.registerIntro(() => { throw new Error('x'); });
  assert.strictEqual(DojoExt.intro(intro, {}, {}), null);
  console.warn = warn;
  DojoExt.reset();
  assert.strictEqual(DojoExt.intro(intro, {}, {}), null);
});

test('DojoExt.registerVoiceRank: numeric rank, 0 without hook, on error or non-finite', () => {
  DojoExt.reset();
  assert.strictEqual(DojoExt.voiceRank({ name: 'a' }, 'M'), 0);
  assert.throws(() => DojoExt.registerVoiceRank(1), /function required/);
  DojoExt.registerVoiceRank((v, role) => (v.name === 'Otoya' && role === 'M' ? 5 : NaN));
  assert.strictEqual(DojoExt.voiceRank({ name: 'Otoya' }, 'M'), 5);
  assert.strictEqual(DojoExt.voiceRank({ name: 'Kyoko' }, 'M'), 0);
  const warn = console.warn; console.warn = () => {};
  DojoExt.registerVoiceRank(() => { throw new Error('x'); });
  assert.strictEqual(DojoExt.voiceRank({}, 'M'), 0);
  console.warn = warn;
  DojoExt.reset();
});

test('tagInfo: string and object labels, internal kind, uppercase default', () => {
  const c = { tagLabels: { a: 'Alpha', b: { label: 'Beta', kind: 'internal' }, c: { kind: 'public' }, d: { kind: 'internal' }, e: '' } };
  assert.deepStrictEqual(DojoSession.tagInfo(c, 'a'), { label: 'Alpha', internal: false });
  assert.deepStrictEqual(DojoSession.tagInfo(c, 'b'), { label: 'Beta', internal: true });
  assert.deepStrictEqual(DojoSession.tagInfo(c, 'c'), { label: 'C', internal: false });
  assert.deepStrictEqual(DojoSession.tagInfo(c, 'd'), { label: 'D', internal: true });
  assert.deepStrictEqual(DojoSession.tagInfo(c, 'e'), { label: 'E', internal: false });
  assert.deepStrictEqual(DojoSession.tagInfo(c, 'zz'), { label: 'ZZ', internal: false });
  assert.deepStrictEqual(DojoSession.tagInfo(c, 'constructor'), { label: 'CONSTRUCTOR', internal: false });
  assert.deepStrictEqual(DojoSession.tagInfo({}, 'n5'), { label: 'N5', internal: false });
  assert.deepStrictEqual(DojoSession.tagInfo(null, 'n5'), { label: 'N5', internal: false });
});

test('introFor: intro ids "__proto__" and "constructor" are plain keys, not Object.prototype lookups', async () => {
  const t = await setup();
  t.content.items.push({ id: 'constructor', unit: 'u', type: 'gap', prompt: 'PC', answers: ['x'] });
  t.content.items.push({ id: 'p-1', unit: 'u', type: 'gap', prompt: 'PP', answers: ['x'], entity: '__proto__' });
  t.content.intros.push({ id: '__proto__', title: 'Proto' });
  const engine = DojoSession.createEngine({ dojo: await getDojo(), store: { doc: t.doc, update(fn) { fn(t.doc); }, noteAnswer() {} }, content: t.content, now: () => NOW, today: () => TODAY, random: () => 0.5 });
  const s = engine.start('daily');
  const byId = (id) => t.content.items.find((i) => i.id === id);
  assert.strictEqual(s.introFor(byId('constructor')), null, 'no intro for item id constructor');
  assert.strictEqual(s.introFor(byId('p-1')).title, 'Proto');
  s.markIntroSeen('__proto__');
  assert.strictEqual(s.introFor(byId('p-1')), null, 'seen in this session');
});

test('doc.intros: "__proto__" entity is persisted as an own key and suppresses the card in a new session', async () => {
  const t = await setup();
  t.content.items.push({ id: 'p-1', unit: 'u', type: 'gap', prompt: 'PP', answers: ['x'], entity: '__proto__' });
  t.content.intros.push({ id: '__proto__', title: 'Proto' });
  const mk = () => DojoSession.createEngine({ dojo: t.dojo, store: { doc: t.doc, update(fn) { fn(t.doc); }, noteAnswer() {} }, content: t.content, now: () => NOW, today: () => TODAY, random: () => 0.5 });
  t.dojo = await getDojo();
  const p1 = t.content.items.find((i) => i.id === 'p-1');
  mk().start('daily').markIntroSeen('__proto__');
  assert.ok(Object.prototype.hasOwnProperty.call(t.doc.intros, '__proto__'));
  assert.strictEqual(Object.getPrototypeOf(t.doc.intros), Object.prototype);
  assert.strictEqual(mk().start('daily').introFor(p1), null);
});

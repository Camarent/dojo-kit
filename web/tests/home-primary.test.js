'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { find, findAll, walk, mount, NOW } = require('./app-harness.js');

const ITEMS = [1, 2, 3].map((i) => ({ id: 'a' + i, unit: 'u', type: 'gap', prompt: 'Q' + i, answers: ['a'], explanation: 'e' }));
const COURSE = { learnedStage: 1, units: [{ id: 'u', title: 'U' }] };

async function home(dueIds, course) {
  const m = await mount({ items: ITEMS, course: course || COURSE });
  const items = {};
  ITEMS.forEach((it) => { items[it.id] = dueIds.includes(it.id) ? { s: 0, due: NOW - 86400000 } : { s: 1, due: NOW + 9 * 86400000 }; });
  Object.assign(m.doc.items, items);
  m.app.refresh();
  return m;
}
const cls = (n) => String(n.props.className || n.props.class || '');
const primaries = (m) => { const r = []; walk(m.tree(), (n) => { if (n.type === 'button' && /\bprimary\b/.test(cls(n))) r.push(n); }); return r; };

test('due=0: review is not primary, exactly one primary action (practice)', async () => {
  const m = await home([]);
  assert.ok(!/\bprimary\b/.test(cls(find(m.tree(), 'btn-review'))));
  assert.strictEqual(primaries(m).length, 1);
  assert.ok(/\bprimary\b/.test(cls(find(m.tree(), 'btn-practice'))));
});

test('due>0: review is primary, practice is not', async () => {
  const m = await home(['a1']);
  assert.ok(/\bprimary\b/.test(cls(find(m.tree(), 'btn-review'))));
  assert.ok(!/\bprimary\b/.test(cls(find(m.tree(), 'btn-practice'))));
  assert.strictEqual(primaries(m).length, 1);
});

test('no total-progress bar when course bars are shown', async () => {
  const m = await home(['a1'], Object.assign({ bars: [{ title: 'B', units: ['u'], learnedStage: 1 }] }, COURSE));
  assert.strictEqual(find(m.tree(), 'total-progress'), null);
  const plain = await home(['a1']);
  assert.ok(find(plain.tree(), 'total-progress'));
});

test('due>0 with placement pending: one primary action (placement)', async () => {
  const m = await home(['a1'], Object.assign({ placement: {} }, COURSE));
  assert.strictEqual(primaries(m).length, 1);
  assert.ok(/\bprimary\b/.test(cls(find(m.tree(), 'btn-placement'))));
  assert.ok(!/\bprimary\b/.test(cls(find(m.tree(), 'btn-review'))));
});

test('chip.on global rule is scoped away from catalog chips', () => {
  const css = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'styles', 'app.css'), 'utf8');
  assert.ok(!/^\.chip\.on\b[^{]*\{[^}]*color: var\(--accent-fg\)/m.test(css));
  assert.ok(/\[data-testid="practice"\] \.chip\.on::before/.test(css));
});

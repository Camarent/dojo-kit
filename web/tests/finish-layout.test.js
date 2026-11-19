'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const H = require('./app-harness.js');
const { makeT } = require('../ui/i18n.js');
const { parseCSS } = require('./css-helpers.js');
const ru = require('../i18n/ru.json');
const en = require('../i18n/en.json');

const web = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(web, 'styles/app.css'), 'utf8');

const COURSE = { id: 'c', title: 'C', units: [{ id: 'u', title: 'U' }] };

function mkItems(n) {
  const out = [];
  for (let i = 1; i <= n; i++) out.push({ id: 'i' + i, unit: 'u', type: 'gap', prompt: 'P' + i, answers: ['x'] });
  return out;
}

// Mounts the app once, then renders the Results finish block with nextDue null (the empty state).
async function renderEmptyFinish(t) {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
  const win = H.fakeWin([]);
  win.document = { visibilityState: 'visible', body: { tagName: 'BODY' } };
  win.addEventListener = () => {};
  win.removeEventListener = () => {};
  const m = await H.mount({ win, items: mkItems(2), course: COURSE, setup(sb) {
    sb.setInterval = (f, n) => globalThis.setInterval(f, n);
    sb.clearInterval = (id) => globalThis.clearInterval(id);
  } });
  const finish = { answered: 2, right: 1, weakLeft: 1, nextDue: null, denominator: 2 };
  const t18 = makeT({ ru, en }, 'ru');
  return m.sb.DojoApp._Results({ t: t18, byId: {}, go() {}, onAgain() {}, summary: { finish, review: [], pass: true, estimate: false } });
}

test('finish layout: empty next-due text is a muted label, not a stat value', async (t) => {
  const v = await renderEmptyFinish(t);
  const tile = H.find(v, 'finish-next-due');
  assert.ok(tile, 'next-due tile rendered');
  const emptyText = ru['finish.none'];
  const bs = [];
  H.walk(tile, (n) => { if (n.type === 'b') bs.push(n); });
  assert.ok(!bs.some((b) => H.text(b).includes(emptyText)), 'empty label must not sit inside a .stat b');
  const label = [];
  H.walk(tile, (n) => { if (n.type === 'small' && n.props.class === 'muted') label.push(n); });
  assert.ok(label.some((n) => H.text(n).includes(emptyText)), 'empty label rendered as small.muted');
});

test('finish layout: heading and note are full-width grid rows outside any media query', () => {
  const rules = parseCSS(css, { media: true }).filter((r) => r.media === null);
  for (const sel of ['.session-finish h2', '.session-finish .notice']) {
    const hits = rules.filter((r) => r.selector.split(',').map((s) => s.trim()).includes(sel));
    assert.ok(hits.length > 0, `base rule for ${sel} expected`);
    assert.ok(hits.some((r) => /grid-column:\s*1\s*\/\s*-1/.test(r.declarations)), `base rule for ${sel} sets grid-column: 1 / -1`);
  }
});

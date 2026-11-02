'use strict';
// Characterization of DojoDetail.renderDeclarativeDetail through the catalog detail dialog.

const test = require('node:test');
const assert = require('node:assert');
const H = require('./app-harness.js');

const choice = (id, extra) => Object.assign({ id, unit: 'u1', type: 'choice', prompt: 'Prompt ' + id, options: ['a', 'b', 'c'], answer: 0 }, extra);

async function detailOf(fields, meta) {
  const course = { id: 'c', title: 'C', uiLanguage: 'en', units: [{ id: 'u1', title: 'U' }], detail: { fields } };
  const items = [choice('a', { meta })];
  const m = await H.mount({ items, course });
  m.app.go('catalog');
  const cat = m.screen(m.sb.DojoApp._CatalogScreen);
  cat.setState({ detailItem: items[0] });
  const sec = H.find(cat.view(), 'declarative-detail');
  if (!sec) return null;
  return { ids: H.findAll(sec, /^detail-/).map((n) => n.props['data-testid']), text: H.text(sec) };
}

test('all field types: ids and text pinned', async () => {
  const d = await detailOf([
    { key: 'meta.t', label: 'T' },
    { key: 'meta.n', label: 'N' },
    { key: 'meta.l', label: 'L', type: 'list' },
    { key: 'meta.o', label: 'O', type: 'objects' },
    { key: 'meta.tb', label: 'TB', type: 'table' },
    { key: 'meta.p', label: 'P', type: 'pairs', keys: ['x', 'y'] },
    { key: 'meta.gone', label: 'G' },
    { key: 'meta.empty', label: 'E' },
    { key: 'meta.bad', label: 'B', type: 'list' }
  ], {
    t: 'hello', n: 5, l: ['i1', 2], o: { k1: 'v1', k2: 3 },
    tb: { title: 'Ti', head: ['H1', 'H2'], rows: [['a', 'b'], ['c', 4]] },
    p: [{ x: 'L1', y: 'R1' }, { x: 'only' }, { x: 'L3', y: 7 }], empty: '', bad: []
  });
  assert.deepStrictEqual(d.ids, [
    'detail-field-meta.t', 'detail-meta.t', 'detail-field-meta.n', 'detail-meta.n',
    'detail-field-meta.l', 'detail-meta.l-list',
    'detail-field-meta.o', 'detail-meta.o-table', 'detail-meta.o-k1', 'detail-meta.o-k2',
    'detail-field-meta.tb', 'detail-meta.tb-table', 'detail-meta.tb-title', 'detail-meta.tb-head-0', 'detail-meta.tb-head-1',
    'detail-meta.tb-row-0', 'detail-meta.tb-row-0-col-0', 'detail-meta.tb-row-0-col-1',
    'detail-meta.tb-row-1', 'detail-meta.tb-row-1-col-0', 'detail-meta.tb-row-1-col-1',
    'detail-field-meta.p', 'detail-meta.p-pairs', 'detail-meta.p-pair-0', 'detail-meta.p-pair-0-a', 'detail-meta.p-pair-0-b',
    'detail-meta.p-pair-2', 'detail-meta.p-pair-2-a', 'detail-meta.p-pair-2-b'
  ]);
  assert.strictEqual(d.text, 'T: helloN: 5L: i12O: k1:v1k2:3TB: TiH1H2abc4P: L1R1L37');
});

test('all fields empty or unknown renders nothing', async () => {
  assert.strictEqual(await detailOf([{ key: 'meta.x' }, { key: 'meta.y', type: 'weird' }], { y: 'v' }), null);
});

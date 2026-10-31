'use strict';
// Tests for declarative detail field types `table` and `pairs`.

const test = require('node:test');
const assert = require('node:assert');
const H = require('./app-harness.js');

const choice = (id, unit, extra) => Object.assign({ id, unit, type: 'choice', prompt: 'Prompt ' + id, options: ['a', 'b', 'c'], answer: 0 }, extra);

// Helper to create a course with detail config
function courseWithDetail(detailConfig, units) {
  return Object.assign({
    id: 'test-course',
    title: 'Test Course',
    uiLanguage: 'en',
    units: units || [{ id: 'u1', title: 'Unit 1' }]
  }, detailConfig ? { detail: detailConfig } : {});
}

const tags = (n) => { const r = []; H.walk(n, (x) => r.push(x.type)); return r; };
const hasRawHtml = (n) => { let f = false; H.walk(n, (x) => { if (x.props.dangerouslySetInnerHTML) f = true; }); return f; };

// Helper to create a unit with detail config
function unitWithDetail(id, title, detailConfig) {
  var unit = { id: id, title: title };
  if (detailConfig) unit.detail = detailConfig;
  return unit;
}

test('table field renders title, head cells, and all row cells', async () => {
  const course = courseWithDetail({
    fields: [
      { key: 'meta.tableData', label: 'Table', type: 'table' }
    ]
  });
  const items = [
    choice('a', 'u1', { meta: { tableData: { title: 'Test Table', head: ['H1', 'H2'], rows: [['A1', 'A2'], ['B1', 'B2']] } } })
  ];
  const m = await H.mount({ items, course });
  m.app.go('catalog');
  const cat = m.screen(m.sb.DojoApp._CatalogScreen);
  
  cat.setState({ detailItem: items[0] });
  const v = cat.view();
  
  assert.ok(H.find(v, 'declarative-detail'), 'declarative detail section exists');
  assert.ok(H.find(v, 'detail-meta.tableData-table'), 'table field exists');
  let wrap = null;
  H.walk(H.find(v, 'declarative-detail'), (n) => { if (n.props.class === 'detail-table-wrap') wrap = n; });
  assert.ok(wrap, 'table is wrapped for horizontal scroll');
  assert.ok(H.find(wrap, 'detail-meta.tableData-table'), 'table sits inside the wrapper');
  assert.ok(H.find(v, 'detail-meta.tableData-title'), 'table title exists');
  
  // Check that title, head cells, and row cells are rendered
  const tableText = H.text(H.find(v, 'declarative-detail'));
  assert.ok(/Test Table/.test(tableText), 'table title is rendered');
  assert.ok(/H1/.test(tableText), 'head cell H1 is rendered');
  assert.ok(/H2/.test(tableText), 'head cell H2 is rendered');
  assert.ok(/A1/.test(tableText), 'row cell A1 is rendered');
  assert.ok(/A2/.test(tableText), 'row cell A2 is rendered');
  assert.ok(/B1/.test(tableText), 'row cell B1 is rendered');
  assert.ok(/B2/.test(tableText), 'row cell B2 is rendered');
});

test('pairs field renders both sides of every entry', async () => {
  const course = courseWithDetail({
    fields: [
      { key: 'meta.pairData', label: 'Pairs', type: 'pairs' }
    ]
  });
  const items = [
    choice('a', 'u1', { meta: { pairData: [{ a: 'left1', b: 'right1' }, { a: 'left2', b: 'right2' }] } })
  ];
  const m = await H.mount({ items, course });
  m.app.go('catalog');
  const cat = m.screen(m.sb.DojoApp._CatalogScreen);
  
  cat.setState({ detailItem: items[0] });
  const v = cat.view();
  
  assert.ok(H.find(v, 'declarative-detail'), 'declarative detail section exists');
  assert.ok(H.find(v, 'detail-meta.pairData-pairs'), 'pairs field exists');
  
  // Check that all pair sides are rendered
  const pairsText = H.text(H.find(v, 'declarative-detail'));
  assert.ok(/left1/.test(pairsText), 'pair left1 is rendered');
  assert.ok(/right1/.test(pairsText), 'pair right1 is rendered');
  assert.ok(/left2/.test(pairsText), 'pair left2 is rendered');
  assert.ok(/right2/.test(pairsText), 'pair right2 is rendered');
});

test('pairs field with custom keys renders both sides', async () => {
  const course = courseWithDetail({
    fields: [
      { key: 'meta.pairData', label: 'Pairs', type: 'pairs', keys: ['jp', 'ru'] }
    ]
  });
  const items = [
    choice('a', 'u1', { meta: { pairData: [{ jp: '日本語', ru: 'японский' }] } })
  ];
  const m = await H.mount({ items, course });
  m.app.go('catalog');
  const cat = m.screen(m.sb.DojoApp._CatalogScreen);
  
  cat.setState({ detailItem: items[0] });
  const v = cat.view();
  
  assert.ok(H.find(v, 'declarative-detail'), 'declarative detail section exists');
  
  // Check that custom key pair sides are rendered
  const pairsText = H.text(H.find(v, 'declarative-detail'));
  assert.ok(/日本語/.test(pairsText), 'custom key jp value is rendered');
  assert.ok(/японский/.test(pairsText), 'custom key ru value is rendered');
});

test('table field escapes HTML in cells', async () => {
  const course = courseWithDetail({
    fields: [
      { key: 'meta.htmlTable', label: 'HTML Table', type: 'table' }
    ]
  });
  const items = [
    choice('a', 'u1', { meta: { htmlTable: { title: '<b>Bold</b>', head: ['<script>alert("xss")</script>'], rows: [['<i>italic</i>']] } } })
  ];
  const m = await H.mount({ items, course });
  m.app.go('catalog');
  const cat = m.screen(m.sb.DojoApp._CatalogScreen);
  
  cat.setState({ detailItem: items[0] });
  const v = cat.view();
  
  const node = H.find(v, 'declarative-detail');
  // Values stay text nodes; no raw-HTML injection
  assert.ok(H.text(node).includes('<b>Bold</b>'), 'title HTML is escaped');
  assert.ok(H.text(node).includes('<script>alert("xss")</script>'), 'head HTML is escaped');
  assert.ok(H.text(node).includes('<i>italic</i>'), 'row HTML is escaped');
  assert.deepStrictEqual(tags(node).filter((x) => x === 'script'), [], 'no script element');
  assert.ok(!hasRawHtml(node), 'no dangerouslySetInnerHTML');
});

test('pairs field escapes HTML in sides', async () => {
  const course = courseWithDetail({
    fields: [
      { key: 'meta.htmlPairs', label: 'HTML Pairs', type: 'pairs' }
    ]
  });
  const items = [
    choice('a', 'u1', { meta: { htmlPairs: [{ a: '<b>bold</b>', b: '<script>alert("xss")</script>' }] } })
  ];
  const m = await H.mount({ items, course });
  m.app.go('catalog');
  const cat = m.screen(m.sb.DojoApp._CatalogScreen);
  
  cat.setState({ detailItem: items[0] });
  const v = cat.view();
  
  const node = H.find(v, 'declarative-detail');
  // Values stay text nodes; no raw-HTML injection
  assert.ok(H.text(node).includes('<b>bold</b>'), 'pair a HTML is escaped');
  assert.ok(H.text(node).includes('<script>alert("xss")</script>'), 'pair b HTML is escaped');
  assert.deepStrictEqual(tags(node).filter((x) => x === 'script'), [], 'no script element');
  assert.ok(!hasRawHtml(node), 'no dangerouslySetInnerHTML');
});

test('table without title renders head and rows without caption', async () => {
  const course = courseWithDetail({ fields: [{ key: 'meta.nt', label: 'NT', type: 'table' }] });
  const items = [choice('a', 'u1', { meta: { nt: { head: ['H1'], rows: [['R1']] } } })];
  const m = await H.mount({ items, course });
  m.app.go('catalog');
  const cat = m.screen(m.sb.DojoApp._CatalogScreen);
  cat.setState({ detailItem: items[0] });
  const v = cat.view();
  assert.ok(H.find(v, 'detail-meta.nt-table'), 'table renders without title');
  assert.strictEqual(H.find(v, 'detail-meta.nt-title'), null, 'no caption');
  assert.ok(/R1/.test(H.text(H.find(v, 'declarative-detail'))), 'row rendered');
});

test('table row that is not an array does not throw', async () => {
  const course = courseWithDetail({ fields: [{ key: 'meta.br', label: 'BR', type: 'table' }] });
  const items = [choice('a', 'u1', { meta: { br: { title: 'T', head: ['H'], rows: ['oops', ['ok']] } } })];
  const m = await H.mount({ items, course });
  m.app.go('catalog');
  const cat = m.screen(m.sb.DojoApp._CatalogScreen);
  cat.setState({ detailItem: items[0] });
  const v = cat.view();
  assert.ok(H.find(v, 'detail-meta.br-row-1-col-0'), 'valid row still rendered');
  assert.strictEqual(H.find(v, 'detail-meta.br-row-0-col-0'), null, 'bad row has no cells');
});

test('table with empty rows does not render', async () => {
  const course = courseWithDetail({
    fields: [
      { key: 'meta.emptyTable', label: 'Empty Table', type: 'table' }
    ]
  });
  const items = [
    choice('a', 'u1', { meta: { emptyTable: { title: 'Empty', head: ['H'], rows: [] } } })
  ];
  const m = await H.mount({ items, course });
  m.app.go('catalog');
  const cat = m.screen(m.sb.DojoApp._CatalogScreen);
  
  cat.setState({ detailItem: items[0] });
  const v = cat.view();
  
  // Empty rows should not render
  assert.strictEqual(H.find(v, 'detail-field-meta.emptyTable'), null, 'empty table does not render');
});

test('pairs with empty array does not render', async () => {
  const course = courseWithDetail({
    fields: [
      { key: 'meta.emptyPairs', label: 'Empty Pairs', type: 'pairs' }
    ]
  });
  const items = [
    choice('a', 'u1', { meta: { emptyPairs: [] } })
  ];
  const m = await H.mount({ items, course });
  m.app.go('catalog');
  const cat = m.screen(m.sb.DojoApp._CatalogScreen);
  
  cat.setState({ detailItem: items[0] });
  const v = cat.view();
  
  // Empty pairs should not render
  assert.strictEqual(H.find(v, 'detail-field-meta.emptyPairs'), null, 'empty pairs does not render');
});

test('table with missing a/b in pairs entries are skipped', async () => {
  const course = courseWithDetail({
    fields: [
      { key: 'meta.mixedPairs', label: 'Mixed Pairs', type: 'pairs' }
    ]
  });
  const items = [
    choice('a', 'u1', { meta: { mixedPairs: [{ a: 'valid', b: 'valid' }, { a: 'only-a' }, { b: 'only-b' }] } })
  ];
  const m = await H.mount({ items, course });
  m.app.go('catalog');
  const cat = m.screen(m.sb.DojoApp._CatalogScreen);
  
  cat.setState({ detailItem: items[0] });
  const v = cat.view();
  
  // Only the valid pair should be rendered
  const pairsText = H.text(H.find(v, 'declarative-detail'));
  assert.ok(/valid/.test(pairsText), 'valid pair is rendered');
  // The invalid pairs should not cause errors and should be filtered out
  assert.strictEqual(pairsText.match(/valid/g).length, 2, 'only valid pair appears twice');
});

test('table cells, head and title pass through the course-text hook', async () => {
  const course = Object.assign(courseWithDetail({
    fields: [{ key: 'meta.rt', label: 'RT', type: 'table' }]
  }), { markup: 'ruby' });
  const items = [
    choice('a', 'u1', { meta: { rt: { title: 'T', head: ['h{読|よ}'], rows: [['kanji{読|よ}']] } } })
  ];
  const m = await H.mount({ items, course });
  m.sb.DojoExt.use('ruby');
  m.app.go('catalog');
  const cat = m.screen(m.sb.DojoApp._CatalogScreen);
  cat.setState({ detailItem: items[0] });
  const node = H.find(cat.view(), 'declarative-detail');
  const cell = H.find(node, 'detail-meta.rt-row-0-col-0');
  assert.ok(tags(cell).includes('ruby'), 'cell is rendered through the text hook');
  assert.ok(tags(H.find(node, 'detail-meta.rt-head-0')).includes('ruby'), 'head cell is rendered through the text hook');
});

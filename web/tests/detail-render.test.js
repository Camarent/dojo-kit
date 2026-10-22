'use strict';
// Tests for declarative detail/intro renderer from item.meta.
// Rules:
// - Ruby markup (markup: "ruby") and renderText must be honored.
// - Missing/empty fields are skipped.
// - Text is escaped; no innerHTML.
// - type `list` -> `<ul>`; type `objects` -> rows of "k: v".
// - A registered plugin intro still takes precedence over the declarative one.
// - Unknown field type -> validation error (dojo-core validate).

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

test('declarative detail renders text fields from item.meta', async () => {
  const course = courseWithDetail({
    fields: [
      { key: 'meta.meaning', label: 'Meaning' },
      { key: 'meta.reading', label: 'Reading' }
    ]
  });
  const items = [
    choice('a', 'u1', { meta: { meaning: 'test meaning', reading: 'test reading' } })
  ];
  const m = await H.mount({ items, course });
  m.app.go('catalog');
  const cat = m.screen(m.sb.DojoApp._CatalogScreen);
  
  // Open detail for item a
  cat.setState({ detailItem: items[0] });
  const v = cat.view();
  
  // Check that declarative detail is rendered
  assert.ok(H.find(v, 'declarative-detail'), 'declarative detail section exists');
  assert.ok(H.find(v, 'detail-field-meta.meaning'), 'meaning field exists');
  assert.ok(H.find(v, 'detail-field-meta.reading'), 'reading field exists');
  
  // Check content is present (text should be escaped and rendered)
  const detailText = H.text(H.find(v, 'declarative-detail'));
  assert.ok(/test meaning/.test(detailText), 'meaning value is rendered');
  assert.ok(/test reading/.test(detailText), 'reading value is rendered');
});

test('declarative detail renders list fields as ul from item.meta', async () => {
  const course = courseWithDetail({
    fields: [
      { key: 'meta.tags', label: 'Tags', type: 'list' }
    ]
  });
  const items = [
    choice('a', 'u1', { meta: { tags: ['tag1', 'tag2', 'tag3'] } })
  ];
  const m = await H.mount({ items, course });
  m.app.go('catalog');
  const cat = m.screen(m.sb.DojoApp._CatalogScreen);
  
  cat.setState({ detailItem: items[0] });
  const v = cat.view();
  
  assert.ok(H.find(v, 'declarative-detail'), 'declarative detail section exists');
  assert.ok(H.find(v, 'detail-meta.tags-list'), 'list field exists');
  
  // Check that list items are rendered
  const listText = H.text(H.find(v, 'declarative-detail'));
  assert.ok(/tag1/.test(listText), 'list item 1 is rendered');
  assert.ok(/tag2/.test(listText), 'list item 2 is rendered');
  assert.ok(/tag3/.test(listText), 'list item 3 is rendered');
});

test('declarative detail renders objects fields as table from item.meta', async () => {
  const course = courseWithDetail({
    fields: [
      { key: 'meta.info', label: 'Info', type: 'objects' }
    ]
  });
  const items = [
    choice('a', 'u1', { meta: { info: { level: 'N5', part: 'vocab' } } })
  ];
  const m = await H.mount({ items, course });
  m.app.go('catalog');
  const cat = m.screen(m.sb.DojoApp._CatalogScreen);
  
  cat.setState({ detailItem: items[0] });
  const v = cat.view();
  
  assert.ok(H.find(v, 'declarative-detail'), 'declarative detail section exists');
  assert.ok(H.find(v, 'detail-meta.info-table'), 'objects field exists');
  
  // Check that object rows are rendered
  const tableText = H.text(H.find(v, 'declarative-detail'));
  assert.ok(/level/.test(tableText), 'object key "level" is rendered');
  assert.ok(/N5/.test(tableText), 'object value "N5" is rendered');
  assert.ok(/part/.test(tableText), 'object key "part" is rendered');
  assert.ok(/vocab/.test(tableText), 'object value "vocab" is rendered');
});

test('declarative detail skips empty/missing fields', async () => {
  const course = courseWithDetail({
    fields: [
      { key: 'meta.meaning', label: 'Meaning' },
      { key: 'meta.reading', label: 'Reading' },
      { key: 'meta.nonexistent', label: 'Nonexistent' }
    ]
  });
  const items = [
    choice('a', 'u1', { meta: { meaning: 'test meaning' } })
  ];
  const m = await H.mount({ items, course });
  m.app.go('catalog');
  const cat = m.screen(m.sb.DojoApp._CatalogScreen);
  
  cat.setState({ detailItem: items[0] });
  const v = cat.view();
  
  assert.ok(H.find(v, 'declarative-detail'), 'declarative detail section exists');
  
  // Check that only the non-empty field is rendered
  const detailText = H.text(H.find(v, 'declarative-detail'));
  assert.ok(/test meaning/.test(detailText), 'meaning value is rendered');
  assert.ok(!H.find(v, 'detail-field-meta.reading'), 'reading field is skipped');
  assert.ok(!H.find(v, 'detail-field-meta.nonexistent'), 'nonexistent field is skipped');
});

test('declarative detail escapes HTML in text fields', async () => {
  const course = courseWithDetail({
    fields: [
      { key: 'meta.html', label: 'HTML' }
    ]
  });
  const items = [
    choice('a', 'u1', { meta: { html: '<script>alert("xss")</script>' } })
  ];
  const m = await H.mount({ items, course });
  m.app.go('catalog');
  const cat = m.screen(m.sb.DojoApp._CatalogScreen);
  
  cat.setState({ detailItem: items[0] });
  const v = cat.view();
  
  const node = H.find(v, 'declarative-detail');
  // Values stay text nodes (the view layer escapes them); no raw-HTML injection and no script element.
  assert.ok(H.text(node).includes('<script>alert("xss")</script>'), 'value is a literal text node');
  assert.deepStrictEqual(tags(node).filter((x) => x === 'script'), [], 'no script element');
  assert.ok(!hasRawHtml(node), 'no dangerouslySetInnerHTML');
});

test('declarative detail honors ruby markup', async () => {
  // Set up course with ruby markup
  const course = Object.assign(courseWithDetail({
    fields: [
      { key: 'meta.ruby', label: 'Ruby' }
    ]
  }), { markup: 'ruby' });
  
  const items = [
    choice('a', 'u1', { meta: { ruby: 'kanji{読|よ}' } })
  ];
  const m = await H.mount({ items, course });
  m.sb.DojoExt.use('ruby');
  m.app.go('catalog');
  const cat = m.screen(m.sb.DojoApp._CatalogScreen);
  
  cat.setState({ detailItem: items[0] });
  const v = cat.view();
  
  assert.ok(H.find(v, 'declarative-detail'), 'declarative detail section exists');
  
  // Check that ruby markup is rendered
  const t = tags(H.find(v, 'declarative-detail'));
  assert.ok(t.includes('ruby'), 'ruby element is rendered');
  assert.ok(t.includes('rt'), 'rt element is rendered');
});

test('plugin detail hook takes precedence over declarative detail in catalog', async () => {
  const course = courseWithDetail({
    fields: [
      { key: 'meta.meaning', label: 'Meaning' }
    ]
  });
  const items = [
    choice('a', 'u1', { meta: { meaning: 'test meaning' } })
  ];
  const m = await H.mount({ items, course });
  m.app.go('catalog');
  const cat = m.screen(m.sb.DojoApp._CatalogScreen);
  
  // Register a plugin detail hook
  m.sb.DojoExt.registerDetail(function(item, ctx) {
    return ctx.h('i', { 'data-testid': 'plugin-detail' }, 'Plugin detail');
  });
  
  cat.setState({ detailItem: items[0] });
  const v = cat.view();
  
  // Plugin detail should be present
  assert.ok(H.find(v, 'plugin-detail'), 'plugin detail is rendered');
  // Declarative detail should NOT be present when plugin is registered
  assert.strictEqual(H.find(v, 'declarative-detail'), null, 'declarative detail is not rendered when plugin exists');
});

test('declarative detail with unit-level config overrides course config', async () => {
  const course = courseWithDetail({
    fields: [
      { key: 'meta.courseField', label: 'Course Field' }
    ]
  }, [
    { id: 'u1', title: 'Unit 1' },
    unitWithDetail('u2', 'Unit 2', {
      fields: [
        { key: 'meta.unitField', label: 'Unit Field' }
      ]
    })
  ]);
  
  const items = [
    choice('a', 'u1', { meta: { courseField: 'course value', unitField: 'should not show' } }),
    choice('b', 'u2', { meta: { courseField: 'should not show', unitField: 'unit value' } })
  ];
  const m = await H.mount({ items, course });
  m.app.go('catalog');
  const cat = m.screen(m.sb.DojoApp._CatalogScreen);
  
  // Test u1 item (should use course detail config)
  cat.setState({ detailItem: items[0] });
  let v = cat.view();
  assert.ok(H.find(v, 'detail-field-meta.courseField'), 'course field is rendered for u1');
  assert.strictEqual(H.find(v, 'detail-field-meta.unitField'), null, 'unit field is not rendered for u1');
  
  // Test u2 item (should use unit detail config)
  cat.setState({ detailItem: items[1] });
  v = cat.view();
  assert.ok(H.find(v, 'detail-field-meta.unitField'), 'unit field is rendered for u2');
  assert.strictEqual(H.find(v, 'detail-field-meta.courseField'), null, 'course field is not rendered for u2');
});

test('declarative detail with nested fields', async () => {
  const course = courseWithDetail({
    fields: [
      { 
        key: 'meta.data', 
        label: 'Data',
        type: 'objects',
        fields: [
          { key: 'nested.field', label: 'Nested' }
        ]
      }
    ]
  });
  const items = [
    choice('a', 'u1', { meta: { data: { nested: { field: 'nested value' } } } })
  ];
  const m = await H.mount({ items, course });
  m.app.go('catalog');
  const cat = m.screen(m.sb.DojoApp._CatalogScreen);
  
  cat.setState({ detailItem: items[0] });
  const v = cat.view();
  
  assert.ok(H.find(v, 'declarative-detail'), 'declarative detail section exists');
  // Nested fields in objects type should still be accessible via the path
  const detailText = H.text(H.find(v, 'declarative-detail'));
  assert.ok(/nested/.test(detailText) || /field/.test(detailText), 'object structure is rendered');
});

async function startIntro(meta, detail) {
  const items = [{ id: 'x1', unit: 'u1', type: 'gap', prompt: 'P', answers: ['a'], entity: 'E1', meta }];
  const m = await H.mount({ items, intros: [{ id: 'E1', title: 'Intro One', text: 'Body' }], course: { introNew: true, detail } });
  m.app.startMode('daily', {});
  return { m, scr: m.screen(m.sb.DojoApp._SessionScreen) };
}

test('intro card renders declarative fields below the default title and text', async () => {
  const { scr } = await startIntro({ meaning: 'intro meaning', tags: ['t1', 't2'], empty: '' },
    { fields: [{ key: 'meta.meaning', label: 'Meaning' }, { key: 'meta.tags', label: 'Tags', type: 'list' }, { key: 'meta.empty', label: 'E' }] });
  const v = scr.view();
  assert.ok(H.find(v, 'intro-card'));
  const d = H.find(H.find(v, 'intro-card'), 'declarative-detail');
  assert.ok(d, 'declarative section inside the intro card');
  assert.ok(/intro meaning/.test(H.text(d)));
  assert.strictEqual(H.find(d, 'detail-field-meta.empty'), null);
  assert.strictEqual(H.findAll(d, /-list$/).length, 1);
});

test('intro card: a registered plugin intro takes precedence over declarative fields', async () => {
  const { m, scr } = await startIntro({ meaning: 'm' }, { fields: [{ key: 'meta.meaning', label: 'Meaning' }] });
  m.sb.DojoExt.registerIntro(() => 'PLUGIN');
  const v = scr.view();
  assert.ok(/PLUGIN/.test(H.text(H.find(v, 'intro-hook'))));
  assert.strictEqual(H.find(v, 'declarative-detail'), null);
});

test('labelKey is translated when label is absent', async () => {
  const { scr } = await startIntro({ meaning: 'm' }, { fields: [{ key: 'meta.meaning', labelKey: 'close' }] });
  assert.ok(/Close/i.test(H.text(H.find(scr.view(), 'declarative-detail'))));
});

test('empty detail config fields array does not render', async () => {
  const course = courseWithDetail({ fields: [] });
  const items = [
    choice('a', 'u1', { meta: { meaning: 'test' } })
  ];
  const m = await H.mount({ items, course });
  m.app.go('catalog');
  const cat = m.screen(m.sb.DojoApp._CatalogScreen);
  
  cat.setState({ detailItem: items[0] });
  const v = cat.view();
  
  assert.strictEqual(H.find(v, 'declarative-detail'), null, 'empty fields array does not render');
});

test('declarative detail with empty list in item.meta does not render the list', async () => {
  const course = courseWithDetail({
    fields: [
      { key: 'meta.tags', label: 'Tags', type: 'list' }
    ]
  });
  const items = [
    choice('a', 'u1', { meta: { tags: [] } })
  ];
  const m = await H.mount({ items, course });
  m.app.go('catalog');
  const cat = m.screen(m.sb.DojoApp._CatalogScreen);
  
  cat.setState({ detailItem: items[0] });
  const v = cat.view();
  
  assert.strictEqual(H.find(v, 'declarative-detail'), null, 'empty list does not render');
});

test('declarative detail with null/undefined values in item.meta are skipped', async () => {
  const course = courseWithDetail({
    fields: [
      { key: 'meta.value1', label: 'Value 1' },
      { key: 'meta.value2', label: 'Value 2' }
    ]
  });
  const items = [
    choice('a', 'u1', { meta: { value1: null, value2: undefined } })
  ];
  const m = await H.mount({ items, course });
  m.app.go('catalog');
  const cat = m.screen(m.sb.DojoApp._CatalogScreen);
  
  cat.setState({ detailItem: items[0] });
  const v = cat.view();
  
  assert.strictEqual(H.find(v, 'declarative-detail'), null, 'null/undefined values do not render');
});

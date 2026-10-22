'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const H = require('./app-harness.js');
const DojoWasm = require('../dojo-wasm.js');
const DojoSession = require('../session.js');
const { checkWasmFresh } = require('./loader.js');
const { loadBundle } = require('./load-bundle.js');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const NOW = 1760000000000;
const TODAY = '2025-10-09';

function loadAppWithAllTypes() {
  const sb = { console: { warn() {}, log: console.log } };
  loadBundle(sb, { skip: ['dojo-wasm.js', 'storage.js', 'boot.js'] });
  return sb;
}

function walk(n, fn, out) {
  out = out || [];
  if (Array.isArray(n)) {
    n.forEach((c) => walk(c, fn, out));
    return out;
  }
  if (!n || typeof n !== 'object' || !n.props) return out;
  fn(n, out);
  walk(n.props.children, fn, out);
  return out;
}

const gapItem = { id: 'g1', unit: 'u1', type: 'gap', prompt: 'Gap question', answers: ['answer'] };
const numericItem = { id: 'n1', unit: 'u1', type: 'numeric', prompt: 'Numeric question', answer: 42, tolerance: 1 };
const clozeItem = { id: 'c1', unit: 'u1', type: 'cloze', prompt: 'Cloze question', parts: ['The ', ['answer'], ' is here.'] };

function findInputs(node, out) {
  out = out || [];
  if (Array.isArray(node)) {
    node.forEach((c) => findInputs(c, out));
    return out;
  }
  if (!node || typeof node !== 'object' || !node.props) return out;
  if (node.type === 'input' || node.type === 'select' || node.type === 'textarea') {
    out.push(node);
  }
  findInputs(node.props.children, out);
  return out;
}

async function openCatalog() {
  const m = await H.mount({ items: [gapItem] });
  m.app.go('catalog');
  const cat = m.screen(m.sb.DojoApp._CatalogScreen);
  return { m, cat };
}

async function openHome() {
  const course = { id: 'c', title: 'C', units: [{ id: 'u1', title: 'U1' }], groups: [{ id: 'g1', title: 'G1', units: ['u1'], extraNew: true, extraTags: ['tag1'] }] };
  const m = await H.mount({ items: [gapItem], course });
  m.app.go('home');
  return { m };
}

async function openSession(item) {
  const sb = loadAppWithAllTypes();
  const dojo = await DojoWasm.load(fs.readFileSync(checkWasmFresh()));
  const course = { id: 'c', title: 'C', units: [{ id: 'u1', title: 'U1' }] };
  const content = { v: 1, course, items: [item], stimuli: [], version: 't', lock: [item.id] };
  const doc = { v: 1, t: 0, items: {}, stats: { days: {}, newByDay: {} }, settings: {}, exams: {} };
  const store = { doc, status: 'ok', update(fn) { fn(doc); doc.t = NOW; }, flush() {}, noteAnswer() {}, exportText: () => '' };
  const engine = DojoSession.createEngine({ dojo, store, content, now: () => NOW, today: () => TODAY, random: () => 0.5 });
  const en = JSON.parse(read('i18n/en.json'));
  const ru = JSON.parse(read('i18n/ru.json'));
  const t = sb.DojoApp._makeT({ en, ru }, 'en');
  const byId = {};
  byId[item.id] = item;
  const win = { addEventListener() {}, removeEventListener() {}, document: {} };
  const app = new sb.DojoApp._App({ store, engine, dojo, t, content, course, byId, now: () => NOW, today: () => TODAY, win, lang: 'en' });
  app.setState = function (p) { this.state = Object.assign({}, this.state, typeof p === 'function' ? p(this.state) : p); };
  app.startMode('practice', { types: [item.type] });
  const session = engine.start('practice', { types: [item.type] });
  const sc = new sb.DojoApp._SessionScreen({ t: t, lang: 'en', session: session, now: () => NOW, win: win, course: course, content: content, store: store, dojo: dojo });
  sc.setState = function (p) { this.state = Object.assign({}, this.state, typeof p === 'function' ? p(this.state) : p); };
  sc.view = () => H.expand(sc.render(sc.props, sc.state));
  sc.state = sc.fresh(session.current());
  return { sb, sc, t };
}

function assertAllHaveIdOrName(elements, context) {
  const failing = [];
  for (const el of elements) {
    const id = el.props.id;
    const name = el.props.name;
    if (!id && !name) {
      failing.push({ type: el.type, testid: el.props['data-testid'], context });
    }
  }
  if (failing.length > 0) {
    const details = failing.map((f) => `${f.context}: ${f.type}${f.testid ? '[' + f.testid + ']' : ''}`).join('; ');
    assert.fail(`Form fields missing id or name: ${details}`);
  }
}

test('catalog screen: all inputs have id or name', async () => {
  const { cat } = await openCatalog();
  const inputs = findInputs(cat.view());
  assertAllHaveIdOrName(inputs, 'catalog');
});

test('home screen with extra-new group: all inputs have id or name', async () => {
  const { m } = await openHome();
  const tree = m.tree();
  const inputs = findInputs(tree);
  assertAllHaveIdOrName(inputs, 'home');
});

test('gap question: all inputs have id or name', async () => {
  const { sc } = await openSession(gapItem);
  const tree = sc.view();
  const inputs = findInputs(H.expand(tree));
  assertAllHaveIdOrName(inputs, 'gap');
});

test('numeric question: all inputs have id or name', async () => {
  const { sc } = await openSession(numericItem);
  const tree = sc.view();
  const inputs = findInputs(H.expand(tree));
  assertAllHaveIdOrName(inputs, 'numeric');
});

test('cloze question: all inputs have id or name', async () => {
  const { sc } = await openSession(clozeItem);
  const tree = sc.view();
  const inputs = findInputs(H.expand(tree));
  assertAllHaveIdOrName(inputs, 'cloze');
});

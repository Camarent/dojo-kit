'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');
const { buildReviewPage } = require('../tools/review-audio.js');

const BYTES = Uint8Array.from([1, 2, 3, 4, 5, 6]);
const ROWS = [
  { clip: 'a', text: 'alpha' },
  { clip: 'b', text: '<img src=x onerror=alert(1)>', tr: '<img src=y onerror=alert(2)>', group: 'G1' },
  { clip: 'c', text: "q'\"&", group: 'G2' },
  { clip: 'd', text: 'delta', group: 'G1' },
];

function tmpManifest(clips, enc) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rev-'));
  const p = path.join(dir, 'manifest.json');
  fs.writeFileSync(p, JSON.stringify({ packs: [{ file: 'p0', enc }], clips }));
  return p;
}
const CLIPS = { a: { pack: 0, off: 1, len: 3, text: 'x</script><b>' }, b: { pack: 0, off: 0, len: 2 }, c: { pack: 0, off: 0, len: 1 }, d: { pack: 0, off: 0, len: 1 } };

function runPage(html, enc, failFetch) {
  const handlers = {};
  const els = {};
  const mk = (id) => (els[id] = els[id] || { value: '', textContent: '' });
  const btn = (kind, id) => ({ dataset: { [kind]: id }, addEventListener: (_, fn) => { handlers[kind + ':' + id] = fn; } });
  const buttons = (kind) => [...html.matchAll(new RegExp(`<button[^>]*data-${kind}="([^"]*)"`, 'g'))].map((m) => btn(kind, m[1]));
  const decoded = [];
  const bytes = enc === 'base64' ? Buffer.from(BYTES).toString('base64') : null;
  const win = {
    fetch: async () => ({ ok: !failFetch, status: 404, arrayBuffer: async () => BYTES.buffer.slice(0), text: async () => bytes }),
    AudioContext: function () {
      this.destination = {};
      this.decodeAudioData = (buf, ok) => { decoded.push(Array.from(new Uint8Array(buf))); ok({ duration: 1 }); };
      this.createBufferSource = () => { const s = { connect() {}, stop() {}, start() { setImmediate(() => s.onended()); } }; return s; };
    },
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    setTimeout, clearTimeout,
  };
  const document = {
    getElementById: mk,
    querySelectorAll: (sel) => buttons(/data-(\w+)/.exec(sel)[1]),
  };
  const ctx = { document, console, setTimeout, clearTimeout, Uint8Array, Promise, Object, JSON, Math, atob: win.atob, fetch: win.fetch, AudioContext: win.AudioContext };
  ctx.self = ctx; ctx.window = ctx;
  vm.createContext(ctx);
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>\s*(?=<script>|<\/body>)/g)].map((m) => m[1]);
  assert.strictEqual(scripts.length, 2);
  scripts.forEach((s) => vm.runInContext(s, ctx));
  return { handlers, els, decoded };
}

test('play row from raw pack decodes the clip bytes', async () => {
  const html = buildReviewPage({ manifestPath: tmpManifest(CLIPS, 'raw'), rows: ROWS });
  const r = runPage(html, 'raw');
  r.handlers['play:a']();
  await new Promise((res) => setTimeout(res, 50));
  assert.deepStrictEqual(r.decoded, [[2, 3, 4]]);
});

test('play row from base64 pack decodes the clip bytes', async () => {
  const html = buildReviewPage({ manifestPath: tmpManifest(CLIPS, 'base64'), rows: ROWS });
  const r = runPage(html, 'base64');
  r.handlers['play:a']();
  await new Promise((res) => setTimeout(res, 50));
  assert.deepStrictEqual(r.decoded, [[2, 3, 4]]);
});

test('play failure is shown in the page', async () => {
  const html = buildReviewPage({ manifestPath: tmpManifest(CLIPS, 'raw'), rows: ROWS });
  const r = runPage(html, 'raw', true);
  r.handlers['play:a']();
  await new Promise((res) => setTimeout(res, 50));
  assert.match(r.els.err.textContent, /play failed/);
});

test('flag toggles export sorted ids and unflag removes', () => {
  const html = buildReviewPage({ manifestPath: tmpManifest(CLIPS, 'raw'), rows: ROWS });
  const r = runPage(html, 'raw');
  const out = () => JSON.parse(r.els.out.value);
  assert.deepStrictEqual(out(), { v: 1, ids: [] });
  r.handlers['flag:c'](); r.handlers['flag:a']();
  assert.deepStrictEqual(out(), { v: 1, ids: ['a', 'c'] });
  r.handlers['flag:c']();
  assert.deepStrictEqual(out(), { v: 1, ids: ['a'] });
});

test('untrusted text, tr and manifest strings are escaped', () => {
  const html = buildReviewPage({ manifestPath: tmpManifest(CLIPS, 'raw'), rows: ROWS });
  assert.ok(!/<img/i.test(html));
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(html.includes('&lt;img src=y onerror=alert(2)&gt;'));
  assert.ok(html.includes('q&#39;&quot;&amp;'));
  assert.ok(!html.includes('x</script><b>'));
  assert.strictEqual((html.match(/<\/script>/g) || []).length, 2);
});

test('group headings once each in input order, ungrouped first; every row present', () => {
  const html = buildReviewPage({ manifestPath: tmpManifest(CLIPS, 'raw'), rows: ROWS });
  const h = [...html.matchAll(/<h2>(.*?)<\/h2>/g)].map((m) => m[1]);
  assert.deepStrictEqual(h, ['G1', 'G2']);
  assert.ok(html.indexOf('data-row="a"') < html.indexOf('<h2>G1'));
  assert.strictEqual((html.match(/class="row"/g) || []).length, ROWS.length);
});

test('CLI writes the page and rejects bad usage', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'revcli-'));
  const rows = path.join(dir, 'rows.json'), out = path.join(dir, 'o.html');
  fs.writeFileSync(rows, JSON.stringify(ROWS));
  const tool = path.join(__dirname, '..', 'tools', 'review-audio.js');
  execFileSync('node', [tool, tmpManifest(CLIPS, 'raw'), rows, out]);
  assert.ok(fs.readFileSync(out, 'utf8').includes('DojoAudio.configure'));
  assert.throws(() => execFileSync('node', [tool], { stdio: 'pipe' }));
});

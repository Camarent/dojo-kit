// Checks .github/workflows/pages.yml by line checks (no YAML parser): triggers, least-privilege
// permissions, SHA-pinned actions, build order (wasm, dojo build, URL scan, upload). The scan
// command is read from pages.yml and run with bash -e, as GitHub does. The sub-path check serves
// a build under /dojo-kit/ and fetches every asset its HTML names: a fixture, then the real showcase.
const { test, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawnSync } = require('node:child_process');

const REPO = path.join(__dirname, '..');
const PAGES_YML = fs.readFileSync(path.join(REPO, '.github', 'workflows', 'pages.yml'), 'utf8');

// Trimmed lines of the workflow, in order.
const lines = PAGES_YML.split('\n').map((l) => l.trim());

// Body of the scan step's `run: |` block, dedented to column 0.
const SCAN_BODY = (() => {
  const start = PAGES_YML.indexOf('Fail on root-absolute URLs');
  const end = PAGES_YML.indexOf('- uses: actions/upload-pages-artifact');
  if (start < 0 || end < start) return null;
  const block = PAGES_YML.slice(start, end).split('\n').slice(1);
  const body = block.filter((l) => l.startsWith('          ') || l.trim() === '');
  return body.map((l) => l.replace(/^ {10}/, '')).join('\n');
})();

// Extended regex of the scan's grep line, as the grep reads it: bash keeps `\(` and unescapes `\"`.
const SCAN_ERE = (() => {
  const m = /grep -rEn "(.*)" dist\/showcase/.exec(PAGES_YML);
  return m ? m[1].replace(/\\"/g, '"') : null;
})();
const ABS_URL = SCAN_ERE === null ? null : new RegExp(SCAN_ERE);

test('pages.yml runs on master push and manually', () => {
  assert.ok(lines.includes('branches: [master]'));
  assert.ok(lines.includes('workflow_dispatch:'));
});

test('top-level permissions are read-only; deploy job gets pages and id-token write', () => {
  assert.strictEqual(lines[lines.indexOf('permissions:') + 1], 'contents: read');
  const deploy = PAGES_YML.slice(PAGES_YML.indexOf('  deploy:'));
  assert.match(deploy, /pages: write/);
  assert.match(deploy, /id-token: write/);
  assert.match(deploy, /name: github-pages/);
});

test('concurrency group is pages', () => {
  assert.ok(lines.includes('group: pages'));
});

test('every action is pinned to a 40-hex SHA with a version comment', () => {
  const uses = lines.filter((l) => l.includes('uses: '));
  assert.ok(uses.length >= 5);
  for (const u of uses) assert.match(u, /@[0-9a-f]{40} # \S+/, u);
});

test('wasm build runs before dojo build, which runs before the URL scan and the upload', () => {
  const at = (s) => lines.findIndex((l) => l.includes(s));
  const wasm = at('scripts/build-wasm.sh');
  const build = at('./dojo build examples/showcase');
  const scan = at('grep -rEn');
  const upload = at('upload-pages-artifact@');
  assert.ok(wasm >= 0 && build > wasm && scan > build && upload > scan);
});

test('scan pattern is read from pages.yml and flags root-absolute URLs only', () => {
  assert.ok(ABS_URL, 'grep -rEn "..." dist/showcase line not found in pages.yml');
  assert.match('<link href="/style.css">', ABS_URL);
  assert.match('<script src="/app.js"></script>', ABS_URL);
  assert.match("fetch('/data/content.json')", ABS_URL);
  assert.match('a{background:url(/bg.png)}', ABS_URL);
  assert.doesNotMatch('var r = /url\\(\\/x\\)/;', ABS_URL);
  assert.doesNotMatch('<a href="index.html">', ABS_URL);
});

// Temp dirs made by tmpDir() are removed when the file's tests end, also after a failure.
const tmpDirs = [];
after(() => { for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true }); });
function tmpDir(prefix) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tmpDirs.push(d);
  return d;
}

// Runs the workflow's scan step in a directory, as GitHub runs it (bash -e from the repo root).
function runScan(cwd) {
  return spawnSync('bash', ['-e', '-c', SCAN_BODY], { cwd, encoding: 'utf8' });
}

test('scan step fails when dist/showcase is missing', () => {
  assert.ok(SCAN_BODY, 'scan step block not found in pages.yml');
  const dir = tmpDir('pages-scan-');
  const r = runScan(dir);
  assert.notStrictEqual(r.status, 0, r.stderr);
});

test('scan step passes on clean output and fails on a root-absolute URL', () => {
  const dir = tmpDir('pages-scan-');
  const out = path.join(dir, 'dist', 'showcase');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'index.html'), '<a href="index.html">x</a>');
  assert.strictEqual(runScan(dir).status, 0);
  fs.writeFileSync(path.join(out, 'index.html'), '<script src="/app.js"></script>');
  assert.strictEqual(runScan(dir).status, 1);
});

// Serves `dir` only under the /dojo-kit/ prefix, as a GitHub Pages project site does.
function serveUnderSubpath(dir) {
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://local').pathname;
    const prefix = '/dojo-kit/';
    const rel = pathname.startsWith(prefix) ? pathname.slice(prefix.length) : null;
    const file = rel === null ? null : path.resolve(dir, rel || 'index.html');
    const ok = file && file.startsWith(dir + path.sep) && fs.existsSync(file) && fs.statSync(file).isFile();
    if (!ok) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200);
    res.end(fs.readFileSync(file));
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

// Every href/src/url()/fetch() target of the page at /dojo-kit/index.html that does not load (not 200).
async function unloadedRefs(dir) {
  const server = await serveUnderSubpath(dir);
  try {
    const base = `http://127.0.0.1:${server.address().port}/dojo-kit/index.html`;
    const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
    const refs = [...html.matchAll(/(?:href|src)="([^"]*)"|url\(([^)]*)\)|fetch\('([^']*)'\)/g)]
      .map((m) => m[1] ?? m[2] ?? m[3])
      .filter((r) => r && !r.startsWith('#') && !r.startsWith('data:') && !r.startsWith('http'));
    const bad = [];
    for (const ref of refs) {
      const res = await fetch(new URL(ref, base));
      if (res.status !== 200) bad.push(ref);
    }
    return bad;
  } finally {
    server.close();
  }
}

test('sub-path check: relative assets load under /dojo-kit/', async () => {
  const dir = tmpDir('pages-subpath-');
  fs.writeFileSync(path.join(dir, 'index.html'),
    '<link rel="stylesheet" href="app.css"><script src="app.js"></script><a href="#top">t</a>');
  fs.writeFileSync(path.join(dir, 'app.css'), 'body{background:url(bg.png)}');
  fs.writeFileSync(path.join(dir, 'app.js'), '');
  fs.writeFileSync(path.join(dir, 'bg.png'), '');
  assert.deepStrictEqual(await unloadedRefs(dir), []);
});

// Builds examples/showcase as the workflow does (needs the wasm from scripts/build-wasm.sh), then
// runs the workflow's scan step and the /dojo-kit/ load check on the real output.
test('real showcase build: scan passes and every ref loads under /dojo-kit/', async () => {
  const root = tmpDir('pages-build-');
  const dist = path.join(root, 'dist');
  const b = spawnSync(path.join(REPO, 'dojo'), ['build', 'examples/showcase', '--out', dist],
    { cwd: REPO, encoding: 'utf8', timeout: 300000 });
  assert.strictEqual(b.status, 0, b.stderr);
  const scan = runScan(root);
  assert.strictEqual(scan.status, 0, scan.stderr);
  assert.deepStrictEqual(await unloadedRefs(path.join(dist, 'showcase')), []);
});

test('sub-path check: a root-absolute asset does not load under /dojo-kit/', async () => {
  const dir = tmpDir('pages-subpath-');
  fs.writeFileSync(path.join(dir, 'index.html'), '<script src="/app.js"></script>');
  fs.writeFileSync(path.join(dir, 'app.js'), '');
  assert.deepStrictEqual(await unloadedRefs(dir), ['/app.js']);
});

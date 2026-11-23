// Checks .github/workflows/release.yml by line checks (no YAML parser): tag trigger, least-privilege
// permissions per job, SHA-pinned actions, no secrets or network steps, the smoke build of an unpacked
// archive, and the create-or-upload publish logic.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.join(__dirname, '..');
const RELEASE_YML = fs.readFileSync(path.join(REPO, '.github', 'workflows', 'release.yml'), 'utf8');
const PAGES_YML = fs.readFileSync(path.join(REPO, '.github', 'workflows', 'pages.yml'), 'utf8');

// Trimmed lines of the workflow, in order.
const lines = RELEASE_YML.split('\n').map((l) => l.trim());

// Text of one job: from its `  <name>:` header to the next job header (or end of file).
function jobText(name) {
  const start = RELEASE_YML.indexOf(`\n  ${name}:\n`);
  if (start < 0) return null;
  const rest = RELEASE_YML.slice(start + 1);
  const next = rest.slice(1).search(/\n {2}[a-z-]+:\n/);
  return next < 0 ? rest : rest.slice(0, next + 1);
}

const BUILD = jobText('build');
const PUBLISH = jobText('publish');

test('release.yml runs on version tag push only', () => {
  assert.ok(lines.includes("tags: ['v*']"));
  assert.ok(!lines.includes('branches: [master]'));
  assert.ok(!lines.includes('workflow_dispatch:'));
});

test('step names with a colon are quoted (unquoted ": " breaks YAML parsing)', () => {
  for (const l of lines.filter((x) => x.startsWith('- name: '))) {
    assert.doesNotMatch(l, /^- name: [^"'].*: /, l);
  }
});

test('top-level permissions are read-only', () => {
  assert.strictEqual(lines[lines.indexOf('permissions:') + 1], 'contents: read');
});

test('build job has read-only permissions; publish job alone gets contents: write', () => {
  assert.ok(BUILD && PUBLISH, 'build and publish jobs must exist');
  assert.match(BUILD, /permissions:\n {6}contents: read\n/);
  assert.doesNotMatch(BUILD, /contents: write/);
  assert.match(PUBLISH, /permissions:\n {6}contents: write/);
  assert.match(PUBLISH, /needs: build/);
  assert.strictEqual((RELEASE_YML.match(/contents: write/g) || []).length, 1);
});

test('every action is pinned to a 40-hex SHA with a version comment', () => {
  const uses = lines.filter((l) => l.includes('uses: '));
  assert.ok(uses.length >= 4);
  for (const u of uses) assert.match(u, /@[0-9a-f]{40} # \S+/, u);
});

test('checkout SHA matches the one pages.yml pins', () => {
  const pin = (text) => /actions\/checkout@([0-9a-f]{40})/.exec(text)[1];
  assert.strictEqual(pin(RELEASE_YML), pin(PAGES_YML));
});

test('no secrets beyond GITHUB_TOKEN and no network commands in run steps', () => {
  assert.doesNotMatch(RELEASE_YML, /secrets\./);
  assert.match(RELEASE_YML, /\$\{\{ github\.token \}\}/);
  for (const l of lines.filter((x) => x.startsWith('run:') || x.startsWith('- run:'))) {
    assert.doesNotMatch(l, /\b(curl|wget|Invoke-WebRequest)\b/, l);
  }
  assert.doesNotMatch(RELEASE_YML, /\b(curl|wget)\b/);
});

test('build packs the archive, then smoke-builds the showcase from an empty unpacked dir', () => {
  const at = (s) => lines.findIndex((l) => l.includes(s));
  const pack = at('scripts/package-release.sh "$GITHUB_REF_NAME" dist');
  const mk = at('mkdir "$smoke"');
  const unpack = at('tar -xzf "dist/dojo-${GITHUB_REF_NAME}-linux-x86_64.tar.gz" -C "$smoke"');
  const cd = at('cd "$smoke"');
  const build = at('./dojo build "$GITHUB_WORKSPACE/examples/showcase" --out "$smoke/out"');
  const check = at('if [ ! -f "$smoke/out/showcase/index.html" ]; then');
  assert.ok(pack >= 0 && mk > pack && unpack > mk && cd > unpack && build > cd && check > build);
  // wasm and web come only from the unpacked folder: no override flags.
  assert.doesNotMatch(BUILD, /--wasm|--web/);
});

test('publish creates the release only when gh release view fails, else uploads with --clobber', () => {
  const view = PUBLISH.indexOf('if gh release view "$TAG"');
  const upload = PUBLISH.indexOf('gh release upload "$TAG" dist/* --clobber');
  const create = PUBLISH.indexOf('gh release create "$TAG" dist/*');
  assert.ok(view >= 0 && upload > view && create > upload);
  assert.match(PUBLISH, /download-artifact@[0-9a-f]{40}/);
  assert.match(PUBLISH, /name: release\n {10}path: dist/);
});

test('rust toolchain targets come from rust-toolchain.toml, not a targets input in release.yml', () => {
  assert.doesNotMatch(RELEASE_YML, /^\s*targets:/m);
});

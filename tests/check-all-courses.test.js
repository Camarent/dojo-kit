// --with-courses of scripts/check-all.sh, in a stub repo whose course-test.sh logs its argument.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO = path.join(__dirname, '..');
const SCRIPT = fs.readFileSync(path.join(REPO, 'scripts', 'check-all.sh'));
const OK = '#!/usr/bin/env bash\nexit 0\n';

function run(args, courses) {
  const root = path.join(REPO, '.check-all-courses-' + process.pid + '-' + Math.random().toString(36).slice(2));
  const write = (rel, body, mode) => {
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body, { mode: mode || 0o644 });
  };
  try {
    write('scripts/check-all.sh', SCRIPT, 0o755);
    write('scripts/build-wasm.sh', OK, 0o755);
    write('scripts/course-test.sh',
      '#!/usr/bin/env bash\necho "COURSE-TEST $1"\n[ -f "$1/fail" ] && exit 1\nexit 0\n', 0o755);
    write('tests/wasm-smoke.js', '');
    write('tests/gen-vectors.js', '');
    write('tests/hooks-test.sh', OK, 0o755);
    write('bin/cargo', OK, 0o755);
    write('bin/node', OK, 0o755);
    for (const [name, files] of Object.entries(courses)) {
      for (const f of files) write(`workspace/${name}/${f}`, '');
    }
    spawnSync('git', ['init', '-q'], { cwd: root });
    const res = spawnSync('bash', [path.join(root, 'scripts', 'check-all.sh'), ...args], {
      cwd: root,
      env: { PATH: path.join(root, 'bin') + path.delimiter + process.env.PATH, HOME: root },
      encoding: 'utf8',
    });
    return { status: res.status, out: res.stdout + res.stderr };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('no courses: prints a line, exit 0', () => {
  const r = run(['--with-courses'], {});
  assert.strictEqual(r.status, 0, r.out);
  assert.match(r.out, /no courses/);
  assert.match(r.out, /CHECK-ALL OK/);
});

test('passing course: course-test.sh gets its dir', () => {
  const r = run(['--with-courses'], { a: ['course.json'] });
  assert.strictEqual(r.status, 0, r.out);
  assert.match(r.out, /COURSE-TEST workspace\/a/);
});

test('failing course fails the script', () => {
  const r = run(['--with-courses'], { a: ['course.json', 'fail'] });
  assert.notStrictEqual(r.status, 0);
  assert.match(r.out, /CHECK-ALL FAILED at course-test workspace\/a/);
});

test('dir without course.json is ignored', () => {
  const r = run(['--with-courses'], { a: ['course.json'], b: ['x.txt'] });
  assert.strictEqual(r.status, 0, r.out);
  assert.doesNotMatch(r.out, /workspace\/b/);
});

test('default run never touches workspace/', () => {
  const r = run([], { a: ['course.json', 'fail'] });
  assert.strictEqual(r.status, 0, r.out);
  assert.doesNotMatch(r.out, /COURSE-TEST/);
});

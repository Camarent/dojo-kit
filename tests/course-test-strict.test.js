// course-test.sh runs `dojo validate --strict` first: a warning fails the course, a clean course passes.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO = path.join(__dirname, '..');

function run(withWarning) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'course-strict-'));
  try {
    const dir = path.join(tmp, 'c');
    fs.cpSync(path.join(REPO, 'examples', 'demo'), dir, { recursive: true });
    if (withWarning) {
      const f = path.join(dir, 'content', 'math.jsonl');
      const first = fs.readFileSync(f, 'utf8').split('\n')[0];
      fs.appendFileSync(f, first.replace('"id":"math-1"', '"id":"math-99"') + '\n');
    }
    const env = { ...process.env, DOJO_QRUN: '', DOJO_KIT_ROOT: '' };
    delete env.NODE_TEST_CONTEXT;
    const r = spawnSync('bash', [path.join(REPO, 'scripts', 'course-test.sh'), dir], { encoding: 'utf8', env });
    return { status: r.status, out: r.stdout + r.stderr };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

test('clean course: exit 0', () => {
  const r = run(false);
  assert.strictEqual(r.status, 0, r.out);
});

test('course with one validate warning: exit 1', () => {
  const r = run(true);
  assert.match(r.out, /duplicate_prompt/);
  assert.strictEqual(r.status, 1, r.out);
});

// validate-examples.sh runs `dojo validate --strict` on each shipped example: all clean exit 0, a broken course exits non-zero.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO = path.join(__dirname, '..');
const SCRIPT = path.join(REPO, 'scripts', 'validate-examples.sh');

function runScript(args) {
  const env = { ...process.env, DOJO_QRUN: '', DOJO_KIT_ROOT: '' };
  delete env.NODE_TEST_CONTEXT;
  const r = spawnSync('bash', [SCRIPT, ...args], { encoding: 'utf8', env, cwd: os.tmpdir() });
  return { status: r.status, out: r.stdout + r.stderr };
}

test('shipped examples: exit 0', () => {
  const r = runScript([]);
  assert.strictEqual(r.status, 0, r.out);
});

test('mutated example with a broken course.json field: exit non-zero', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'validate-examples-'));
  try {
    const dir = path.join(tmp, 'demo');
    fs.cpSync(path.join(REPO, 'examples', 'demo'), dir, { recursive: true });
    const f = path.join(dir, 'course.json');
    const course = JSON.parse(fs.readFileSync(f, 'utf8'));
    course.exam.passMark = 'high';
    fs.writeFileSync(f, JSON.stringify(course, null, 2));
    const r = runScript([dir]);
    assert.notStrictEqual(r.status, 0, r.out);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

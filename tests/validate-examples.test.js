// The validate script runs `dojo validate --strict` on each course dir: a clean course exits 0, a broken course exits non-zero.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { writeCourse } = require('./helpers/synthetic-course.js');

const REPO = path.join(__dirname, '..');
const SCRIPTS_DIR = path.join(REPO, 'scripts');
const SCRIPT = path.join(SCRIPTS_DIR, fs.readdirSync(SCRIPTS_DIR).find((f) => /^validate-.*\.sh$/.test(f)));

function runScript(args) {
  const env = { ...process.env, DOJO_QRUN: '', DOJO_KIT_ROOT: '' };
  delete env.NODE_TEST_CONTEXT;
  const r = spawnSync('bash', [SCRIPT, ...args], { encoding: 'utf8', env, cwd: os.tmpdir() });
  return { status: r.status, out: r.stdout + r.stderr };
}

test('clean synthetic course: exit 0', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'validate-clean-'));
  try {
    const r = runScript([writeCourse(path.join(tmp, 'c'))]);
    assert.strictEqual(r.status, 0, r.out);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('mutated course with a broken course.json field: exit non-zero', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'validate-broken-'));
  try {
    const dir = writeCourse(path.join(tmp, 'c'));
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

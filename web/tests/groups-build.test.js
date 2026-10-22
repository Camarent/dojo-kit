'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');

test('./dojo build of a small course with groups, bars and entities keeps them in content.json', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dojo-groups-'));
  const src = path.join(tmp, 'course');
  fs.cpSync(path.join(ROOT, 'examples', 'demo'), src, { recursive: true });
  const cp = path.join(src, 'course.json');
  const course = JSON.parse(fs.readFileSync(cp, 'utf8'));
  course.groups = [{ id: 'g', title: 'G', units: ['geo', 'math'], newPerDay: 2, extraNew: true, extraTags: ['capitals'] }];
  course.bars = [{ title: 'Caps', tags: ['capitals'], learnedStage: 1 }];
  fs.writeFileSync(cp, JSON.stringify(course));
  const gp = path.join(src, 'content', 'geo.jsonl');
  const lines = fs.readFileSync(gp, 'utf8').split('\n');
  lines[0] = JSON.stringify(Object.assign(JSON.parse(lines[0]), { entity: 'E1' }));
  fs.writeFileSync(gp, lines.join('\n'));
  const out = path.join(tmp, 'out');
  const r = spawnSync(path.join(ROOT, 'dojo'), ['build', src, '--out', out], { cwd: ROOT, encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr);
  const content = JSON.parse(fs.readFileSync(path.join(out, 'demo', 'data', 'content.json'), 'utf8'));
  assert.strictEqual(content.course.groups[0].id, 'g');
  assert.strictEqual(content.course.bars[0].title, 'Caps');
  assert.ok(content.items.some((i) => i.entity === 'E1'));
  fs.rmSync(tmp, { recursive: true, force: true });
});

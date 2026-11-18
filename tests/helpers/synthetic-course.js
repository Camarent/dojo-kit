'use strict';
// Writes a minimal valid course into a caller-owned dir: no shipped example is read or changed.
// Rows: geo-1 and geo-2 (choice, geo unit, one with an explanation), math-1 and math-2 (choice, math unit).
const fs = require('node:fs');
const path = require('node:path');

const COURSE = {
  id: 'synthetic',
  title: 'Synthetic course',
  uiLanguage: 'en',
  contentLanguage: 'en',
  units: [
    { id: 'geo', title: 'Geography' },
    { id: 'geo-exam', title: 'Geography exam', examOnly: true },
    { id: 'math', title: 'Math' },
    { id: 'math-exam', title: 'Math exam', examOnly: true },
  ],
  exam: {
    minutes: 5,
    passMark: 0.7,
    sections: [
      { title: 'Geography', count: 2, units: ['geo', 'geo-exam'] },
      { title: 'Math', count: 2, units: ['math', 'math-exam'] },
    ],
  },
};

const GEO_ROWS = [
  { type: 'choice', id: 'geo-1', unit: 'geo', tags: ['capitals'], prompt: 'What is the capital of France?', options: ['Paris', 'Rome', 'Madrid'], answer: 0 },
  { type: 'choice', id: 'geo-2', unit: 'geo', tags: ['capitals'], prompt: 'What is the capital of Japan?', options: ['Seoul', 'Tokyo', 'Beijing'], answer: 1, explanation: 'Tokyo has been the capital since 1868.' },
  { type: 'choice', id: 'geox-1', unit: 'geo-exam', prompt: 'Exam-only question for geo?', options: ['yes', 'no'], answer: 0 },
];

const MATH_ROWS = [
  { type: 'choice', id: 'math-1', unit: 'math', tags: ['arithmetic'], prompt: 'What is 7 times 8?', options: ['54', '56', '58'], answer: 1 },
  { type: 'choice', id: 'math-2', unit: 'math', tags: ['geometry'], prompt: 'How many sides does a hexagon have?', options: ['5', '6', '7'], answer: 1 },
  { type: 'choice', id: 'mathx-1', unit: 'math-exam', prompt: 'Exam-only question for math?', options: ['yes', 'no'], answer: 0 },
];

function jsonl(rows) {
  return rows.map((r) => JSON.stringify(r)).join('\n') + '\n';
}

// writeCourse(dir): dir must exist or be creatable; it writes course.json and content/*.jsonl under it.
function writeCourse(dir) {
  fs.mkdirSync(path.join(dir, 'content'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'course.json'), JSON.stringify(COURSE, null, 2));
  fs.writeFileSync(path.join(dir, 'content', 'geo.jsonl'), jsonl(GEO_ROWS));
  fs.writeFileSync(path.join(dir, 'content', 'math.jsonl'), jsonl(MATH_ROWS));
  return dir;
}

module.exports = { writeCourse };

'use strict';
// Checks the GitHub issue templates under .github/ISSUE_TEMPLATE with line checks (no YAML parser).
// The feature request needs the same front matter keys as bug_report.md. config.yml must disable
// blank issues and link security reports to the private advisory form. The mutation case
// flips blank_issues_enabled in an in-memory copy and expects a reported problem.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const DIR = path.join(__dirname, '..', '.github', 'ISSUE_TEMPLATE');
const BUG = fs.readFileSync(path.join(DIR, 'bug_report.md'), 'utf8');
const FEATURE = fs.readFileSync(path.join(DIR, 'feature_request.md'), 'utf8');
const CONFIG = fs.readFileSync(path.join(DIR, 'config.yml'), 'utf8');

const ADVISORY_URL = 'https://github.com/Camarent/dojo-kit/security/advisories/new';

// Front matter keys (between the first two `---` lines) of a markdown template.
function frontMatterKeys(md) {
  const lines = md.split('\n');
  if (lines[0] !== '---') return [];
  const end = lines.indexOf('---', 1);
  if (end < 0) return [];
  return lines
    .slice(1, end)
    .map((l) => l.match(/^([a-z_]+):/))
    .filter(Boolean)
    .map((m) => m[1]);
}

// Returns a list of problems in config.yml; empty means the config is as required.
function checkConfig(yml) {
  const problems = [];
  const lines = yml.split('\n').map((l) => l.trim());
  if (!lines.includes('blank_issues_enabled: false')) {
    problems.push('config.yml must set blank_issues_enabled: false');
  }
  if (!lines.includes('contact_links:')) {
    problems.push('config.yml must declare contact_links');
  }
  if (!lines.some((l) => l === `url: ${ADVISORY_URL}`)) {
    problems.push(`config.yml contact_links must include url: ${ADVISORY_URL}`);
  }
  return problems;
}

test('bug_report and feature_request both have name, about and labels front matter', () => {
  for (const md of [BUG, FEATURE]) {
    const keys = frontMatterKeys(md);
    assert.deepStrictEqual(
      ['name', 'about', 'labels'].filter((k) => keys.includes(k)),
      ['name', 'about', 'labels'],
    );
  }
});

test('feature_request template is labelled enhancement and has the required sections', () => {
  assert.ok(/^labels: enhancement$/m.test(FEATURE));
  for (const heading of ['## Problem', '## Proposed change', '## Alternatives', '## Versions']) {
    assert.ok(FEATURE.includes(heading), `feature_request.md missing ${heading}`);
  }
});

test('config.yml disables blank issues and links security reports to the advisory form', () => {
  assert.deepStrictEqual(checkConfig(CONFIG), []);
});

test('config check reports a problem when blank issues are enabled (mutation)', () => {
  const mutated = CONFIG.replace('blank_issues_enabled: false', 'blank_issues_enabled: true');
  assert.notStrictEqual(mutated, CONFIG);
  const problems = checkConfig(mutated);
  assert.ok(problems.some((p) => p.includes('blank_issues_enabled: false')));
});

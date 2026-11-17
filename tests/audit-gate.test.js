'use strict';

const assert = require('assert');
const { test } = require('node:test');

const { unallowedVulnerabilities } = require('../tools/audit-gate.js');

const ALLOW = [{ advisory: 'GHSA-aaaa', package: 'pm', versions: ['1.0.0'] }];
const adv = (id) => ({ url: `https://github.com/advisories/${id}` });
const audit = (vulnerabilities) => ({ vulnerabilities });

test('allowed advisory at an allowed version, and a package that only depends on it, pass', () => {
  const a = audit({
    pm: { via: [adv('GHSA-aaaa')], nodes: ['node_modules/pm'] },
    tool: { via: ['pm'], nodes: ['node_modules/tool'] },
  });
  assert.deepStrictEqual(unallowedVulnerabilities(a, ALLOW, () => '1.0.0'), []);
});

test('a different installed version of the allowed package fails', () => {
  const a = audit({ pm: { via: [adv('GHSA-aaaa')], nodes: ['node_modules/pm'] } });
  assert.deepStrictEqual(unallowedVulnerabilities(a, ALLOW, () => '1.0.1'), ['pm']);
});

test('a different advisory on the same package fails, and so does what depends on it', () => {
  const a = audit({
    pm: { via: [adv('GHSA-bbbb')], nodes: ['node_modules/pm'] },
    tool: { via: ['pm'], nodes: ['node_modules/tool'] },
  });
  assert.deepStrictEqual(unallowedVulnerabilities(a, ALLOW, () => '1.0.0').sort(), ['pm', 'tool']);
});

test('a package with one allowed and one unallowed advisory fails', () => {
  const a = audit({ pm: { via: [adv('GHSA-aaaa'), adv('GHSA-bbbb')], nodes: ['node_modules/pm'] } });
  assert.deepStrictEqual(unallowedVulnerabilities(a, ALLOW, () => '1.0.0'), ['pm']);
});

test('no vulnerabilities passes', () => {
  assert.deepStrictEqual(unallowedVulnerabilities(audit({}), ALLOW, () => '1.0.0'), []);
});

#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ALLOW_FILE = path.join(__dirname, '..', 'audit-allow.json');

/**
 * Names of vulnerable packages not covered by the allowlist.
 * AUDIT: parsed `npm audit --json`. ALLOW: [{advisory, package, versions}].
 * VERSION_OF(nodePath) -> installed version of that node_modules entry.
 * An advisory is allowed only when every affected node runs an allowed version;
 * a package that is vulnerable only through allowed packages is allowed too.
 */
function unallowedVulnerabilities(audit, allow, versionOf) {
  const vulns = audit.vulnerabilities || {};
  const allowedAdvisory = (name, via) => allow.some((a) => a.package === name
    && String(via.url || '').endsWith(`/${a.advisory}`)
    && (vulns[name].nodes || []).every((n) => a.versions.includes(versionOf(n))));
  const ok = new Set();
  let changed = true;
  while (changed) {
    changed = false;
    for (const [name, v] of Object.entries(vulns)) {
      if (ok.has(name)) continue;
      const covered = v.via.length > 0 && v.via.every((via) => (typeof via === 'string' ? ok.has(via) : allowedAdvisory(name, via)));
      if (covered) { ok.add(name); changed = true; }
    }
  }
  return Object.keys(vulns).filter((name) => !ok.has(name));
}

/** Allowlist entries npm audit no longer reports for their package: the advisory is fixed, the entry must go. */
function staleEntries(audit, allow) {
  const vulns = audit.vulnerabilities || {};
  return allow.filter((a) => !(vulns[a.package] && vulns[a.package].via.some((via) => typeof via !== 'string' && String(via.url || '').endsWith(`/${a.advisory}`))));
}

function installedVersion(nodePath) {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, '..', nodePath, 'package.json'), 'utf8')).version;
  } catch { return null; }
}

function main() {
  const res = spawnSync('npm', ['audit', '--json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  let audit;
  try { audit = JSON.parse(res.stdout); } catch { console.error('audit-gate: npm audit gave no JSON'); return 1; }
  if (audit.error) { console.error(`audit-gate: ${audit.error.summary || audit.error.code}`); return 1; }
  const allow = JSON.parse(fs.readFileSync(ALLOW_FILE, 'utf8'));
  const bad = unallowedVulnerabilities(audit, allow, installedVersion);
  if (bad.length) {
    console.error(`audit-gate: not allowed in audit-allow.json: ${bad.join(', ')}. Run npm audit for details.`);
    return 1;
  }
  const stale = staleEntries(audit, allow);
  if (stale.length) {
    console.error(`audit-gate: no longer reported by npm audit, remove from audit-allow.json: ${stale.map((a) => `${a.package} ${a.advisory}`).join(', ')}`);
    return 1;
  }
  const total = Object.keys(audit.vulnerabilities || {}).length;
  console.log(`audit-gate: ok (${total} vulnerable package(s), all allowed in audit-allow.json)`);
  return 0;
}

if (require.main === module) process.exit(main());
module.exports = { unallowedVulnerabilities, staleEntries };

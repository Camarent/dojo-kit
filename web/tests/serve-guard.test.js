'use strict';
// Path guard of web/dev/serve.js: requests must not escape the served directory.
const { describe, before, after, it } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const SERVER = path.join(__dirname, '..', 'dev', 'serve.js');

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function get(port, reqPath) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path: reqPath }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', reject);
  });
}

describe('serve.js path guard', () => {
  let tmp;
  let child;
  let port;

  before(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dojo-serve-guard-'));
    const site = path.join(tmp, 'site');
    fs.mkdirSync(site);
    fs.mkdirSync(path.join(site, 'sub'));
    fs.writeFileSync(path.join(site, 'index.html'), '<p>ok</p>');
    fs.writeFileSync(path.join(site, 'sub', 'index.html'), '<p>sub</p>');
    fs.writeFileSync(path.join(tmp, 'package.json'), '{}');
    port = await freePort();
    child = spawn(process.execPath, [SERVER, site, String(port), '--host', '127.0.0.1'], { stdio: ['ignore', 'pipe', 'pipe'] });
    await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.stdout.once('data', resolve);
    });
  });

  after(async () => {
    if (child && child.exitCode === null) {
      await new Promise((resolve) => {
        child.once('exit', resolve);
        child.kill();
      });
    }
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('serves index.html for /', async () => {
    assert.strictEqual(await get(port, '/index.html'), 200);
  });

  it('rejects a parent-directory escape with 403', async () => {
    assert.strictEqual(await get(port, '/../package.json'), 403);
  });

  it('rejects an encoded parent-directory escape with 403', async () => {
    assert.strictEqual(await get(port, '/%2e%2e/package.json'), 403);
  });

  it('serves a path that goes up and back down inside the site', async () => {
    assert.strictEqual(await get(port, '/sub/../index.html'), 200);
  });
});

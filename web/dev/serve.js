#!/usr/bin/env node
// Dev server: node web/dev/serve.js <dist/<courseId>> [port] [--host HOST]
// Wraps index.html like the artifact platform; /?mockdb injects a fake window.claude (db + user) backed by localStorage.
// Binds to 127.0.0.1 by default; use --host or HOST env to override.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const dir = process.argv[2];
if (!dir) {
  console.error('usage: node web/dev/serve.js <dist/courseId> [port] [--host HOST]');
  process.exit(2);
}
const base = path.resolve(dir);
const port = Number(process.argv[3]) || 8000;
const host = process.argv[4] === '--host' ? process.argv[5] : process.env.HOST || '127.0.0.1';
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8' };

const mockdbSource = fs.readFileSync(path.join(__dirname, 'mockdb.js'), 'utf8');
const MOCK = '<script>\n' + mockdbSource + '\n</script>';

const head = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">';

http.createServer((req, res) => {
  const mock = /[?&]mockdb\b/.test(req.url);
  let p;
  try { p = decodeURIComponent(req.url.split('?')[0]); } catch (e) { res.writeHead(400); return res.end(); }
  if (p === '/') p = '/index.html';
  const file = path.join(base, path.normalize(p));
  if (file !== base && !file.startsWith(base + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    if (p === '/index.html') buf = Buffer.concat([Buffer.from(head + (mock ? MOCK : '') + '</head><body>'), buf, Buffer.from('</body></html>')]);
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
}).listen(port, host, () => console.log('http://' + host + ':' + port + '/'));

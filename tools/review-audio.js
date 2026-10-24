#!/usr/bin/env node
'use strict';
/*
 * review-audio.js — builds a self-contained audio review page.
 *   buildReviewPage({ manifestPath, rows, base }) -> html string
 *     rows = [{ clip, text, tr?, group? }]; base = audio base URL (default 'data/audio/').
 *   CLI: node tools/review-audio.js <manifest.json> <rows.json> <out.html>
 * The page inlines web/audio.js and plays only through DojoAudio.configure/play.
 * Flag export is {"v":1,"ids":[sorted clip ids]}, the shape of audio/blocklist.json.
 */
const fs = require('fs');
const path = require('path');

const AUDIO_JS = path.join(__dirname, '..', 'web', 'audio.js');

function esc(s) {
  return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function jsonForScript(v) {
  return JSON.stringify(v).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

function rowHtml(r) {
  const tr = r.tr ? ` <span class="tr">${esc(r.tr)}</span>` : '';
  return `<div class="row" data-row="${esc(r.clip)}"><button type="button" data-play="${esc(r.clip)}">&#9658;</button> `
    + `<button type="button" data-flag="${esc(r.clip)}">flag</button> `
    + `<code>${esc(r.clip)}</code> <span class="text">${esc(r.text)}</span>${tr}</div>`;
}

function bodyHtml(rows) {
  const order = [];
  const byGroup = new Map();
  for (const r of rows) {
    const g = r.group ? String(r.group) : '';
    if (!byGroup.has(g)) { byGroup.set(g, []); order.push(g); }
    byGroup.get(g).push(r);
  }
  order.sort((a, b) => (a === '' ? -1 : b === '' ? 1 : 0));
  return order.map((g) => (g ? `<h2>${esc(g)}</h2>\n` : '') + byGroup.get(g).map(rowHtml).join('\n')).join('\n');
}

const PAGE_JS = `
var flagged = {};
function exportFlags() {
  document.getElementById('out').value = JSON.stringify({ v: 1, ids: Object.keys(flagged).sort() });
}
DojoAudio.configure({ base: BASE, manifest: MANIFEST });
document.querySelectorAll('button[data-play]').forEach(function (b) {
  b.addEventListener('click', function () {
    DojoAudio.play(b.dataset.play).catch(function (e) { document.getElementById('err').textContent = 'play failed: ' + (e && e.message || e); });
  });
});
document.querySelectorAll('button[data-flag]').forEach(function (b) {
  b.addEventListener('click', function () {
    var id = b.dataset.flag;
    if (flagged[id]) delete flagged[id]; else flagged[id] = true;
    exportFlags();
  });
});
exportFlags();
`;

function buildReviewPage({ manifestPath, rows, base }) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const audioSrc = fs.readFileSync(AUDIO_JS, 'utf8').replace(/<\/script/gi, '<\\/script');
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Audio review</title></head>
<body>
<p id="err"></p>
${bodyHtml(rows)}
<textarea id="out" rows="4" cols="80" readonly></textarea>
<script>${audioSrc}</script>
<script>var BASE = ${jsonForScript(base || 'data/audio/')}; var MANIFEST = ${jsonForScript(manifest)};${PAGE_JS}</script>
</body></html>
`;
}

function main(argv) {
  if (argv.length !== 3) { console.error('usage: review-audio.js <manifest.json> <rows.json> <out.html>'); return 2; }
  const rows = JSON.parse(fs.readFileSync(argv[1], 'utf8'));
  fs.writeFileSync(argv[2], buildReviewPage({ manifestPath: argv[0], rows }));
  return 0;
}

module.exports = { buildReviewPage, esc };
if (require.main === module) process.exitCode = main(process.argv.slice(2));

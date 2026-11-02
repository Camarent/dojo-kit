#!/usr/bin/env node
'use strict';
/*
 * review-audio.js — builds a self-contained audio review page.
 *   buildReviewPage({ manifestPath, rows, base }) -> html string
 *     rows = [{ clip, text, tr?, group?, level?, form? }]; level/form group rows (missing -> 'other'); course sets the title; base = audio base URL (default 'data/audio/').
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
  const form = r.form ? String(r.form) : 'other';
  return `<div class="row" data-form="${esc(form)}" data-row="${esc(r.clip)}"><button type="button" data-play="${esc(r.clip)}">&#9658;</button> `
    + `<button type="button" data-flag="${esc(r.clip)}">flag</button> `
    + `<code>${esc(r.clip)}</code> <span class="text">${esc(r.text)}</span>${tr}</div>`;
}

function legacyBody(rows) {
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

function sortKeys(keys) {
  return keys.sort((a, b) => (a === 'other') - (b === 'other') || a.localeCompare(b, 'en', { numeric: true }));
}

function formBody(rows) {
  const levels = new Map();
  for (const r of rows) {
    const l = r.level ? String(r.level) : 'other';
    const f = r.form ? String(r.form) : 'other';
    if (!levels.has(l)) levels.set(l, new Map());
    if (!levels.get(l).has(f)) levels.get(l).set(f, []);
    levels.get(l).get(f).push(r);
  }
  return sortKeys([...levels.keys()]).map((l) => `<h2>${esc(l)}</h2>\n` + sortKeys([...levels.get(l).keys()]).map(
    (f) => `<h3>${esc(f)}</h3>\n` + levels.get(l).get(f).map(rowHtml).join('\n')).join('\n')).join('\n');
}

function filterHtml(rows) {
  const forms = sortKeys([...new Set(rows.map((r) => (r.form ? String(r.form) : 'other')))]);
  return '<select id="formfilter"><option value="">all forms</option>'
    + forms.map((f) => `<option value="${esc(f)}">${esc(f)}</option>`).join('') + '</select>';
}

function bodyHtml(rows) {
  if (!rows.some((r) => r.form || r.level)) return legacyBody(rows);
  return filterHtml(rows) + '\n' + formBody(rows);
}

const PAGE_JS = `
var flagged = {};
var ff = document.getElementById('formfilter');
if (ff && ff.addEventListener) ff.addEventListener('change', function () {
  document.querySelectorAll('.row').forEach(function (r) { r.style.display = !ff.value || r.dataset.form === ff.value ? '' : 'none'; });
});
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

function buildReviewPage({ manifestPath, rows, base, course }) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const audioSrc = fs.readFileSync(AUDIO_JS, 'utf8').replace(/<\/script/gi, '<\\/script');
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(course ? 'Clip review: ' + course : 'Clip review')}</title></head>
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

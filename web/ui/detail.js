/*
 * ui/detail.js — Detail rendering helpers extracted from app.js.
 * Globals expected: preact, htm, DojoCommon.
 */
(function (root) {
  'use strict';

  var h = preact.h;
  var html = htm.bind(h);
  var DojoCommon = root.DojoCommon || {};

  // Alias from DojoCommon
  var renderText = DojoCommon.renderText;
  var renderTextAll = DojoCommon.renderTextAll;

  // Helper to get nested value from item.meta by dot-separated key path
  function getMetaValue(item, key) {
    if (!item || !item.meta || typeof item.meta !== 'object') return null;
    var parts = key.replace(/^meta\./, "").split('.');
    var value = item.meta;
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i];
      if (value === null || typeof value !== 'object') return null;
      if (!Object.prototype.hasOwnProperty.call(value, part)) return null;
      value = value[part];
    }
    return value;
  }

  // Helper to resolve a dotted path in an object
  function resolvePath(obj, path) {
    if (!obj || typeof obj !== 'object' || !path || typeof path !== 'string') return null;
    var parts = path.split('.');
    var value = obj;
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i];
      if (value === null || typeof value !== 'object') return null;
      if (!Object.prototype.hasOwnProperty.call(value, part)) return null;
      value = value[part];
    }
    return value;
  }

  // Render a text detail field
  function renderTextDetail(value, fieldKey, r) {
    if (typeof value === 'string') {
      return html`<span data-testid=${'detail-' + fieldKey}>${r(value)}</span>`;
    }
    return html`<span data-testid=${'detail-' + fieldKey}>${String(value)}</span>`;
  }

  // Render a list detail field
  function renderListDetail(value, fieldKey, r) {
    if (Array.isArray(value) && value.length > 0) {
      return html`<ul data-testid=${'detail-' + fieldKey + '-list'}>${value.map(function (v) {
        return html`<li>${typeof v === 'string' ? r(v) : String(v)}</li>`;
      })}</ul>`;
    }
    return null;
  }

  // Render an objects detail field
  function renderObjectsDetail(value, fieldKey, r) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      var rows = [];
      for (var k in value) {
        if (Object.prototype.hasOwnProperty.call(value, k)) {
          rows.push(html`<tr data-testid=${'detail-' + fieldKey + '-' + k}><td>${k}:</td><td>${typeof value[k] === 'string' ? r(value[k]) : String(value[k])}</td></tr>`);
        }
      }
      if (rows.length > 0) {
        return html`<table class="detail-objects" data-testid=${'detail-' + fieldKey + '-table'}>${rows}</table>`;
      }
    }
    return null;
  }

  // Render a table detail field
  function renderTableDetail(value, fieldKey, r) {
    if (value && typeof value === 'object' && Array.isArray(value.head) && Array.isArray(value.rows) && value.rows.length > 0) {
      var headCells = value.head.map(function (h, hi) {
        return html`<th data-testid=${'detail-' + fieldKey + '-head-' + hi}>${typeof h === 'string' ? r(h) : String(h)}</th>`;
      });
      var bodyRows = value.rows.map(function (row, ri) {
        var cells = (Array.isArray(row) ? row : []).map(function (c, ci) {
          return html`<td data-testid=${'detail-' + fieldKey + '-row-' + ri + '-col-' + ci}>${typeof c === 'string' ? r(c) : String(c)}</td>`;
        });
        return html`<tr data-testid=${'detail-' + fieldKey + '-row-' + ri}>${cells}</tr>`;
      });
      return html`<table class="detail-table" data-testid=${'detail-' + fieldKey + '-table'}>${value.title ? html`<caption data-testid=${'detail-' + fieldKey + '-title'}>${r(value.title)}</caption>` : null}<thead><tr>${headCells}</tr></thead><tbody>${bodyRows}</tbody></table>`;
    }
    return null;
  }

  // Render a pairs detail field
  function renderPairsDetail(value, field, fieldKey, r) {
    if (Array.isArray(value) && value.length > 0) {
      var leftKey = field.keys && field.keys[0] ? field.keys[0] : 'a';
      var rightKey = field.keys && field.keys[1] ? field.keys[1] : 'b';
      var items = value.map(function (entry, i) {
        var left = entry[leftKey];
        var right = entry[rightKey];
        if (left === undefined || right === undefined) return null;
        return html`<tr data-testid=${'detail-' + fieldKey + '-pair-' + i}><td data-testid=${'detail-' + fieldKey + '-pair-' + i + '-a'}>${typeof left === 'string' ? r(left) : String(left)}</td><td data-testid=${'detail-' + fieldKey + '-pair-' + i + '-b'}>${typeof right === 'string' ? r(right) : String(right)}</td></tr>`;
      }).filter(Boolean);
      if (items.length > 0) {
        return html`<table class="detail-pairs" data-testid=${'detail-' + fieldKey + '-pairs'}>${items}</table>`;
      }
    }
    return null;
  }

  // Render one field body by field.type (default text); null when the value does not fit the type.
  function renderFieldContent(field, value, r) {
    var type = field.type || 'text';
    if (type === 'text') return renderTextDetail(value, field.key, r);
    if (type === 'list') return renderListDetail(value, field.key, r);
    if (type === 'objects') return renderObjectsDetail(value, field.key, r);
    if (type === 'table') return renderTableDetail(value, field.key, r);
    if (type === 'pairs') return renderPairsDetail(value, field, field.key, r);
    return null;
  }

  // Field label: label > t(labelKey) > key.
  function fieldLabel(field, t) {
    return field.label || (field.labelKey && t ? t(field.labelKey) : field.key);
  }

  // Render declarative detail fields from item.meta. all=true uses renderTextAll.
  function renderDeclarativeDetail(course, unit, item, t, all) {
    var r = all ? renderTextAll : renderText;
    // Try unit.detail first, then course.detail
    var detailConfig = (unit && unit.detail) || (course && course.detail);
    if (!detailConfig || !detailConfig.fields || !detailConfig.fields.length) return null;

    var fields = detailConfig.fields;
    var rendered = [];

    for (var i = 0; i < fields.length; i++) {
      var field = fields[i];
      if (!field || !field.key) continue;

      var value = getMetaValue(item, field.key);
      // Skip missing or empty fields
      if (value === null || value === undefined || value === '') continue;

      var label = fieldLabel(field, t);
      var content = renderFieldContent(field, value, r);

      if (content) {
        rendered.push(html`<div class="detail-field" data-testid=${'detail-field-' + field.key}><b>${label}:</b> ${content}</div>`);
      }
    }

    if (rendered.length === 0) return null;
    return html`<section class="declarative-detail" data-testid="declarative-detail">${rendered}</section>`;
  }

  // Entity stage for the stage filter: new = no member has a record; review = every member has min stage >= 2; else learning.
  function topicStage(es) {
    if (!es || !es.started) return 'new';
    return es.minStage >= 2 ? 'review' : 'learning';
  }

  // Chip state: new / learning / due (any member due) / learned (all members at or above learnedStage).
  function topicState(es) {
    if (!es || !es.started) return 'new';
    if (es.due) return 'due';
    return es.learned ? 'learned' : 'learning';
  }

  // Mastery % = members at or above learnedStage / members.
  function topicMastery(es) {
    return es && es.members ? Math.round(100 * es.atLearned / es.members) : 0;
  }

  // Topic label: first non-empty of topic > meta.title > intro.title > listening answer > glyph value > stimulus.title > unit.title > entity/id. Never item.prompt.
  // ctx: {intro, unit, stimulus, expected, glyphPath}; listening = ctx.listening (typed item with clips/hideText stimulus).
  function topicLabel(item, ctx) {
    ctx = ctx || {};
    var str = function (v) { return typeof v === 'string' && v.trim() !== '' ? v : ''; };
    var m = item.meta || {};
    var st = ctx.stimulus || null;
    var typed = item.type === 'numeric' || item.type === 'gap' || item.inputMode === 'numeric';
    var listening = !!st && (Array.isArray(st.audio) && st.audio.length > 0 || !!st.hideText) && typed;
    var glyph = ctx.glyphPath ? resolvePath(item, ctx.glyphPath) : null;
    var v = str(item.topic) || str(m.title) || str(ctx.intro && ctx.intro.title);
    if (v) return { text: v, ordinal: true };
    v = listening ? str(ctx.expected) : '';
    if (v) return { text: v, ordinal: false };
    v = str(glyph) || str(st && st.title) || str(ctx.unit && ctx.unit.title);
    return { text: v || item.entity || item.id, ordinal: true };
  }

  // Intro card body: plugin hook output, else title + text. all=true uses renderTextAll.
  // pre: when provided, use this pre-computed intro hook output instead of calling DojoExt.intro.
  function renderIntroBody(options) {
    var intro = options.intro;
    var item = options.item;
    var ctx = options.ctx;
    var decl = options.decl;
    var all = options.all;
    var pre = options.pre;
    var r = all ? renderTextAll : renderText;
    var DojoExt = root.DojoExt || {};
    var out = pre !== undefined ? pre : (DojoExt.intro ? DojoExt.intro(intro, item, ctx) : null);
    if (out) return html`<div class="intro-hook" data-testid="intro-hook">${out}</div>`;
    return html`<div class="intro-default">
      ${intro.title ? html`<h3 class="intro-title" data-testid="intro-title">${r(intro.title)}</h3>` : null}
      ${intro.text ? html`<div class="intro-text pre" data-testid="intro-text">${r(intro.text)}</div>` : null}
      ${decl || null}
    </div>`;
  }

  // Stats block for a record with extras (e, to, cf); null when none present. cf order: count desc, index asc.
  function renderExtrasStats(rec, t) {
    if (!rec) return null;
    var hasE = typeof rec.e === 'number' && isFinite(rec.e);
    var hasTo = typeof rec.to === 'number' && rec.to > 0;
    var cf = Array.isArray(rec.cf) ? rec.cf.map(function (p, i) { return { k: Array.isArray(p) ? p[0] : null, n: Array.isArray(p) ? p[1] : 0, i: i }; })
      .filter(function (c) { return typeof c.k === 'string' && typeof c.n === 'number' && isFinite(c.n) && c.n >= 1; }) : [];
    cf.sort(function (a, b) { return b.n - a.n || a.i - b.i; });
    if (!hasE && !hasTo && !cf.length) return null;
    var top = cf.slice(0, 3).map(function (c) { return c.k + ' ×' + c.n; }).join(', ');
    return html`<div data-testid="detail-extras">
      ${hasE ? html`<p class="muted" data-testid="detail-errrate">${t('catalog.errRate', { p: Math.round(rec.e * 100) })}</p>` : null}
      ${hasTo ? html`<p class="muted" data-testid="detail-timeouts">${t('catalog.timeouts', { n: rec.to })}</p>` : null}
      ${cf.length ? html`<p class="muted" data-testid="detail-confusions">${t('catalog.confusedWith', { list: top })}</p>` : null}
    </div>`;
  }

  // Public API
  var api = {
    renderIntroBody: renderIntroBody,
    renderDeclarativeDetail: renderDeclarativeDetail,
    renderExtrasStats: renderExtrasStats,
    getMetaValue: getMetaValue,
    resolvePath: resolvePath,
    topicStage: topicStage,
    topicState: topicState,
    topicMastery: topicMastery,
    topicLabel: topicLabel
  };

  // Export
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.DojoDetail = api;
})(typeof self !== 'undefined' ? self : this);

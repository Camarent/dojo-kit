/*
 * ui/catalog.js — CatalogScreen component
 * Globals expected: preact, htm, DojoStorage, DojoSession, DojoTypes, DojoExt, DojoCommon, DojoDetail.
 */
(function (root) {
  'use strict';

  var h = preact.h;
  var Component = preact.Component;
  var html = htm.bind(h);

  // Load dependencies
  var DojoExt = root.DojoExt || {};
  var DojoTypes = root.DojoTypes || {};
  var DojoCommon = root.DojoCommon || (typeof require !== 'undefined' ? require('./common.js') : null) || {};
  var DojoDetail = root.DojoDetail || (typeof require !== 'undefined' ? require('./detail.js') : null) || {};
  var DojoSession = root.DojoSession || (typeof require !== 'undefined' ? require('./session.js') : null) || {};

  // Alias from DojoCommon
  var renderText = DojoCommon.renderText;
  var cls = DojoCommon.cls;
  var Chip = DojoCommon.Chip;

  // Alias from DojoDetail
  var renderDeclarativeDetail = DojoDetail.renderDeclarativeDetail;
  var renderIntroBody = DojoDetail.renderIntroBody;
  var resolvePath = DojoDetail.resolvePath || function(obj, path) {
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
  };
  var topicStage = DojoDetail.topicStage || function(es) {
    if (!es || !es.started) return 'new';
    return es.minStage >= 2 ? 'review' : 'learning';
  };
  var topicState = DojoDetail.topicState || function(es) {
    if (!es || !es.started) return 'new';
    if (es.due) return 'due';
    return es.learned ? 'learned' : 'learning';
  };
  var topicMastery = DojoDetail.topicMastery || function(es) {
    return es && es.members ? Math.round(100 * es.atLearned / es.members) : 0;
  };
  var topicTitle = DojoDetail.topicTitle || function(item, intro) {
    var m = item.meta || {};
    if (m.title) return m.title;
    if (intro && typeof intro.title === 'string' && intro.title) return intro.title;
    if (typeof item.prompt === 'string' && item.prompt) return item.prompt;
    return item.entity || item.id;
  };

  // Use tagInfo from DojoSession if available, otherwise define it
  var tagInfo = DojoSession.tagInfo || function(course, tag) {
    var e = course && course.tagLabels && Object.prototype.hasOwnProperty.call(course.tagLabels, tag) ? course.tagLabels[tag] : null;
    var label = typeof e === 'string' ? e : e && typeof e.label === 'string' ? e.label : '';
    return { label: label || String(tag).toUpperCase(), internal: !!(e && typeof e === 'object' && e.kind === 'internal') };
  };

  function collectStrings(v, out, depth) {
    if (typeof v === 'string') out.push(v);
    else if (depth < 6 && Array.isArray(v)) v.forEach(function (x) { collectStrings(x, out, depth + 1); });
    else if (depth < 6 && v && typeof v === 'object') Object.keys(v).forEach(function (k) { collectStrings(v[k], out, depth + 1); });
    return out;
  }

  function captionFor(course, item, t) {
    var caps = course && course.captions && typeof course.captions === 'object' ? course.captions : null;
    var has = function (k) { return caps && Object.prototype.hasOwnProperty.call(caps, k) && typeof caps[k] === 'string' && caps[k]; };
    var tags = item.tags || [];
    for (var i = 0; i < tags.length; i++) if (has(tags[i])) return caps[tags[i]];
    if (has(item.type)) return caps[item.type];
    var key = 'session.caption.' + item.type;
    var out = t(key);
    return out === key ? '' : out;
  }

  function toggle(list, value) {
    return list.indexOf(value) >= 0 ? list.filter(function (x) { return x !== value; }) : list.concat([value]);
  }

  var CATALOG_PAGE = 50;
  var CATALOG_TAGS_SHOWN = 12;
  var STAGES = ['new', 'learning', 'review'];

  class CatalogScreen extends Component {
    constructor(props) {
      super(props);
      var units = props.course.units || [];
      this.state = { search: '', selectedUnit: units.length ? units[0].id : null, selectedTags: [], selectedStages: [], tagsOpen: false, limit: CATALOG_PAGE, detailItem: null };
      this.items = props.content.items.filter(function (it) { return it.status !== 'retired'; });
      this.introById = Object.create(null);
      var ib = this.introById;
      (props.content.intros || []).forEach(function (i) { if (i && typeof i.id === 'string') ib[i.id] = i; });
      this.unitById = Object.create(null);
      var ub = this.unitById;
      (props.course.units || []).forEach(function (u) { if (u && typeof u.id === 'string') ub[u.id] = u; });
      this.index = this.buildIndex();
      this.onKey = this.onKey.bind(this);
    }
    componentDidMount() { this.props.win.addEventListener('keydown', this.onKey); this.updateScrollLock(); }
    componentDidUpdate() { this.updateScrollLock(); }
    componentWillUnmount() { this.props.win.removeEventListener('keydown', this.onKey); this.clearScrollLock(); }
    updateScrollLock() {
      var body = this.props.win.document.documentElement;
      if (body) {
        if (this.state.detailItem) body.classList.add('dojo-no-scroll');
        else body.classList.remove('dojo-no-scroll');
      }
    }
    clearScrollLock() {
      var body = this.props.win.document.documentElement;
      if (body) body.classList.remove('dojo-no-scroll');
    }
    onKey(e) {
      var d = this.state.detailItem;
      if (e.key === 'Escape' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && d) {
        e.preventDefault();
        this.setState({ detailItem: null });
        return;
      }
      var dir = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
      if (!d || !dir || DojoTypes.keyBlocked(e)) return;
      var tag = e.target && e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      var id = d.entity || d.id;
      var list = this.topics();
      var at = list.findIndex(function (r) { return r.id === id; });
      var to = list[at + dir];
      if (at < 0 || !to) return;
      e.preventDefault();
      this.setState({ detailItem: to.item });
    }
    introOf(item) { return this.introById[item.entity || item.id] || null; }
    buildIndex() {
      var e = this.props.engine;
      var self = this;
      var idx = {};
      this.items.forEach(function (item) {
        var parts = [item.prompt, e.expected(item), item.explanation];
        if (Array.isArray(item.answers)) parts = parts.concat(item.answers);
        collectStrings(item.meta, parts, 0);
        var intro = self.introOf(item);
        if (intro) parts.push(intro.title, intro.text);
        var strs = parts.filter(function (x) { return typeof x === 'string'; });
        idx[item.id] = (strs.map(function (x) { return DojoExt.plain(x); }).join('\n') + '\n' + strs.join('\n')).toLowerCase();
      });
      return idx;
    }
    filtered() {
      var s = this.state;
      var idx = this.index;
      var q = s.search.trim().toLowerCase();
      return this.items.filter(function (it) {
        if (s.selectedUnit && it.unit !== s.selectedUnit) return false;
        if (!s.selectedTags.every(function (tag) { return (it.tags || []).indexOf(tag) >= 0; })) return false;
        return !q || idx[it.id].indexOf(q) >= 0;
      });
    }
    topics() {
      var s = this.state;
      var by = Object.create(null);
      this.props.engine.entityStates().forEach(function (es) { by[es.id] = es; });
      var order = [];
      var first = Object.create(null);
      this.filtered().forEach(function (it) {
        var id = it.entity || it.id;
        if (!first[id]) { first[id] = it; order.push(id); }
      });
      return order.map(function (id) { return { id: id, item: first[id], es: by[id] }; }).filter(function (r) {
        return !s.selectedStages.length || s.selectedStages.indexOf(topicStage(r.es)) >= 0;
      });
    }
    allTags() {
      var sel = this.state.selectedUnit;
      var course = this.props.course;
      var seen = {};
      this.items.forEach(function (it) {
        if (sel && it.unit !== sel) return;
        (it.tags || []).forEach(function (tag) { seen[tag] = true; });
      });
      return Object.keys(seen).filter(function (tag) { return !tagInfo(course, tag).internal; }).sort();
    }
    filter(patch) { this.setState(Object.assign({ limit: CATALOG_PAGE }, patch)); }

    // Split render into named helpers to keep functions <= 100 lines
    renderHeader(p, s, t) {
      return html`<header class="head">
        <h1>${t('catalog.title')}</h1>
        <button type="button" class="btn" data-testid="btn-back" onClick=${function () { p.go('home'); }}>${t('back')}</button>
      </header>`;
    }

    renderTabs(p, s, t) {
      var self = this;
      return html`<div class="catalog-tabs" role="tablist" aria-label=${t('catalog.units')}>
        <button type="button" key="__all" class=${cls('btn', !s.selectedUnit && 'primary')}
          data-testid="tab-all" role="tab" aria-selected=${!s.selectedUnit}
          onClick=${function () { self.filter({ selectedUnit: null, selectedTags: [] }); }}>${t('catalog.all')}</button>
        ${(p.course.units || []).map(function (unit) {
          return html`<button type="button" key=${unit.id} class=${cls('btn', s.selectedUnit === unit.id && 'primary')}
            data-testid=${'tab-' + unit.id} role="tab" aria-selected=${s.selectedUnit === unit.id}
            onClick=${function () { self.filter({ selectedUnit: unit.id, selectedTags: [] }); }}>${renderText(unit.title)}</button>`;
        })}
      </div>`;
    }

    renderFilters(p, s, t) {
      var self = this;
      var tags = this.allTags();
      var shown = s.tagsOpen ? tags : tags.filter(function (tag, i) { return i < CATALOG_TAGS_SHOWN || s.selectedTags.indexOf(tag) >= 0; });
      return html`<div class="catalog-filters">
        <input type="search" class="field catalog-search" placeholder=${t('catalog.search')} aria-label=${t('catalog.search')}
          data-testid="catalog-search" name="catalog-search" value=${s.search}
          onInput=${function (e) { self.filter({ search: e.target.value }); }} />
        <div class="chips" data-testid="stage-filters">
          ${STAGES.map(function (st) {
            return html`<${Chip} key=${'st-' + st} on=${s.selectedStages.indexOf(st) >= 0} testid=${'filter-stage-' + st}
              onClick=${function () { self.filter({ selectedStages: toggle(s.selectedStages, st) }); }}>${t('catalog.stage.' + st)}<//>`;
          })}
        </div>
        <div class="chips" data-testid="tag-chips">
          ${shown.map(function (tag) {
            return html`<${Chip} key=${'tag-' + tag} on=${s.selectedTags.indexOf(tag) >= 0} testid=${'tag-' + tag}
              onClick=${function () { self.filter({ selectedTags: toggle(s.selectedTags, tag) }); }}>${tagInfo(p.course, tag).label}<//>`;
          })}
          ${tags.length > CATALOG_TAGS_SHOWN ? html`<button type="button" key="tags-more" class="chip" data-testid="tag-more"
            onClick=${function () { self.setState({ tagsOpen: !s.tagsOpen }); }}>${s.tagsOpen ? t('catalog.tags.less') : t('catalog.tags.more', { n: tags.length - shown.length })}</button>` : null}
        </div>
      </div>`;
    }

    renderTopicList(p, s, t, items) {
      var self = this;
      return html`<ul class="catalog-list" data-testid="catalog-list">
        ${items.map(function (r) {
          var state = topicState(r.es);
          return html`<li key=${'topic-' + r.id} data-testid=${'topic-' + r.id} class="catalog-item">
            <button type="button" class="catalog-btn" onClick=${function () { self.setState({ detailItem: r.item }); }}>
              <span class=${'catalog-state ' + state} data-testid=${'topic-state-' + r.id}>${t('catalog.state.' + state)}</span>
              <span class="catalog-prompt" data-testid=${'topic-label-' + r.id}>${renderText(topicTitle(r.item, self.introOf(r.item)))}</span>
              <span class="muted catalog-mastery" data-testid=${'topic-mastery-' + r.id}>${topicMastery(r.es)}%</span>
            </button>
          </li>`;
        })}
      </ul>`;
    }

    renderDetail(p, s, t, d) {
      var self = this;
      var dIntro = d ? this.introOf(d) : null;
      var dIntroOut = dIntro && DojoExt.intro ? DojoExt.intro(dIntro, d, this.hookCtx()) : null;
      var detailHookOut = d ? DojoExt.detail(d, this.hookCtx({ introRendered: !!dIntroOut })) : null;
      var dDecl = d && !detailHookOut ? renderDeclarativeDetail(p.course, this.unitById[d.unit] || null, d, p.t) : null;
      var course = p.course;
      return html`<div class="overlay" data-testid="catalog-detail" onClick=${function () { self.setState({ detailItem: null }); }}>
        <div class="dialog catalog-detail-dialog" role="dialog" aria-modal="true" onClick=${function (e) { e.stopPropagation(); }}>
          <div class="catalog-detail-header" data-testid="catalog-detail-header">
            <button type="button" class="btn icon" data-testid="btn-close-detail" onClick=${function () { self.setState({ detailItem: null }); }}>${t('close')}</button>
            ${(function () {
              var detailConfig = (self.unitById[d.unit] && self.unitById[d.unit].detail) || course.detail;
              if (!detailConfig || !detailConfig.glyph || typeof detailConfig.glyph !== 'string' || detailConfig.glyph === '') {
                return null;
              }
              var glyphValue = resolvePath(d, detailConfig.glyph);
              if (glyphValue !== null && typeof glyphValue === 'string' && glyphValue !== '') {
                return html`<span class="kanji-ch" data-testid="detail-glyph">${glyphValue}</span>`;
              }
              return null;
            })()}
            <h2>${t('catalog.detail')}</h2>
          </div>
          <article class="qcard">
            ${dIntro ? html`<section class="intro" data-testid="detail-intro">${renderIntroBody({ intro: dIntro, item: d, ctx: self.hookCtx(), decl: dDecl, all: false, pre: dIntroOut })}</section>` : null}
            ${!dIntro && dDecl ? dDecl : null}
            <p class="qtext" data-testid="detail-prompt">${renderText(d.prompt)}</p>
            <p data-testid="detail-answers"><b>${t('session.expected')}</b> <span class="pre">${renderText(p.engine.expected(d))}</span></p>
            ${d.explanation ? html`<p class="pre" data-testid="detail-explanation">${renderText(d.explanation)}</p>` : null}
            <p class="muted" data-testid="detail-stage">${t('catalog.stage')}: ${t('catalog.stage.' + p.engine.stage(d))}</p>
            ${(function () {
              var rec = p.engine.record(d);
              if (!rec) return null;
              var now = p.now();
              var due = rec.due;
              var days = due > now ? Math.ceil((due - now) / 86400000) : 0;
              var dueText = function () { return due <= now ? t('catalog.dueNow') : t('catalog.dueIn', { n: days }); };
              var okN = rec.ok || 0, badN = rec.bad || 0, stepN = rec.s || 0;
              return html`<p class="muted" data-testid="detail-step">${t('catalog.step', { s: stepN })} · ${dueText()}</p>
                <p class="muted" data-testid="detail-due">${t('catalog.due')}: ${dueText()}</p>
                <p class="muted" data-testid="detail-counts">${t('catalog.counts', { ok: okN, bad: badN })}</p>
                ${DojoDetail.renderExtrasStats(rec, t)}`;
            })()}
            ${detailHookOut ? html`<div data-testid="detail-hook">${detailHookOut}</div>` : null}
          </article>
        </div>
      </div>`;
    }

    render(p, s) {
      var t = p.t;
      var self = this;
      var all = this.topics();
      var items = all.slice(0, s.limit);
      var d = s.detailItem;

      return html`<main class="screen" data-testid="catalog">
        ${this.renderHeader(p, s, t)}
        ${this.renderTabs(p, s, t)}
        ${this.renderFilters(p, s, t)}
        <p class="muted catalog-count" data-testid="catalog-count">${t('catalog.topics.count', { n: all.length })}</p>
        ${s.search.trim() && all.length === 0 ? html`<p class="muted" data-testid="catalog-empty">${t('catalog.empty')}</p>` : null}
        ${this.renderTopicList(p, s, t, items)}
        ${all.length > items.length ? html`<button type="button" class="btn catalog-more" data-testid="catalog-more"
          onClick=${function () { self.setState({ limit: s.limit + CATALOG_PAGE }); }}>${t('catalog.more', { n: all.length - items.length })}</button>` : null}
        ${d ? this.renderDetail(p, s, t, d) : null}
      </main>`;
    }

    hookCtx(extra) {
      var p = this.props;
      return Object.assign({ items: p.content.items, records: p.store.doc.items || {}, t: p.t, h: h }, extra);
    }

    hook(item, extra) {
      var out = DojoExt.detail(item, this.hookCtx(extra));
      return out ? html`<div data-testid="detail-hook">${out}</div>` : null;
    }
  }

  function toggle(list, value) {
    return list.indexOf(value) >= 0 ? list.filter(function (x) { return x !== value; }) : list.concat([value]);
  }

  // Export helpers as globals for other modules to use
  root.tagInfo = tagInfo;
  root.collectStrings = collectStrings;
  root.captionFor = captionFor;

  // Export
  var api = { CatalogScreen: CatalogScreen };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.DojoCatalog = api;
})(typeof self !== 'undefined' ? self : this);

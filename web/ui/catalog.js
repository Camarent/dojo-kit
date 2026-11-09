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
  function loadDep(name, file) {
    return root[name] || (typeof require !== 'undefined' ? require(file) : null);
  }
  var DojoCommon = loadDep('DojoCommon', './common.js') || {};
  var DojoDetail = loadDep('DojoDetail', './detail.js') || {};
  var DojoTopicLevels = loadDep('DojoTopicLevels', './topic-levels.js') || {};
  var CatalogAudio = loadDep('DojoCatalogAudio', './catalog-audio.js');
  var DojoSession = loadDep('DojoSession', './session.js') || {};

  // Alias from DojoCommon
  var renderText = DojoCommon.renderText;
  var cls = DojoCommon.cls;
  var Chip = DojoCommon.Chip;

  // Alias from DojoDetail
  var renderDeclarativeDetail = DojoDetail.renderDeclarativeDetail;
  var renderIntroBody = DojoDetail.renderIntroBody;
  var resolvePath = DojoDetail.resolvePath;
  var topicStage = DojoDetail.topicStage;
  var topicState = DojoDetail.topicState;
  var topicMastery = DojoDetail.topicMastery;
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

  function toggle(list, value) {
    return list.indexOf(value) >= 0 ? list.filter(function (x) { return x !== value; }) : list.concat([value]);
  }

  function isPlainEscape(e) {
    return e.key === 'Escape' && !(e.ctrlKey || e.metaKey || e.altKey || e.shiftKey);
  }
  function arrowDir(e) { return e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0; }
  function isFormTarget(target) {
    var tag = target && target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  }

  var CATALOG_PAGE = 50;
  var CATALOG_TAGS_SHOWN = 12;
  var STAGES = ['new', 'learning', 'review'];

  class CatalogScreen extends Component {
    constructor(props) {
      super(props);
      var tabUnits = DojoCommon.visibleUnits(props.course.units, DojoCommon.countActiveByUnit(props.content.items));
      this.tabUnits = tabUnits;
      this.ca = CatalogAudio ? CatalogAudio.create(props.content) : null;
      this.state = { search: '', selectedUnit: tabUnits.length ? tabUnits[0].id : null, selectedTags: [], selectedStages: [], tagsOpen: false, limit: CATALOG_PAGE, detailItem: null };
      this.items = props.content.items.filter(DojoCommon.isActive);
      this.introById = Object.create(null);
      var ib = this.introById;
      (props.content.intros || []).forEach(function (i) { if (i && typeof i.id === 'string') ib[i.id] = i; });
      this.unitById = Object.create(null);
      var ub = this.unitById;
      (props.course.units || []).forEach(function (u) { if (u && typeof u.id === 'string') ub[u.id] = u; });
      this.index = this.buildIndex();
      this.ords = this.buildOrdinals();
      this.onKey = this.onKey.bind(this);
    }
    componentDidMount() { this.props.win.addEventListener('keydown', this.onKey); this.updateScrollLock(); }
    componentDidUpdate() { this.updateScrollLock(); }
    componentWillUnmount() { this.props.win.removeEventListener('keydown', this.onKey); this.clearScrollLock(); }
    updateScrollLock(on) {
      var body = this.props.win.document.documentElement;
      if (body) body.classList[(on === undefined ? this.state.detailItem : on) ? 'add' : 'remove']('dojo-no-scroll');
    }
    clearScrollLock() { this.updateScrollLock(false); }
    onKey(e) {
      var d = this.state.detailItem;
      if (!d) return;
      if (isPlainEscape(e)) {
        e.preventDefault();
        this.setState({ detailItem: null });
        return;
      }
      var dir = arrowDir(e);
      if (dir && !DojoTypes.keyBlocked(e) && !isFormTarget(e.target)) this.stepDetail(d, dir, e);
    }
    stepDetail(d, dir, e) {
      var id = d.entity || d.id;
      var list = this.topics();
      var at = list.findIndex(function (r) { return r.id === id; });
      var to = list[at + dir];
      if (at < 0 || !to) return;
      e.preventDefault();
      this.setState({ detailItem: to.item });
    }
    labelOf(item) {
      var ca = this.ca, g = (this.unitById[item.unit] && this.unitById[item.unit].detail) || this.props.course.detail;
      return DojoDetail.topicLabel(item, { intro: this.introOf(item), unit: this.unitById[item.unit] || null, stimulus: ca ? ca.stimulusOf(item) : null,
        expected: this.props.engine.expected(item), glyphPath: g && typeof g.glyph === 'string' ? g.glyph : '' });
    }
    buildOrdinals() {
      var self = this, total = Object.create(null), seen = Object.create(null), out = Object.create(null);
      var firsts = [], seenEnt = Object.create(null);
      this.items.forEach(function (it) {
        var id = it.entity || it.id;
        if (seenEnt[id]) return;
        seenEnt[id] = true;
        var l = self.labelOf(it);
        if (!l.ordinal) return;
        var k = it.unit + '\u0000' + l.text;
        total[k] = (total[k] || 0) + 1;
        firsts.push({ id: id, k: k });
      });
      firsts.forEach(function (f) {
        if (total[f.k] > 1) { seen[f.k] = (seen[f.k] || 0) + 1; out[f.id] = seen[f.k]; }
      });
      return out;
    }
    ordOf(item) { return this.ords[item.entity || item.id] || 0; }
    introOf(item) { return this.introById[item.entity || item.id] || null; }
    buildIndex() {
      var e = this.props.engine;
      var self = this;
      var idx = {};
      this.items.forEach(function (item) {
        var parts = [item.topic, item.prompt, e.expected(item), item.explanation];
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
        ${this.tabUnits.map(function (unit) {
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
      var titles = items.map(function (r) { return self.labelOf(r.item).text; });
      return html`<ul class="catalog-list" data-testid="catalog-list">
        ${items.map(function (r, i) {
          var ord = self.ordOf(r.item);
          var state = topicState(r.es);
          return html`<li key=${'topic-' + r.id} data-testid=${'topic-' + r.id} class="catalog-item">
            <button type="button" class="catalog-btn" onClick=${function () { self.setState({ detailItem: r.item }); }}>
              <span class=${'catalog-state ' + state} data-testid=${'topic-state-' + r.id}>${t('catalog.state.' + state)}</span>
              <span class="catalog-prompt" data-testid=${'topic-label-' + r.id}>${renderText(titles[i])}${ord ? html`<span class="muted catalog-ord"> #${ord}</span>` : null}</span>
              <span class="muted catalog-mastery" data-testid=${'topic-mastery-' + r.id}>${topicMastery(r.es)}%</span>
            </button>
          </li>`;
        })}
      </ul>`;
    }

    detailPlay(p, d) {
      if (!this.ca || !this.ca.isAudioNumeric(d)) return null;
      var self = this;
      return this.ca.playButton(p, d, this.ca.audioProps(p, function () { self.setState({ speechFail: true }); }, this.state.speechFail));
    }

    detailGlyph(p, d) {
      var cfg = (this.unitById[d.unit] && this.unitById[d.unit].detail) || p.course.detail;
      if (!cfg || typeof cfg.glyph !== 'string' || cfg.glyph === '') return null;
      var v = resolvePath(d, cfg.glyph);
      return typeof v === 'string' && v !== '' ? html`<span class="glyph-ch" data-testid="detail-glyph">${v}</span>` : null;
    }

    renderDetailBody(p, t, d) {
      var rec = p.engine.record(d);
      var dIntro = this.introOf(d);
      var dIntroOut = dIntro && DojoExt.intro ? DojoExt.intro(dIntro, d, this.hookCtx()) : null;
      var detailHookOut = DojoExt.detail(d, this.hookCtx({ introRendered: !!dIntroOut }));
      var dDecl = !detailHookOut ? renderDeclarativeDetail(p.course, this.unitById[d.unit] || null, d, p.t) : null;
      return html`<article class="qcard">
            ${dIntro ? html`<section class="intro" data-testid="detail-intro">${renderIntroBody({ intro: dIntro, item: d, ctx: this.hookCtx(), decl: dDecl, all: false, pre: dIntroOut })}</section>` : null}
            ${dIntro ? null : dDecl}
            ${this.detailPlay(p, d)}
            <p data-testid="detail-answers"><b>${t('session.expected')}</b> <span class="pre">${renderText(p.engine.expected(d))}</span></p>
            ${d.explanation ? html`<p class="pre" data-testid="detail-explanation">${renderText(d.explanation)}</p>` : null}
            <p class="muted" data-testid="detail-stage">${t('catalog.stage')}: ${t('catalog.stage.' + p.engine.stage(d))}</p>
            ${DojoTopicLevels.renderTopicLevels(p.course, d.entity || d.id, p.engine.topicLevels(), t)}
            ${DojoDetail.renderRecordStats(rec, rec ? p.now() : 0, t)}
            ${detailHookOut ? html`<div data-testid="detail-hook">${detailHookOut}</div>` : null}
          </article>`;
    }

    renderDetail(p, s, t, d) {
      var self = this;
      var close = function () { self.setState({ detailItem: null }); };
      return html`<div class="overlay" data-testid="catalog-detail" onClick=${close}>
        <div class="dialog catalog-detail-dialog" role="dialog" aria-modal="true" onClick=${function (e) { e.stopPropagation(); }}>
          <div class="catalog-detail-header" data-testid="catalog-detail-header">
            <button type="button" class="btn icon" data-testid="btn-close-detail" onClick=${close}>${t('close')}</button>
            ${self.detailGlyph(p, d)}
            <h2 data-testid="detail-title">${renderText(self.labelOf(d).text)}${self.ordOf(d) ? ' #' + self.ordOf(d) : ''}</h2>
          </div>
          ${self.renderDetailBody(p, t, d)}
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
  }

  // Export helpers as globals for other modules to use
  root.tagInfo = tagInfo;
  root.collectStrings = collectStrings;

  // Export
  var api = { CatalogScreen: CatalogScreen };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.DojoCatalog = api;
})(typeof self !== 'undefined' ? self : this);

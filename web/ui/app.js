/*
 * ui/app.js — Preact + htm UI. Defines window.DojoApp = { start(opts), fail(root, err) }.
 * Globals expected: preact, htm, DojoStorage, DojoSession, DojoTypes, DojoExt (question UIs live in types/*.js). Course text is rendered through DojoExt.text.
 * Sections: helpers, small components, Home, PracticeSetup, Session, Results, Settings, App, start/fail.
 */
(function (root) {
  'use strict';

  var h = preact.h;
  var Component = preact.Component;
  var Fragment = preact.Fragment;
  var html = htm.bind(h);
  var DojoExt = root.DojoExt || {};
  var DojoI18n = root.DojoI18n || (typeof require !== 'undefined' ? require('./i18n.js') : null) || {};

  // ---------- helpers ----------


  // Load common UI helpers from common.js
  var DojoCommon = root.DojoCommon || (typeof require !== 'undefined' ? require('./common.js') : null) || {};

  // Load detail rendering helpers
  var DojoDetail = root.DojoDetail || (typeof require !== 'undefined' ? require('./detail.js') : null) || {};

  // Load catalog and home modules
  var DojoCatalog = root.DojoCatalog || (typeof require !== 'undefined' ? require('./catalog.js') : null) || {};
  var DojoHome = root.DojoHome || (typeof require !== 'undefined' ? require('./home.js') : null) || {};

  // Alias from catalog and home
  var CatalogScreen = DojoCatalog.CatalogScreen;
  var GroupCard = DojoHome.GroupCard;
  var Home = DojoHome.Home;

  // Alias moved functions to preserve existing references
  var renderText = DojoCommon.renderText;
  var answerReadings = DojoCommon.answerReadings;
  var renderPrompt = DojoCommon.renderPrompt;
  var renderTextAll = DojoCommon.renderTextAll;
  var renderPromptEl = DojoCommon.renderPromptEl;
  var renderPromptLine = DojoCommon.renderPromptLine;
  var speechLines = DojoCommon.speechLines;
  var speechCfg = DojoCommon.speechCfg;
  var PlayButton = DojoCommon.PlayButton;
  var Playback = DojoCommon.Playback;
  var cls = DojoCommon.cls;
  var Chip = DojoCommon.Chip;
  var Stepper = DojoCommon.Stepper;
  var Dialog = DojoCommon.Dialog;
  var StatusChip = DojoCommon.StatusChip;
  var ProgressBar = DojoCommon.ProgressBar;
  var ProgressMeter = DojoCommon.ProgressMeter;
  var Notice = DojoCommon.Notice;
  var Loading = DojoCommon.Loading;
  var daysLeft = DojoCommon.daysLeft;
  var applyTheme = DojoCommon.applyTheme;
  var Speech = root.DojoSpeech || null;

  // Alias from DojoDetail, or use local definitions if not available
  var renderDeclarativeDetail = DojoDetail.renderDeclarativeDetail;
  var renderIntroBody = DojoDetail.renderIntroBody;
  var getMetaValue = DojoDetail.getMetaValue || function(item, key) {
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
  };
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

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function localDay(ms) {
    var d = new Date(ms);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function fmtClock(ms) {
    var s = Math.max(0, Math.round(ms / 1000));
    return Math.floor(s / 60) + ':' + pad2(s % 60);
  }

  function percent(fraction) { return Math.round((fraction || 0) * 100); }

  function uniqueSorted(list) {
    var seen = {};
    list.forEach(function (x) { seen[x] = true; });
    return Object.keys(seen).sort();
  }

  function toggle(list, value) {
    return list.indexOf(value) >= 0 ? list.filter(function (x) { return x !== value; }) : list.concat([value]);
  }

  function fmtExamDate(lang, key) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key || '');
    if (!m) return '';
    try {
      return new Intl.DateTimeFormat(lang || 'en', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])));
    } catch (e) { return key; }
  }

  function tagInfo(course, tag) {
    if (typeof DojoSession !== 'undefined' && DojoSession.tagInfo) return DojoSession.tagInfo(course, tag);
    var e = course && course.tagLabels && Object.prototype.hasOwnProperty.call(course.tagLabels, tag) ? course.tagLabels[tag] : null;
    var label = typeof e === 'string' ? e : e && typeof e.label === 'string' ? e.label : '';
    return { label: label || String(tag).toUpperCase(), internal: !!(e && typeof e === 'object' && e.kind === 'internal') };
  }

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

  function orderedGroupIds(course, groups) {
    var ids = (course.groups || []).map(function (g) { return g.id; }).filter(function (id) { return groups[id] !== undefined; });
    Object.keys(groups).forEach(function (id) { if (ids.indexOf(id) < 0) ids.push(id); });
    return ids;
  }

  function Stimulus(p) {
    var st = p.stimulus;
    if (!st) return null;
    var audio = p.audio;
    var lines = audio ? speechLines(st) : [];
    var speakable = lines.length > 0;
    var showText = !st.hideText || (speakable && audio.status !== 'ok');
    return html`<section class="stimulus" data-testid="stimulus">
      ${st.title ? html`<h2 class="stimulus-title" data-testid="stimulus-title">${renderText(st.title)}</h2>` : null}
      ${speakable && showText ? html`
        <div class="qline">
          <p class="qbody stimulus-text" data-testid="stimulus-text">${renderText(st.text)}</p>
          <${Playback} audio=${audio} lines=${lines} testid="play-stimulus" pid=${'s:' + st.id} />
        </div>
      ` : null}
      ${showText && !speakable ? html`<p class="stimulus-text" data-testid="stimulus-text">${renderText(st.text)}</p>` : null}
      ${speakable && !showText ? html`<${Playback} audio=${audio} lines=${lines} testid="play-stimulus" pid=${'s:' + st.id} />` : null}
    </section>`;
  }


  // ---------- Home ----------

  

  function kanjiRows(p, s, examMode) {
    var item = s.cur && s.cur.item;
    if (!item || !s.result || examMode || !DojoExt.kanjiBreakdown || !p.content || !p.content.items) return null;
    var cfgOrLang = p.course.breakdown;
    if (cfgOrLang === undefined) return null;
    var breakdown = DojoExt.kanjiBreakdown(item, p.content.items, cfgOrLang);
    if (!breakdown || !breakdown.length) return null;
    var t = p.t;
    return html`<ul class="kanji-rows" data-testid="kanji-rows">
      <li class="muted" data-testid="kanji-label">${t('session.kanji')}</li>
      ${breakdown.map(function (k) {
        var onRead = (Array.isArray(k.on) && k.on.length > 0) ? k.on.join(' / ') : null;
        var kunRead = (Array.isArray(k.kun) && k.kun.length > 0) ? k.kun.join(' / ') : null;
        return html`<li class="kanji-row-grid" data-testid="kanji-row">
          <span class="kanji-ch" data-testid="kanji-ch">${k.kanji}</span>
          <span class="kanji-mean" data-testid="kanji-mean">${k.meaning}</span>
          ${onRead || kunRead ? html`<span class="kanji-read muted" data-testid="kanji-read">
            ${onRead ? html`<span data-testid="kanji-on">${onRead}</span>` : null}
            ${onRead && kunRead ? ' / ' : ''}
            ${kunRead ? html`<span data-testid="kanji-kun">${kunRead}</span>` : null}
          </span>` : null}
        </li>`;
      })}
    </ul>`;
  }

  var DojoSessionScreen = root.DojoSessionScreen || (typeof require !== 'undefined' ? require('./session-screen.js') : null) || {};
  var DojoResults = root.DojoResults || (typeof require !== 'undefined' ? require('./results.js') : null) || {};
  var sessionParts = DojoSessionScreen.create({ Stimulus: Stimulus, kanjiRows: kanjiRows, tagInfo: tagInfo, captionFor: captionFor, fmtClock: fmtClock });
  var SessionBoundary = sessionParts.SessionBoundary;
  var SessionScreen = sessionParts.SessionScreen;
  var Results = DojoResults.create({ percent: percent, fmtClock: fmtClock }).Results;
  var DojoPlacement = root.DojoPlacement || (typeof require !== 'undefined' ? require('./placement.js') : null) || {};
  var placementParts = DojoPlacement.create({ uniqueSorted: uniqueSorted, tagInfo: tagInfo, toggle: toggle, Stimulus: Stimulus, kanjiRows: kanjiRows });
  var PracticeSetup = placementParts.PracticeSetup;
  var PlacementScreen = placementParts.PlacementScreen;
  var PlacementSession = placementParts.PlacementSession;

  var DojoSettingsSpeech = root.DojoSettingsSpeech || (typeof require !== 'undefined' ? require('./settings-speech.js') : null) || {};
  var DojoSettings = root.DojoSettings || (typeof require !== 'undefined' ? require('./settings.js') : null) || {};
  var settingsParts = DojoSettings.create({ renderSpeechSettings: DojoSettingsSpeech.create().renderSpeechSettings });
  var SettingsScreen = settingsParts.SettingsScreen;
  var renderPluginSettings = settingsParts.renderPluginSettings;

  // ---------- App ----------

  class App extends Component {
    constructor(props) {
      super(props);
      this.state = { screen: 'home', status: props.store.status, notice: null, session: null, summary: null, home: null, placementIntro: false, confirmNew: null };
      this.state.home = this.homeData();
      this.lastStart = null;
    }
    homeData() {
      var p = this.props;
      var doc = p.store.doc;
      var streak = 0;
      try { streak = p.dojo.call('streak', { days: (doc.stats && doc.stats.days) || {}, todayKey: p.today() }); } catch (e) { streak = 0; }
      var weak = false;
      try { weak = !p.engine.start('weak', { limit: 1 }).error; } catch (e) { weak = false; }
      var pl = p.engine.placement ? p.engine.placement() : { done: false };
      var resume = null;
      var draft = p.engine.examDraft ? p.engine.examDraft() : null;
      if (draft) {
        resume = { examId: draft.examId, answered: draft.answers.length, total: draft.ids.length, remainingMs: draft.remainingMs[draft.group] };
      }
      return { counts: p.engine.counts(), streak: streak, weak: weak, placementDone: pl.done, resume: resume };
    }
    scrollTop() {
      var w = this.props.win;
      if (w && typeof w.scrollTo === 'function') { try { w.scrollTo(0, 0); } catch (e) { /* no scroll */ } }
    }
    setStatus(status) { this.setState({ status: status }); }
    remoteChanged() {
      this.setState({ home: this.homeData() });
    }
    refresh() { this.setState({ home: this.homeData() }); }
    go(screen) {
      this.setState({ screen: screen, notice: null, session: null, placementIntro: false, home: screen === 'home' ? this.homeData() : this.state.home });
      this.scrollTop();
    }
    endSession(summary) {
      this.props.store.flush();
      this.setState({ screen: 'results', summary: summary, session: null });
      this.scrollTop();
    }
    finishBroken(session) {
      var sum = session.finish();
      if (sum && !sum.error) this.endSession(sum); else this.exitSession();
    }
    exitSession() {
      if (this.state.session && this.state.session.abandon) this.state.session.abandon();
      this.props.store.flush();
      this.go('home');
    }
    again() {
      if (this.lastStart) this.startMode(this.lastStart.mode, this.lastStart.opts);
      else this.go('home');
    }
    addMoreNew(count) {
      this.props.engine.moreNew(count);
      this.refresh();
    }
    setGroupSetting(gid, field, value) {
      var patch = {};
      patch[field] = value;
      var result = this.props.engine.setGroupSetting(gid, patch);
      if (result.error) {
        this.setState({ notice: this.props.t('settings.groupSettings.error', { field: field, error: result.error }) });
        return;
      }
      this.refresh();
    }
    startPlacement() {
      var session = this.props.engine.start('placement', {});
      if (session.error) {
        this.setState({ notice: this.props.t('start.' + session.error), placementIntro: false });
        return;
      }
      this.lastStart = { mode: 'placement', opts: {} };
      this.setState({ screen: 'session', session: session, notice: null, placementIntro: false });
      this.scrollTop();
    }
    showPlacementIntro() {
      this.setState({ placementIntro: true });
    }
    resumeExam() {
      var draft = this.props.engine.examDraft ? this.props.engine.examDraft() : null;
      if (!draft) { this.refresh(); return; }
      var session = this.props.engine.start('exam', { examId: draft.examId, resume: draft });
      if (session.error) {
        this.setState({ notice: this.props.t('start.' + session.error), home: this.homeData() });
        return;
      }
      this.lastStart = { mode: 'exam', opts: { examId: draft.examId } };
      if (session.done) {
        var sum = session.finish();
        if (sum.error) { this.setState({ notice: this.props.t('session.error', { code: sum.error }), home: this.homeData() }); return; }
        this.endSession(sum);
        return;
      }
      this.setState({ screen: 'session', session: session, notice: null });
      this.scrollTop();
    }
    discardDraft() {
      var draft = this.props.engine.examDraft ? this.props.engine.examDraft() : null;
      if (draft) this.props.engine.discardDraft(draft.sid);
      this.refresh();
    }
    startOver() {
      var draft = this.props.engine.examDraft ? this.props.engine.examDraft() : null;
      if (!draft) return;
      this.props.engine.discardDraft(draft.sid);
      this.setState({ home: this.homeData() });
      this.startMode('exam', { examId: draft.examId }, true);
    }
    startMode(mode, opts, confirmed) {
      var resume = this.state.home && this.state.home.resume;
      if (!confirmed && mode === 'exam' && !opts.training && resume) {
        this.setState({ confirmNew: { mode: mode, opts: opts } });
        return;
      }
      var session = this.props.engine.start(mode, opts);
      if (session.error) {
        this.setState({ notice: this.props.t('start.' + session.error) });
        return;
      }
      this.lastStart = { mode: mode, opts: opts };
      this.setState({ screen: 'session', session: session, notice: null });
      this.scrollTop();
    }
    confirmNewCancel() {
      this.setState({ confirmNew: null });
    }
    confirmNewProceed() {
      var c = this.state.confirmNew;
      if (!c) return;
      this.setState({ confirmNew: null });
      var draft = this.props.engine.examDraft ? this.props.engine.examDraft() : null;
      if (draft) this.props.engine.discardDraft(draft.sid);
      this.startMode(c.mode, c.opts, true);
    }
    render(p, s) {
      var self = this;
      var common = { t: p.t, course: p.course, status: s.status, notice: s.notice, dojo: p.dojo, go: function (x) { self.go(x); } };
      var body;
      var home = s.home || {};
      if (s.confirmNew) {
        body = h(Dialog, {
          testid: 'confirm-new-exam',
          title: p.t('home.resume.confirm.title'),
          body: p.t('home.resume.confirm.body'),
          confirmLabel: p.t('home.resume.confirm.yes'),
          danger: false,
          cancelLabel: p.t('cancel'),
          onConfirm: function () { self.confirmNewProceed(); },
          onCancel: function () { self.confirmNewCancel(); }
        });
      } else if (s.placementIntro) {
        body = h(PlacementScreen, Object.assign({ onStart: function () { self.startPlacement(); } }, common));
      } else if (s.screen === 'practice') {
        body = h(PracticeSetup, Object.assign({ content: p.content, onStart: function (m, o) { self.startMode(m, o); } }, common));
      } else if (s.screen === 'session' && s.session && s.session.mode === 'placement') {
        body = h(SessionBoundary, { key: s.session.id, t: p.t, session: s.session, onExit: function () { self.exitSession(); }, onFinish: function () { self.finishBroken(s.session); } },
          h(PlacementSession, { t: p.t, lang: p.lang, session: s.session, now: p.now, win: p.win, course: p.course, store: p.store,
            onEnd: function (sum) { self.endSession(sum); }, onExit: function () { self.exitSession(); } }));
      } else if (s.screen === 'session') {
        body = h(SessionBoundary, { key: s.session.id, t: p.t, session: s.session, onExit: function () { self.exitSession(); }, onFinish: function () { self.finishBroken(s.session); } },
          h(SessionScreen, { t: p.t, lang: p.lang, session: s.session, now: p.now, win: p.win, course: p.course, content: p.content, store: p.store,
            onEnd: function (sum) { self.endSession(sum); }, onExit: function () { self.exitSession(); } }));
      } else if (s.screen === 'results') {
        var isPlacement = s.summary && s.summary.mode === 'placement';
        body = h(Results, Object.assign({ summary: s.summary, byId: p.byId, onAgain: function () { self.again(); }, isPlacement: isPlacement }, common));
      } else if (s.screen === 'settings') {
        body = h(SettingsScreen, Object.assign({ lang: p.lang, store: p.store, content: p.content, engine: p.engine, now: p.now, win: p.win,
          onDataChanged: function () { self.refresh(); }, onPlacement: function () { self.showPlacementIntro(); },
          onNotice: function (n) { self.setState({ notice: n.text }); } }, common));
      } else if (s.screen === 'catalog') {
        body = h(CatalogScreen, Object.assign({ content: p.content, store: p.store, engine: p.engine, now: p.now, win: p.win }, common));
      } else {
        var doc = p.store.doc;
        var examDate = doc.settings && doc.settings.examDate ? doc.settings.examDate : null;
        var examDaysLeft = daysLeft(examDate, p.today());
        body = h(Home, Object.assign({ home: home, engine: p.engine, exams: p.engine.exams ? p.engine.exams() : [], onStart: function (m, o) { self.startMode(m, o); }, onPlacement: function () { self.showPlacementIntro(); }, onMoreNew: function (n) { self.addMoreNew(n); }, onGroupSetting: function (gid, field, value) { self.setGroupSetting(gid, field, value); }, examDate: examDate, examDaysLeft: examDaysLeft, lang: p.lang, resume: home.resume, onResume: function () { self.resumeExam(); }, onStartOver: function () { self.startOver(); }, onDiscard: function () { self.discardDraft(); } }, common));
      }
      return html`<div class="app">${body}</div>`;
    }
  }

  // ---------- start / fail ----------

  function ErrorScreen(p) {
    var t = p.t;
    return html`<div class="app"><main class="screen" data-testid="error" role="alert">
      <header class="head"><h1>${t('error.title')}</h1></header>
      <p>${t('error.body')}</p>
      <details data-testid="error-details"><summary>${t('error.details')}</summary><pre class="pre mono">${p.message}</pre></details>
    </main></div>`;
  }

  function fail(rootEl, err) {
    var i18n = root.__DOJO_I18N__ || null;
    var t = DojoI18n.makeT(i18n, DojoI18n.pickLang(i18n, 'en'));
    var message = err && (err.stack || err.message) ? (err.name ? err.name + ': ' : '') + (err.message || String(err)) : String(err);
    try { preact.render(null, rootEl); } catch (e) { /* tree already broken */ }
    try { rootEl.textContent = ''; } catch (e) { /* no DOM */ }
    try {
      preact.render(h(ErrorScreen, { t: t, message: message }), rootEl);
    } catch (e) {
      try { rootEl.textContent = 'Error: ' + message; } catch (e2) { /* no DOM */ }
    }
  }

  function start(opts) {
    var rootEl = opts.root;
    var content = opts.content;
    var course = content.course;
    var now = opts.now || Date.now;
    var win = opts.win || root;
    var i18n = opts.i18n || root.__DOJO_I18N__ || null;
    var t = DojoI18n.makeT(i18n, opts.lang || course.uiLanguage || 'en');
    if (DojoExt.use) DojoExt.use(course.markup);
    if (DojoExt.useRuby) DojoExt.useRuby(course.ruby, content.items);
    if (DojoExt.useInputScript) DojoExt.useInputScript(course.inputScript, t('guard.script'));
    var holder = { app: null };
    try { if (rootEl && rootEl.setAttribute && (course.contentLanguage || course.uiLanguage)) rootEl.setAttribute('lang', course.contentLanguage || course.uiLanguage); } catch (e) { /* no DOM */ }
    preact.render(h(Loading, { t: t }), rootEl);
    function today() { return localDay(now()); }
    var store = DojoStorage.createStore({
      courseId: course.id,
      dojo: opts.dojo,
      now: now,
      localStorage: opts.localStorage || null,
      claude: opts.claude || null,
      onStatus: function (s) { if (holder.app) holder.app.setStatus(s); },
      onRemoteChange: function () { if (holder.app) holder.app.remoteChanged(); }
    });
    return store.load().then(function () {
      applyTheme(win, store.doc.settings && store.doc.settings.theme);
      if (DojoExt.bindSettings) {
        DojoExt.bindSettings(function (key) {
          return store.doc.settings && store.doc.settings[key];
        });
      }
      var engine = DojoSession.createEngine({ dojo: opts.dojo, store: store, content: content, now: now, today: today, random: Math.random });
      store.attachLifecycle(win);
      var byId = {};
      content.items.forEach(function (it) { byId[it.id] = it; });
      preact.render(h(App, { ref: function (a) { holder.app = a; }, t: t, lang: opts.lang || course.uiLanguage || 'en', store: store, engine: engine, dojo: opts.dojo,
        content: content, course: course, byId: byId, now: now, today: today, win: win }), rootEl);
      return { store: store, engine: engine };
    }).catch(function (e) { fail(rootEl, e); });
  }

  root.DojoApp = { start: start, fail: fail, _makeT: DojoI18n.makeT, _pickLang: DojoI18n.pickLang, _Stimulus: Stimulus, _SessionScreen: SessionScreen, _Results: Results, _Home: Home, _App: App, _CatalogScreen: CatalogScreen, _SettingsScreen: SettingsScreen, _PlacementSession: PlacementSession, _PracticeSetup: PracticeSetup, _ProgressBar: ProgressBar, _daysLeft: daysLeft, _applyTheme: applyTheme, _pluralForm: DojoI18n.pluralForm, _renderPluginSettings: renderPluginSettings };
})(typeof self !== 'undefined' ? self : this);

/*
 * ui/app.js — Preact + htm UI. Defines window.DojoApp = { start(opts), fail(root, err) }.
 * Globals expected: preact, htm, DojoStorage, DojoSession, DojoTypes, DojoExt (question UIs live in types/*.js). Course text is rendered through DojoExt.text.
 */
(function (root) {
  'use strict';

  var h = preact.h;
  var Component = preact.Component;
  var html = htm.bind(h);
  var DojoExt = root.DojoExt || {};
  var DojoI18n = root.DojoI18n || (typeof require !== 'undefined' ? require('./i18n.js') : null) || {};

  var DojoCommon = root.DojoCommon || (typeof require !== 'undefined' ? require('./common.js') : null) || {};

  var DojoCatalog = root.DojoCatalog || (typeof require !== 'undefined' ? require('./catalog.js') : null) || {};

  var CatalogScreen = DojoCatalog.CatalogScreen;
  var Home = (root.DojoHome || (typeof require !== "undefined" ? require("./home.js") : null) || {}).Home;

  var Dialog = DojoCommon.Dialog;
  var ProgressBar = DojoCommon.ProgressBar;
  var Loading = DojoCommon.Loading;
  var daysLeft = DojoCommon.daysLeft;
  var applyTheme = DojoCommon.applyTheme;

  var DojoStimulus = root.DojoStimulus || (typeof require !== 'undefined' ? require('./stimulus.js') : null) || {};
  var shared = DojoStimulus.create();
  var Stimulus = shared.Stimulus;

  var DojoSessionScreen = root.DojoSessionScreen || (typeof require !== 'undefined' ? require('./session-screen.js') : null) || {};
  var DojoResults = root.DojoResults || (typeof require !== 'undefined' ? require('./results.js') : null) || {};
  var sessionParts = DojoSessionScreen.create({ Stimulus: Stimulus, kanjiRows: shared.kanjiRows, tagInfo: shared.tagInfo, captionFor: shared.captionFor, fmtClock: shared.fmtClock });
  var SessionBoundary = sessionParts.SessionBoundary;
  var SessionScreen = sessionParts.SessionScreen;
  var Results = DojoResults.create({ percent: shared.percent, fmtClock: shared.fmtClock }).Results;
  var DojoPlacement = root.DojoPlacement || (typeof require !== 'undefined' ? require('./placement.js') : null) || {};
  var placementParts = DojoPlacement.create({ uniqueSorted: shared.uniqueSorted, tagInfo: shared.tagInfo, toggle: shared.toggle, Stimulus: Stimulus, kanjiRows: shared.kanjiRows });
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
    function today() { return shared.localDay(now()); }
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

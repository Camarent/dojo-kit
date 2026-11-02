/*
 * ui/app-screens.js — screen routing for the App shell (ui/app.js).
 * create(deps) returns SCREENS: { screenName: function (app, props, state, common) -> vnode }.
 * deps: { SessionBoundary, PlacementSession, SessionScreen, PracticeSetup, Results, SettingsScreen, CatalogScreen, Home, daysLeft }.
 */
(function (root) {
  'use strict';

  var h = preact.h;

  function create(deps) {
    var SessionBoundary = deps.SessionBoundary;
    var PlacementSession = deps.PlacementSession;
    var SessionScreen = deps.SessionScreen;
    var PracticeSetup = deps.PracticeSetup;
    var Results = deps.Results;
    var SettingsScreen = deps.SettingsScreen;
    var CatalogScreen = deps.CatalogScreen;
    var Home = deps.Home;
    var daysLeft = deps.daysLeft;

    function sessionProps(self, p, s) {
      return { t: p.t, lang: p.lang, session: s.session, engine: p.engine, now: p.now, win: p.win, course: p.course, store: p.store,
        onEnd: function (sum) { self.endSession(sum); }, onExit: function () { self.exitSession(); } };
    }
    function sessionScreen(self, p, s) {
      var placement = s.session && s.session.mode === 'placement';
      var props = sessionProps(self, p, s);
      if (!placement) props.content = p.content;
      return h(SessionBoundary, { key: s.session.id, t: p.t, session: s.session, onExit: props.onExit, onFinish: function () { self.finishBroken(s.session); } },
        h(placement ? PlacementSession : SessionScreen, props));
    }
    function practiceScreen(self, p, s, common) {
      return h(PracticeSetup, Object.assign({ content: p.content, onStart: function (m, o) { self.startMode(m, o); } }, common));
    }
    function resultsScreen(self, p, s, common) {
      var isPlacement = s.summary && s.summary.mode === 'placement';
      return h(Results, Object.assign({ summary: s.summary, byId: p.byId, stimuli: p.content && p.content.stimuli, win: p.win, store: p.store, engine: p.engine, lang: p.lang, onAgain: function () { self.again(); }, isPlacement: isPlacement }, common));
    }
    function settingsScreen(self, p, s, common) {
      return h(SettingsScreen, Object.assign({ lang: p.lang, store: p.store, content: p.content, engine: p.engine, now: p.now, win: p.win,
        onDataChanged: function () { self.refresh(); }, onPlacement: function () { self.showPlacementIntro(); },
        onNotice: function (n) { self.setState({ notice: n.text }); } }, common));
    }
    function catalogScreen(self, p, s, common) {
      return h(CatalogScreen, Object.assign({ content: p.content, store: p.store, engine: p.engine, now: p.now, win: p.win }, common));
    }
    function homeScreen(self, p, s, common) {
      var home = s.home || {};
      var doc = p.store.doc;
      var examDate = doc.settings && doc.settings.examDate ? doc.settings.examDate : null;
      var examDaysLeft = daysLeft(examDate, p.today());
      return h(Home, Object.assign({ home: home, engine: p.engine, exams: p.engine.exams ? p.engine.exams() : [], onStart: function (m, o) { self.startMode(m, o); }, onPlacement: function () { self.showPlacementIntro(); }, onMoreNew: function (n) { self.addMoreNew(n); }, onGroupSetting: function (gid, field, value) { self.setGroupSetting(gid, field, value); }, examDate: examDate, examDaysLeft: examDaysLeft, lang: p.lang, resume: home.resume, onResume: function () { self.resumeExam(); }, onStartOver: function () { self.startOver(); }, onDiscard: function () { self.discardDraft(); } }, common));
    }
    return { practice: practiceScreen, session: sessionScreen, results: resultsScreen, settings: settingsScreen, catalog: catalogScreen, home: homeScreen };
  }

  var api = { create: create };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.DojoAppScreens = api;
})(typeof self !== 'undefined' ? self : this);

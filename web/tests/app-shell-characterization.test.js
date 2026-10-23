'use strict';
const test = require('node:test');
const assert = require('node:assert');
const H = require('./app-harness.js');

const GOLD = {"home":{"body":["Home"],"ids":["home","status-chip","stat-streak","stat-due","stat-new","btn-placement","btn-review","btn-practice","btn-settings","btn-catalog","exam-box","btn-training-m1","btn-exam","units","total-progress","unit-u1","unit-u2"],"text":"Cstatus.ok0day streak0cards due3new todayPlacement testReviewPracticeSettingsCatalogMock examsMock30 minutes \u00b7 STraining (untimed)Start examUnitsU1303U2000Total, due, new"},"go-catalog":{"body":["CatalogScreen"],"ids":[],"text":""},"go-settings":{"body":["SettingsScreen"],"ids":[],"text":""},"go-practice":{"body":["PracticeSetup"],"ids":[],"text":""},"go-home":{"body":["Home"],"ids":["home","status-chip","stat-streak","stat-due","stat-new","btn-placement","btn-review","btn-practice","btn-settings","btn-catalog","exam-box","btn-training-m1","btn-exam","units","total-progress","unit-u1","unit-u2"],"text":"Cstatus.ok0day streak0cards due3new todayPlacement testReviewPracticeSettingsCatalogMock examsMock30 minutes \u00b7 STraining (untimed)Start examUnitsU1303U2000Total, due, new"},"placementIntro":{"body":["PlacementScreen"]},"sessionScreen":{"screen":"session","mode":"practice","body":["SessionBoundary","SessionScreen"]},"placementSession":{"screen":"session","mode":"placement","body":["SessionBoundary","PlacementSession"]},"confirmNew":{"body":["Dialog"],"ids":[]},"resultsScreen":{"screen":"results","body":["Dialog"]},"resultsNormal":{"ids":["results","score","percent","time","missed","missed-g1","skipped-g3","skipped-label","btn-again-session","btn-home"],"text":"Results1 / 2Score50%Percent0:01TimeMissedP1Your answer: yCorrect: g3Skipped (timer expired)Do againHome"},"resultsZero":{"ids":["results","score","percent","time","results-hint","no-missed","btn-again-session","btn-home"],"text":"Results0 / 2Score0%Percent0:00TimeReview weak spots from HomeMissedNothing missed.Do againHome"},"resultsExam":{"ids":["results","exam-verdict","exam-estimate","exam-training","score","percent","time","exam-parts","part-0","exam-total-points","exam-note","missed","missed-g1","btn-again-session","btn-home"],"text":"ResultsNot passed (estimate)Points are a proportional estimate; the official exam uses scaled scores.Training attempt: not recorded.1 / 3Score33%Percent0:05TimePartsS: 1 / 3 \u00b7 {n} points \u00b7 Not passedTotal: {n} pointsNSome sections have fewer questions than requested.MissedP1Your answer: yCorrect: Do againHome"},"resultsPlacement":{"ids":["results","placement-result","btn-home"],"text":"ResultsPlacement complete. Your initial level has been set.Home"}};
const items = [1, 2, 3].map((i) => ({ id: 'g' + i, unit: 'u1', type: 'gap', prompt: 'P' + i, answers: ['x'], tags: ['a'] }));
const course = {
  exams: [{ id: 'm1', title: 'Mock', passMark: 0.5, minutes: 30, sections: [{ title: 'S', count: 3, tags: ['a'] }] }],
  placement: { mode: 'check' }
};

function ids(tree) {
  const out = [];
  H.walk(tree, (n) => { const id = n.props['data-testid']; if (typeof id === 'string') out.push(id); });
  return out;
}
function shot(tree) { return { ids: ids(tree), text: H.text(tree) }; }
function body(m) {
  const names = [];
  H.walk(m.app.render(m.app.props, m.app.state), (n) => { if (typeof n.type === 'function') names.push(n.type.name); });
  return names;
}

async function collect() {
  const got = {};
  const m = await H.mount({ items, course });
  got.home = Object.assign({ body: body(m) }, shot(m.tree()));
  ['catalog', 'settings', 'practice', 'home'].forEach((s) => { m.app.go(s); got['go-' + s] = Object.assign({ body: body(m) }, shot(m.tree())); });
  m.app.showPlacementIntro();
  got.placementIntro = { body: body(m) };
  m.app.go('home');
  m.app.startMode('practice', { limit: 2 });
  got.sessionScreen = { screen: m.app.state.screen, mode: m.app.state.session && m.app.state.session.mode, body: body(m) };
  m.app.go('home');
  m.app.startPlacement();
  got.placementSession = { screen: m.app.state.screen, mode: m.app.state.session && m.app.state.session.mode, body: body(m) };
  m.app.go('home');
  m.app.state.home = Object.assign({}, m.app.state.home, { resume: { examId: 'm1' } });
  m.app.startMode('exam', { examId: 'm1' });
  got.confirmNew = { body: body(m), ids: ids(m.tree()) };
  m.app.go('home');
  const rs = (summary) => shot(H.expand(m.sb.DojoApp._Results({ t: m.t, byId: { g1: items[0] }, go() {}, onAgain() {}, summary })));
  const review = [{ id: 'g1', correct: false, given: 'y', answers: ['x'] }, { id: 'g2', correct: true }];
  m.app.endSession({ mode: 'practice', review: [], skipped: [], correct: 0, answered: 0 });
  got.resultsScreen = { screen: m.app.state.screen, body: body(m) };
  got.resultsNormal = rs({ mode: 'practice', correct: 1, answered: 2, raw: 1, total: 2, durationMs: 1000, review, skipped: ['g3'], fraction: 0.5 });
  got.resultsZero = rs({ mode: 'practice', correct: 0, answered: 2, review: [], skipped: [], durationMs: 0 });
  got.resultsExam = rs({ mode: 'exam', raw: 1, total: 3, fraction: 0.33, pass: false, passed: false, durationMs: 5000, review, skipped: [], estimate: true, training: true, note: 'N', short: ['s'], parts: [{ title: 'S', raw: 1, total: 3 }] });
  got.resultsPlacement = rs({ mode: 'placement', review: [], skipped: [], correct: 0, answered: 0 });
  return got;
}

test('app shell and results characterization', async () => {
  const got = await collect();
  assert.deepStrictEqual(got, GOLD);
});

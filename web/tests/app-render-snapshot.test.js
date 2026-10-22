'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const H = require('./app-harness.js');

const SNAP_PATH = path.join(__dirname, 'snapshots', 'app-render.json');

function mkContent() {
  const units = [{ id: 'u1', title: 'Unit A' }, { id: 'u2', title: 'Unit B' }];
  const items = [];
  units.forEach((u, ui) => {
    for (let i = 1; i <= 3; i++) {
      items.push({ id: u.id + '-' + i, unit: u.id, type: 'gap', prompt: 'Q ' + u.id + ' ' + i, answers: ['a' + u.id + i], explanation: 'e', tags: [ui === 0 ? 'a' : 'b'], speak: 'hello ' + i });
    }
  });
  return {
    items,
    course: {
      id: 'c', title: 'C', contentLanguage: 'ja', uiLanguage: 'en', units,
      groups: [{ id: 'g1', title: 'Group 1', units: ['u1'], newPerDay: 5 }],
      exams: [{ id: 'm1', title: 'Mock Exam', passMark: 0.5, minutes: 30, sections: [{ title: 'Section A', count: 3, tags: ['a'] }, { title: 'Section B', count: 3, tags: ['b'] }] }],
      speech: { lang: 'ja' },
      newPerDay: 10,
      bars: [{ title: 'Unit A bar', units: ['u1'], learnedStage: 1 }],
      placement: { mode: 'check' }
    }
  };
}

function serializeNode(n) {
  if (Array.isArray(n)) return n.map(serializeNode);
  if (n === null || n === undefined) return null;
  if (typeof n === 'string' || typeof n === 'number' || typeof n === 'boolean') return n;
  if (!n.props) return n;
  const out = { type: n.type.name || String(n.type) };
  const props = {};
  ['data-testid', 'className', 'class', 'testid', 'id', 'value', 'title', 'aria-label', 'aria-hidden', 'disabled', 'hidden', 'type', 'htmlFor', 'for', 'href', 'src', 'alt', 'role', 'tabIndex', 'tabindex', 'placeholder', 'maxLength', 'maxlength', 'min', 'max', 'step', 'checked', 'selected', 'readOnly', 'readonly', 'autoComplete', 'autocomplete', 'autoFocus', 'autofocus', 'style'].forEach((k) => {
    if (n.props[k] !== undefined) {
      const v = n.props[k];
      props[k] = (typeof v === 'function' || typeof v === 'symbol') ? undefined : v;
    }
  });
  const children = [];
  const c = n.props.children;
  if (c !== undefined) {
    if (Array.isArray(c)) {
      c.forEach((child) => {
        const s = serializeNode(child);
        if (s !== null) children.push(s);
      });
    } else if (c !== null && c !== undefined) {
      const s = serializeNode(c);
      if (s !== null) children.push(s);
    }
  }
  if (children.length > 0) props.children = children;
  if (n.key !== undefined && typeof n.key === 'string') props.key = n.key;
  out.props = props;
  return out;
}

const VOICES = [{ name: 'Kyoko', lang: 'ja-JP' }];
const WRONG_LANG_VOICES = [{ name: 'Samantha', lang: 'en-US' }];

function snapshotAll(m) {
  const S = (x) => serializeNode(x);
  const out = {};
  const Cls = m.sb.DojoApp;
  const enterSession = (mode, opts) => { m.app.startMode(mode, opts); };

  m.app.go('home');
  out.home = S(m.tree());

  m.app.go('catalog');
  out.catalog = S(m.screen(Cls._CatalogScreen).view());

  m.app.go('practice');
  out.practice = S(m.screen(Cls._PracticeSetup).view());

  m.app.go('settings');
  const settings = m.screen(Cls._SettingsScreen);
  out.settings = S(settings.view());
  settings.openUnitDialog('u1');
  out.settingsUnitOverrides = S(settings.view());
  settings.setState({ unitDialog: null });
  settings.openGroupDialog('g1');
  out.settingsGroupOverrides = S(settings.view());

  m.app.showPlacementIntro();
  let placementScreen = null;
  H.walk(m.tree(), (n) => { if (!placementScreen && typeof n.type === 'function' && n.type.name === 'PlacementScreen') placementScreen = n.type; });
  out.placementIntro = S(m.screen(placementScreen).view());
  m.app.setState({ placementIntro: false });

  m.app.startPlacement();
  const placement = m.screen(Cls._PlacementSession);
  out.placement = S(placement.view());

  m.win.voices = WRONG_LANG_VOICES;
  m.app.go('home');
  enterSession('practice', { unitId: 'u1' });
  const noVoice = m.screen(Cls._SessionScreen);
  out.sessionNoVoice = S(noVoice.view());

  m.win.voices = VOICES;
  m.app.go('home');
  enterSession('practice', { unitId: 'u1' });
  const session = m.screen(Cls._SessionScreen);
  out.session = S(session.view());
  session.answer({ text: 'wrong' }, null);
  out.sessionFeedback = S(session.view());

  m.app.endSession(m.app.state.session.finish());
  out.results = S(m.tree());
  return out;
}

async function mountFixture() {
  const c = mkContent();
  const m = await H.mount({
    items: c.items,
    course: c.course,
    settings: { theme: 'light' },
    win: H.fakeWin(VOICES),
    setup: (sb) => {
      sb.DojoExt = sb.DojoExt || {};
    }
  });
  return m;
}

test('snapshot: rendered VDOM of app screens stays byte-equal', { timeout: 30000 }, async () => {
  const m = await mountFixture();
  if (m.sb.DojoExt && m.sb.DojoExt.registerSetting) {
    m.sb.DojoExt.registerSetting({ key: 'tone', label: 'Tone', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }], default: 'a' });
  }
  const done = m.engine.start('practice', { unitId: 'u1' });
  done.answer({ text: 'au11' });
  done.next();
  done.answer({ text: 'zzz' });
  done.finish();
  m.engine.setUnitSetting('u1', { newPerDay: 15 });
  m.engine.setGroupSetting('g1', { newPerDay: 20 });
  const draft = m.engine.start('exam', { examId: 'm1' });
  draft.answer({ text: 'x' });
  draft.saveDraft();
  if (draft.release) draft.release();
  m.app.setState({ home: m.app.homeData() });

  const snapshots = snapshotAll(m);
  const names = Object.keys(snapshots);
  assert.ok(names.length >= 6);

  if (process.env.UPDATE_SNAPSHOT === '1') {
    fs.mkdirSync(path.dirname(SNAP_PATH), { recursive: true });
    fs.writeFileSync(SNAP_PATH, JSON.stringify(snapshots, null, 2) + '\n');
    return;
  }
  const expected = JSON.parse(fs.readFileSync(SNAP_PATH, 'utf8'));
  assert.deepStrictEqual(Object.keys(expected), names);
  names.forEach((n) => {
    assert.strictEqual(JSON.stringify(snapshots[n]), JSON.stringify(expected[n]), 'screen ' + n + ' differs');
  });
});

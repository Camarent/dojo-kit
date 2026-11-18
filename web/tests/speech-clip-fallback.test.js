const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { loadBundle } = require('./load-bundle.js');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

// Loads the real play-button.js and common.js with stubbed DojoAudio and DojoSpeech.
// DojoSpeech must exist before play-button.js runs (it captures root.DojoSpeech at load).
function sandbox({ audio, speech }) {
  const sb = { console };
  loadBundle(sb, { only: ['vendor/preact.min.js', 'vendor/htm.umd.js'] });
  vm.runInContext('self.DojoExt = { text: function (s) { return s; } };', sb);
  sb.DojoAudio = audio;
  sb.DojoSpeech = speech;
  vm.runInContext(read('ui/play-button.js'), sb, { filename: 'ui/play-button.js' });
  vm.runInContext(read('ui/common.js'), sb, { filename: 'ui/common.js' });
  return sb;
}

const UI_AUDIO = (over) => Object.assign({ t: (k) => k, win: {}, cfg: {}, exam: false, played: {}, status: 'ok', onFail() {} }, over);

function clickPlayback(sb, props) {
  const vn = sb.DojoCommon.Playback(props);
  const btn = new vn.type(vn.props);
  btn.setState = function (s) { Object.assign(this.state, s); };
  btn.click();
  return btn;
}

function audioStub(calls) {
  return {
    ready: () => true,
    unlock() {},
    stop() {},
    pick: (s, ids) => ids[0],
    play: (id) => { calls.push(id); return Promise.resolve({}); }
  };
}

function speechStub(calls) {
  return { play: (lines) => { calls.push(lines); return { ok: true }; }, stop() {} };
}

test('clip present: click plays the manifest clip and never calls speechSynthesis', async () => {
  const clips = [];
  const speaks = [];
  const sb = sandbox({ audio: audioStub(clips), speech: speechStub(speaks) });
  const btn = clickPlayback(sb, {
    audio: UI_AUDIO(), lines: [{ text: 'hi' }], clip: { sid: 's', ids: ['a-1'] }, testid: 'p', pid: 's:s'
  });
  await new Promise((r) => setImmediate(r));
  assert.deepStrictEqual(clips, ['a-1']);
  assert.strictEqual(speaks.length, 0);
  assert.strictEqual(btn.state.failed, false);
});

test('clip missing: click speaks the lines and never plays a clip', () => {
  const clips = [];
  const speaks = [];
  const sb = sandbox({ audio: audioStub(clips), speech: speechStub(speaks) });
  const btn = clickPlayback(sb, {
    audio: UI_AUDIO(), lines: [{ text: 'hi' }], clip: null, testid: 'p', pid: 's:s'
  });
  assert.deepStrictEqual(clips, []);
  assert.strictEqual(speaks.length, 1);
  assert.deepStrictEqual(speaks[0], [{ text: 'hi' }]);
  assert.strictEqual(btn.state.playing, true);
});

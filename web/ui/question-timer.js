/*
 * ui/question-timer.js — countdown bar of the per-question timer (contract 12.2).
 * Globals expected: preact, htm. Exports DojoQuestionTimer: { controller, QuestionTimer }.
 *   controller({ now, limitMs, canStart(), onStart(), onExpire() }) -> { poll(), stop(), state() }
 *     poll(): starts the clock once canStart() is true (playback ended, or no audio), fires onExpire once at the limit.
 *     Replays never reset or stop the clock; stop() ends it without onExpire.
 *   slot(h, timed, child) -> fixed-height <div data-testid="qtimer-slot"> around child when timed, else null.
 *   QuestionTimer props { now, limitMs, canStart, onStart, onExpire, stopped, t } renders <div data-testid="qtimer"> with a bar.
 */
(function (root) {
  'use strict';

  function controller(o) {
    var at = null;
    var done = false;
    function state() {
      if (at === null) return { running: false, left: o.limitMs, fraction: 1 };
      var left = Math.max(0, o.limitMs - (o.now() - at));
      return { running: !done, left: left, fraction: left / o.limitMs };
    }
    function poll() {
      if (done) return state();
      if (at === null) {
        if (!o.canStart()) return state();
        at = o.now();
        o.onStart();
      }
      if (o.now() - at >= o.limitMs) { done = true; o.onExpire(); }
      return state();
    }
    return { poll: poll, stop: function () { done = true; }, state: state };
  }

  function create() {
    var h = preact.h;
    var html = htm.bind(h);
    class QuestionTimer extends preact.Component {
      componentDidMount() {
        var self = this;
        this.ctl = controller({
          now: this.props.now, limitMs: this.props.limitMs,
          canStart: function () { return self.props.canStart(); },
          onStart: function () { self.props.onStart(); },
          onExpire: function () { self.props.onExpire(); }
        });
        this.iv = setInterval(function () { self.tickBar(); }, 100);
        this.tickBar();
      }
      componentWillUnmount() { clearInterval(this.iv); if (this.ctl) this.ctl.stop(); }
      tickBar() {
        if (this.props.stopped) { this.ctl.stop(); clearInterval(this.iv); }
        else { var st = this.ctl.poll(); this.setState({ fraction: st.fraction, left: st.left, waiting: !st.running && st.left === this.props.limitMs }); }
      }
      render(p, s) {
        var f = typeof s.fraction === 'number' ? s.fraction : 1;
        var left = typeof s.left === 'number' ? s.left : p.limitMs;
        var secs = Math.ceil(left / 1000);
        var waiting = s.waiting !== false;
        var label = p.t ? p.t('session.timer.seconds', { n: secs }) : secs + ' s';
        return html`<div class=${waiting ? 'qtimer waiting' : 'qtimer'} data-testid="qtimer">
          <div class="qtimer-bar" role="progressbar" aria-label=${p.t ? p.t('session.timer') : null} aria-valuemin="0" aria-valuemax="100" aria-valuenow=${Math.round(f * 100)}>
            <span style=${{ width: Math.round(f * 100) + '%' }}></span>
          </div>
          <span class="qtimer-secs" data-testid="qtimer-secs" aria-hidden="true">${label}</span>
        </div>`;
      }
    }
    return { QuestionTimer: QuestionTimer };
  }

  function slot(h, timed, child) {
    return timed ? h('div', { class: 'qtimer-slot', 'data-testid': 'qtimer-slot' }, child) : null;
  }

  var api = { controller: controller, create: create, slot: slot };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DojoQuestionTimer = api;
})(typeof self !== 'undefined' ? self : this);

/*
 * ui/question-timer.js — countdown bar of the per-question timer (contract 12.2).
 * Globals expected: preact, htm. Exports DojoQuestionTimer: { controller, QuestionTimer }.
 *   controller({ now, limitMs, canStart(), onStart(), onExpire() }) -> { poll(), stop(), state() }
 *     poll(): starts the clock once canStart() is true (playback ended, or no audio), fires onExpire once at the limit.
 *     Replays never reset or stop the clock; stop() ends it without onExpire.
 *   QuestionTimer props { now, limitMs, canStart, onStart, onExpire, stopped } renders <div data-testid="qtimer"> with a bar.
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
        else this.setState({ fraction: this.ctl.poll().fraction });
      }
      render(p, s) {
        var f = typeof s.fraction === 'number' ? s.fraction : 1;
        return html`<div class="qtimer" data-testid="qtimer" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow=${Math.round(f * 100)}
          style="height:6px;background:var(--surface-2);border-radius:999px;overflow:hidden">
          <span style=${{ display: 'block', height: '100%', background: 'var(--accent)', width: Math.round(f * 100) + '%' }}></span>
        </div>`;
      }
    }
    return { QuestionTimer: QuestionTimer };
  }

  var api = { controller: controller, create: create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DojoQuestionTimer = api;
})(typeof self !== 'undefined' ? self : this);

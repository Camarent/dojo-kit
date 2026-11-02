/*
 * ui/session-boundary.js — SessionBoundary error boundary for the session screen.
 * Globals expected: preact, htm.
 */
(function (root) {
  'use strict';

  var h = preact.h;
  var Component = preact.Component;
  var Fragment = preact.Fragment;
  var html = htm.bind(h);

  // A render error inside a session screen shows a recoverable message; 'continue' remounts the screen on the
  // session's current item (a second failure on the same item moves past it).
  class SessionBoundary extends Component {
    constructor(props) {
      super(props);
      this.state = { error: null, epoch: 0 };
      this.failedAt = null;
    }
    componentDidCatch(err) {
      var cur = this.props.session.current && this.props.session.current();
      var pos = cur ? cur.position : -1;
      this.again = this.failedAt === pos;
      this.failedAt = pos;
      this.setState({ error: err });
    }
    resume() {
      var session = this.props.session;
      var finished = false;
      if (this.again) {
        session.next();
        finished = !!session.done;
        this.failedAt = null;
      }
      if (finished) { this.setState({ error: null }); this.props.onFinish(); return; }
      this.setState({ error: null, epoch: this.state.epoch + 1 });
    }
    render(p, s) {
      var self = this;
      if (!s.error) return h(Fragment, { key: s.epoch }, p.children);
      var t = p.t;
      return html`<main class="screen" data-testid="render-error" role="alert">
        <header class="head"><h1>${t('session.crash.title')}</h1></header>
        <p>${t('session.crash.body')}</p>
        <details><summary>${t('error.details')}</summary><pre class="pre mono">${String(s.error && (s.error.message || s.error))}</pre></details>
        <div class="row end">
          <button type="button" class="btn primary" data-testid="btn-continue" onClick=${function () { self.resume(); }}>${t('session.crash.continue')}</button>
          <button type="button" class="btn" data-testid="btn-crash-exit" onClick=${function () { p.onExit(); }}>${t('session.exit')}</button>
        </div>
      </main>`;
    }
  }

  var api = { SessionBoundary: SessionBoundary };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.DojoSessionBoundary = api;
})(typeof self !== 'undefined' ? self : this);

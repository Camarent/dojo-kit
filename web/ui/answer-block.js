/*
 * ui/answer-block.js — AnswerBlock layout (prompt, fields, submit, caption, feedback, answer texts).
 * Block order and rules: docs/ux-answer-block.md. Exposed as root.DojoAnswerBlock, or module.exports under node.
 */
(function (root) {
  'use strict';

  var h = preact.h;
  var html = htm.bind(h);

  // Each slot is optional: a null or undefined slot renders nothing.
  // props: { cls, testid, role, prompt, fields, submit, caption, feedback, answers }
  function AnswerBlock(p) {
    return html`<div class=${p.cls || 'answer-block'} data-testid=${p.testid || 'answer-block'} role=${p.role || null}>
      ${p.prompt ? html`<div class="ab-prompt">${p.prompt}</div>` : null}
      ${p.fields ? html`<div class="ab-fields">${p.fields}</div>` : null}
      ${p.submit ? html`<div class="ab-submit">${p.submit}</div>` : null}
      ${p.caption ? html`<p class="ab-caption" role="status" data-testid="answer-caption">${p.caption}</p>` : null}
      ${p.feedback ? html`<div class="ab-feedback">${p.feedback}</div>` : null}
      ${p.answers ? html`<div class="ab-answers">${p.answers}</div>` : null}
    </div>`;
  }

  var api = { AnswerBlock: AnswerBlock };

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.DojoAnswerBlock = api;
  }
})(typeof self !== 'undefined' ? self : this);

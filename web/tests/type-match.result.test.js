'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadGlobals, findVNode, hasTestId, makeT } = require('./type-match.helpers.js');

test('match Question read-only when result is set', () => {
  const sandbox = loadGlobals();
  const DojoTypes = sandbox.DojoTypes;
  const def = DojoTypes.get('match');

  const view = {
    lefts: [{ label: 'A', id: 'a1' }],
    rights: [{ label: 'X', id: 'x1' }]
  };

  const state = { mapping: ['x1'] };
  const result = { correct: true, detail: { wrong: [] } };

  const props = {
    view: view,
    result: result,
    exam: false,
    state: state,
    setState: function () {},
    onSubmit: function () {},
    t: makeT()
  };

  const vnode = def.Question(props);

  // Find select and check it's disabled
  const selectNode = findVNode(vnode, 'match-select-0');
  assert.ok(selectNode, 'Should find select');
  assert.strictEqual(selectNode.props.disabled, true, 'Select should be disabled when result is set');

  // Check submit button is disabled
  const submitNode = findVNode(vnode, 'btn-submit');
  assert.ok(submitNode, 'Should find submit button');
  assert.strictEqual(submitNode.props.disabled, true, 'Submit should be disabled when result is set');

  // Check reset button is disabled
  const resetNode = findVNode(vnode, 'match-reset');
  assert.ok(resetNode, 'Should find reset button');
  assert.strictEqual(resetNode.props.disabled, true, 'Reset should be disabled when result is set');
});

test('match Question shows wrong marking in non-exam mode', () => {
  const sandbox = loadGlobals();
  const DojoTypes = sandbox.DojoTypes;
  const def = DojoTypes.get('match');

  const view = {
    lefts: [{ label: 'A', id: 'a1' }, { label: 'B', id: 'b1' }],
    rights: [{ label: 'X', id: 'x1' }, { label: 'Y', id: 'y1' }]
  };

  const state = { mapping: ['x1', 'y1'] };
  const result = { correct: false, detail: { wrong: ['A'] } };

  const props = {
    view: view,
    result: result,
    exam: false,
    state: state,
    setState: function () {},
    onSubmit: function () {},
    t: makeT()
  };

  const vnode = def.Question(props);

  // Check that the row with wrong label has the wrong class
  const rowNode = findVNode(vnode, 'match-row-0');
  assert.ok(rowNode, 'Should find first row');
  var className = rowNode.props.class || rowNode.props.className || '';
  assert.ok(className.indexOf('wrong') >= 0, 'First row should have wrong class');
});

test('match Question does not show wrong marking in exam mode', () => {
  const sandbox = loadGlobals();
  const DojoTypes = sandbox.DojoTypes;
  const def = DojoTypes.get('match');

  const view = {
    lefts: [{ label: 'A', id: 'a1' }, { label: 'B', id: 'b1' }],
    rights: [{ label: 'X', id: 'x1' }, { label: 'Y', id: 'y1' }]
  };

  const state = { mapping: ['x1', 'y1'] };
  const result = { recorded: true, detail: { wrong: ['A'] } };

  const props = {
    view: view,
    result: result,
    exam: true,
    state: state,
    setState: function () {},
    onSubmit: function () {},
    t: makeT()
  };

  const vnode = def.Question(props);

  // Check that rows don't have wrong class in exam mode
  const rowNode = findVNode(vnode, 'match-row-0');
  assert.ok(rowNode, 'Should find first row');
  assert.ok(rowNode.props.class.indexOf('wrong') === -1, 'First row should not have wrong class in exam mode');
});

test('match Extra renders wrongPairs', () => {
  const sandbox = loadGlobals();
  const DojoTypes = sandbox.DojoTypes;
  const def = DojoTypes.get('match');

  const result = {
    correct: false,
    detail: { wrong: ['A', 'B'] },
    accepted: []
  };

  const props = {
    result: result,
    exam: false,
    t: makeT()
  };

  const vnode = def.Extra(props);

  assert.ok(vnode !== null, 'Extra should render when there are wrong pairs');
  assert.ok(hasTestId(vnode, 'wrongPairs'), 'Extra should have wrongPairs testid');
});

test('match Extra does not render in exam mode', () => {
  const sandbox = loadGlobals();
  const DojoTypes = sandbox.DojoTypes;
  const def = DojoTypes.get('match');

  const result = {
    recorded: true,
    detail: { wrong: ['A', 'B'] },
    accepted: []
  };

  const props = {
    result: result,
    exam: true,
    t: makeT()
  };

  const vnode = def.Extra(props);

  assert.strictEqual(vnode, null, 'Extra should not render in exam mode');
});

test('match Extra does not render when no wrong pairs', () => {
  const sandbox = loadGlobals();
  const DojoTypes = sandbox.DojoTypes;
  const def = DojoTypes.get('match');

  const result = {
    correct: true,
    detail: { wrong: [] },
    accepted: []
  };

  const props = {
    result: result,
    exam: false,
    t: makeT()
  };

  const vnode = def.Extra(props);

  assert.strictEqual(vnode, null, 'Extra should not render when no wrong pairs');
});

test('match select options include placeholder and all rights', () => {
  const sandbox = loadGlobals();
  const DojoTypes = sandbox.DojoTypes;
  const def = DojoTypes.get('match');

  const view = {
    lefts: [{ label: 'A', id: 'a1' }],
    rights: [{ label: 'X', id: 'x1' }, { label: 'Y', id: 'y1' }]
  };

  const props = {
    view: view,
    result: null,
    exam: false,
    state: def.initialState(view),
    setState: function () {},
    onSubmit: function () {},
    t: makeT()
  };

  const vnode = def.Question(props);
  const selectNode = findVNode(vnode, 'match-select-0');
  assert.ok(selectNode, 'Should find select');

  var kids = selectNode.props.children;
  var placeholder = kids[0];
  var rights = kids[1];
  assert.strictEqual(placeholder.props.value, '');
  assert.strictEqual(placeholder.props.children, 'Choose...');
  assert.deepStrictEqual(rights.map(function (o) { return o.props.value; }), ['x1', 'y1']);
});

test('match Extra renders nothing for a result without detail (dont-know)', () => {
  const def = loadGlobals().DojoTypes.get('match');
  const vnode = def.Extra({ result: { correct: false, given: '-', expected: 'x' }, exam: false, t: makeT() });
  assert.strictEqual(vnode, null);
});

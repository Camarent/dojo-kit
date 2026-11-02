'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadGlobals, findVNode, findAllVNodes, hasTestId, checkNoDangerous, makeT } = require('./type-match.helpers.js');

test('match type registration', () => {
  const sandbox = loadGlobals();
  const DojoTypes = sandbox.DojoTypes;
  const def = DojoTypes.get('match');
  assert.ok(def, 'match type should be registered');
  assert.ok(typeof def.Question === 'function', 'Question should be a function');
  assert.ok(typeof def.canSubmit === 'function', 'canSubmit should be a function');
  assert.ok(typeof def.initialState === 'function', 'initialState should be a function');
  assert.ok(typeof def.Extra === 'function', 'Extra should be a function');
});

test('match initialState and canSubmit', () => {
  const sandbox = loadGlobals();
  const DojoTypes = sandbox.DojoTypes;
  const def = DojoTypes.get('match');

  const view = {
    lefts: [{ label: 'A', id: 'a1' }, { label: 'B', id: 'b1' }, { label: 'C', id: 'c1' }],
    rights: [{ label: 'X', id: 'x1' }, { label: 'Y', id: 'y1' }, { label: 'Z', id: 'z1' }]
  };

  const state = def.initialState(view);
  assert.ok(Array.isArray(state.mapping), 'state.mapping should be an array');
  assert.strictEqual(state.mapping.length, 3, 'mapping length should match lefts length');
  assert.ok(state.mapping.every(function (m) { return m === null; }), 'all initial mappings should be null');

  assert.strictEqual(def.canSubmit(state), false, 'canSubmit should be false when no mappings');

  state.mapping[0] = 'x1';
  assert.strictEqual(def.canSubmit(state), false, 'canSubmit should be false when some mappings are null');

  state.mapping[1] = 'y1';
  state.mapping[2] = 'z1';
  assert.strictEqual(def.canSubmit(state), true, 'canSubmit should be true when all mappings are set');

  state.mapping[2] = null;
  assert.strictEqual(def.canSubmit(state), false, 'canSubmit should be false when any mapping is null');
});

test('match Question renders required testids', () => {
  const sandbox = loadGlobals();
  const DojoTypes = sandbox.DojoTypes;
  const def = DojoTypes.get('match');

  const view = {
    lefts: [{ label: 'A', id: 'a1' }, { label: 'B', id: 'b1' }],
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

  // Check container
  assert.ok(hasTestId(vnode, 'match'), 'Should have match container testid');

  // Check rows
  assert.ok(hasTestId(vnode, 'match-row-0'), 'Should have match-row-0 testid');
  assert.ok(hasTestId(vnode, 'match-row-1'), 'Should have match-row-1 testid');

  // Check selects
  assert.ok(hasTestId(vnode, 'match-select-0'), 'Should have match-select-0 testid');
  assert.ok(hasTestId(vnode, 'match-select-1'), 'Should have match-select-1 testid');

  // Check reset button
  assert.ok(hasTestId(vnode, 'match-reset'), 'Should have match-reset testid');

  // Check submit button
  assert.ok(hasTestId(vnode, 'btn-submit'), 'Should have btn-submit testid');

  // Check no dangerous HTML
  checkNoDangerous(vnode);
});

test('match Question select change calls setState', () => {
  const sandbox = loadGlobals();
  const DojoTypes = sandbox.DojoTypes;
  const def = DojoTypes.get('match');

  const view = {
    lefts: [{ label: 'A', id: 0 }, { label: 'B', id: 1 }],
    rights: [{ label: 'X', id: 0 }, { label: 'Y', id: 1 }]
  };

  var setStateCalled = false;
  var setStateArgs = null;

  const props = {
    view: view,
    result: null,
    exam: false,
    state: def.initialState(view),
    setState: function (args) {
      setStateCalled = true;
      setStateArgs = args;
    },
    onSubmit: function () {},
    t: makeT()
  };

  const vnode = def.Question(props);

  // Find the first select and simulate a change
  const selectNodes = findAllVNodes(vnode, 'match-select-0');
  assert.ok(selectNodes.length > 0, 'Should have select nodes');

  // Get the onChange handler from the first select
  const selectVNode = findVNode(vnode, 'match-select-0');
  assert.ok(selectVNode, 'Should find match-select-0');
  assert.ok(selectVNode.props.onChange, 'Select should have onChange handler');

  // Simulate a change event
  const mockEvent = { target: { value: '1' } };
  selectVNode.props.onChange(mockEvent);

  assert.ok(setStateCalled, 'setState should be called on select change');
  assert.ok(setStateArgs.mapping, 'setState should be called with mapping');
  assert.strictEqual(setStateArgs.mapping[0], 1, 'select values are converted to numeric right ids');
  assert.strictEqual(setStateArgs.mapping[1], null, 'Second mapping should still be null');
});

test('match Question reset button clears all selections', () => {
  const sandbox = loadGlobals();
  const DojoTypes = sandbox.DojoTypes;
  const def = DojoTypes.get('match');

  const view = {
    lefts: [{ label: 'A', id: 'a1' }, { label: 'B', id: 'b1' }],
    rights: [{ label: 'X', id: 'x1' }, { label: 'Y', id: 'y1' }]
  };

  var setStateCalled = false;
  var setStateArgs = null;

  const state = { mapping: ['x1', 'y1'] };

  const props = {
    view: view,
    result: null,
    exam: false,
    state: state,
    setState: function (args) {
      setStateCalled = true;
      setStateArgs = args;
    },
    onSubmit: function () {},
    t: makeT()
  };

  const vnode = def.Question(props);

  // Find reset button
  const resetNode = findVNode(vnode, 'match-reset');
  assert.ok(resetNode, 'Should find match-reset button');
  assert.ok(resetNode.props.onClick, 'Reset button should have onClick handler');

  // Simulate click
  resetNode.props.onClick();

  assert.ok(setStateCalled, 'setState should be called on reset');
  assert.ok(setStateArgs.mapping, 'setState should be called with mapping');
  assert.ok(setStateArgs.mapping.every(function (m) { return m === null; }), 'All mappings should be cleared');
});

test('match Question submit calls onSubmit with correct shape', () => {
  const sandbox = loadGlobals();
  const DojoTypes = sandbox.DojoTypes;
  const def = DojoTypes.get('match');

  const view = {
    lefts: [{ label: 'A', id: 'a1' }, { label: 'B', id: 'b1' }],
    rights: [{ label: 'X', id: 'x1' }, { label: 'Y', id: 'y1' }]
  };

  var onSubmitCalled = false;
  var onSubmitInput = null;
  var onSubmitPicked = null;

  const state = { mapping: ['x1', 'y1'] };

  const props = {
    view: view,
    result: null,
    exam: false,
    state: state,
    setState: function () {},
    onSubmit: function (input, picked) {
      onSubmitCalled = true;
      onSubmitInput = input;
      onSubmitPicked = picked;
    },
    t: makeT()
  };

  const vnode = def.Question(props);

  // Find form and submit handler
  const formNode = findVNode(vnode, 'match');
  assert.ok(formNode, 'Should find match form');
  assert.ok(formNode.props.onSubmit, 'Form should have onSubmit handler');

  // Simulate form submit
  const mockEvent = { preventDefault: function () {} };
  formNode.props.onSubmit(mockEvent);

  assert.ok(onSubmitCalled, 'onSubmit should be called');
  assert.ok(Array.isArray(onSubmitInput.mapping), 'input should have mapping array');
  assert.strictEqual(onSubmitInput.mapping.length, 2, 'mapping should have 2 elements');
  assert.strictEqual(onSubmitInput.mapping[0], 'x1', 'First mapping should be x1');
  assert.strictEqual(onSubmitInput.mapping[1], 'y1', 'Second mapping should be y1');
  assert.deepStrictEqual(onSubmitPicked, onSubmitInput.mapping, 'picked should equal mapping');
});

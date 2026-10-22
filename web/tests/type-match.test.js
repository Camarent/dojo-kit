'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadBundle } = require('./load-bundle.js');


// Load vendored preact and htm as globals
function loadGlobals() {
  const sandbox = { console: console, document: {} };
  sandbox.self = sandbox;
  sandbox.global = sandbox;
  loadBundle(sandbox, { only: ['vendor/preact.min.js', 'vendor/htm.umd.js', 'types/registry.js', 'types/match.js'] });
  
  return sandbox;
}

function findVNode(vnode, testid) {
  if (!vnode) return null;
  if (vnode && vnode.props && vnode.props['data-testid'] === testid) return vnode;
  if (Array.isArray(vnode)) {
    for (var i = 0; i < vnode.length; i++) {
      var found = findVNode(vnode[i], testid);
      if (found) return found;
    }
  }
  if (vnode && vnode.props && vnode.props.children) {
    var children = vnode.props.children;
    if (Array.isArray(children)) {
      for (var j = 0; j < children.length; j++) {
        var found = findVNode(children[j], testid);
        if (found) return found;
      }
    } else {
      return findVNode(children, testid);
    }
  }
  return null;
}

function findAllVNodes(vnode, testid) {
  var results = [];
  function walk(n) {
    if (!n) return;
    if (n.props && n.props['data-testid'] === testid) {
      results.push(n);
    }
    if (Array.isArray(n)) {
      for (var i = 0; i < n.length; i++) walk(n[i]);
    } else if (n && n.props) {
      if (n.props.children) {
        var children = n.props.children;
        if (Array.isArray(children)) {
          for (var j = 0; j < children.length; j++) walk(children[j]);
        } else {
          walk(children);
        }
      }
    }
  }
  walk(vnode);
  return results;
}

function hasTestId(vnode, testid) {
  return findVNode(vnode, testid) !== null;
}

function checkNoDangerous(vnode) {
  function walk(n) {
    if (!n) return false;
    if (Array.isArray(n)) {
      for (var i = 0; i < n.length; i++) {
        if (walk(n[i])) return true;
      }
      return false;
    }
    if (n && n.props) {
      if (n.props.dangerouslySetInnerHTML || n.props.innerHTML) return true;
      if (n.props.children) {
        var children = n.props.children;
        if (Array.isArray(children)) {
          for (var j = 0; j < children.length; j++) {
            if (walk(children[j])) return true;
          }
        } else {
          if (walk(children)) return true;
        }
      }
    }
    return false;
  }
  assert.ok(!walk(vnode), 'Found dangerouslySetInnerHTML or innerHTML in vnode');
}

// Mock t function
function makeT() {
  return function (key, vars) {
    var str = { 
      'q.match.hint': 'Link each item on the left to its match.',
      'q.match.choose': 'Choose...',
      'q.match.reset': 'Reset matches',
      'session.check': 'Check',
      'q.result.wrongPairs': 'Wrong matches'
    }[key] || key;
    if (vars) {
      for (var k in vars) {
        str = str.replace('{' + k + '}', vars[k]);
      }
    }
    return str;
  };
}

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
  const preact = sandbox.preact;
  const h = preact.h;
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
  const preact = sandbox.preact;
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

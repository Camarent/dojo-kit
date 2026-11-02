/*
 * dojo-wasm.js — loader for the dojo core compiled to WebAssembly.
 * DojoWasm.load(base64OrBytes) -> Promise<{ call(name, args) }>.
 * call() returns the value of a successful call and throws DojoError({code, message}) otherwise.
 * After a WebAssembly trap the instance is rebuilt and the call throws code "trap"; callers must not
 * save progress derived from a failed call.
 */
(function (root) {
  'use strict';

  function DojoError(code, message) {
    this.name = 'DojoError';
    this.code = code;
    this.message = message;
  }
  DojoError.prototype = Object.create(Error.prototype);
  DojoError.prototype.constructor = DojoError;

  function toBytes(source) {
    if (typeof source !== 'string') return new Uint8Array(source);
    var bin = atob(source);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function load(source) {
    var encoder = new TextEncoder();
    var decoder = new TextDecoder();
    return WebAssembly.compile(toBytes(source)).then(function (module) {
      var exports = new WebAssembly.Instance(module, {}).exports;

      function put(bytes) {
        var ptr = exports.alloc(bytes.length);
        new Uint8Array(exports.memory.buffer, ptr, bytes.length).set(bytes);
        return ptr;
      }

      function run(name, args) {
        var nameBytes = encoder.encode(name);
        var argBytes = encoder.encode(JSON.stringify(args === undefined ? {} : args));
        var namePtr = put(nameBytes);
        var argPtr = put(argBytes);
        var packed = exports.call(namePtr, nameBytes.length, argPtr, argBytes.length);
        exports.dealloc(namePtr, nameBytes.length);
        exports.dealloc(argPtr, argBytes.length);
        var ptr = Number(packed >> 32n);
        var len = Number(packed & 0xffffffffn);
        var text = decoder.decode(new Uint8Array(exports.memory.buffer, ptr, len));
        exports.dealloc(ptr, len);
        return JSON.parse(text);
      }

      function call(name, args) {
        var envelope;
        try {
          envelope = run(name, args);
        } catch (e) {
          if (e instanceof WebAssembly.RuntimeError) {
            exports = new WebAssembly.Instance(module, {}).exports;
            throw new DojoError('trap', 'WebAssembly trap in ' + name + ': ' + e.message);
          }
          throw e;
        }
        if (envelope.ok) return envelope.value;
        throw new DojoError(envelope.error.code, envelope.error.message);
      }

      return { call: call };
    });
  }

  var api = { load: load, DojoError: DojoError };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DojoWasm = api;
})(typeof self !== 'undefined' ? self : this);

// #region agent log
(function installAgentLogger() {
  var endpoint = "http://127.0.0.1:7638/ingest/38e16e0f-1e33-457e-a7b0-2a438c776c6a";
  function send(payload) {
    try {
      payload.sessionId = "ccb655";
      payload.timestamp = Date.now();
      fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "ccb655" },
        body: JSON.stringify(payload),
      }).catch(function () {});
    } catch (_e) {}
  }
  globalThis.__agentLog = send;
  send({ location: "polyfills.js:top", message: "POLYFILL_TOP_REACHED", hypothesisId: "all", data: { hermes: !!globalThis.HermesInternal } });
  var origHandler = globalThis.ErrorUtils && globalThis.ErrorUtils.getGlobalHandler && globalThis.ErrorUtils.getGlobalHandler();
  if (globalThis.ErrorUtils && globalThis.ErrorUtils.setGlobalHandler) {
    globalThis.ErrorUtils.setGlobalHandler(function (error, isFatal) {
      try {
        send({
          location: "ErrorUtils.globalHandler",
          message: "GLOBAL_JS_ERROR",
          hypothesisId: "all",
          data: {
            isFatal: !!isFatal,
            name: error && error.name,
            errMessage: error && error.message,
            stack: error && error.stack && String(error.stack).slice(0, 3000),
            componentStack: error && error.componentStack && String(error.componentStack).slice(0, 3000),
          },
        });
      } catch (_e) {}
      if (origHandler) origHandler(error, isFatal);
    });
  }
})();
// #endregion

// Bundle-level polyfill, injected via metro.config.js's
// `serializer.getPolyfills`. This file is concatenated into the very top of
// the JS bundle, BEFORE module registration (`__d(...)`) and BEFORE
// `InitializeCore`. It is the only place we can install globals that
// transitive dependencies touch at module-load time.
//
// 1. SharedArrayBuffer
// Hermes does not implement SharedArrayBuffer. Some transitive deps reference
// it without a `typeof` guard, which crashes the runtime before any React tree
// mounts. Falling back to ArrayBuffer is safe: the deps only need the symbol
// to exist for their type checks, and Hermes has no real shared memory anyway.
if (typeof globalThis.SharedArrayBuffer === "undefined") {
  globalThis.SharedArrayBuffer = ArrayBuffer;
}

// 2. ArrayBuffer.prototype.byteLength accessor descriptor
// `whatwg-url-without-unicode/lib/utils.js`, pulled in by expo's
// `winter/runtime.native.ts` URL polyfill, reads
// `Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, "byteLength").get` at
// module-load time. On Hermes the existing descriptor (if any) is not an
// accessor with a `.get`, so the access throws `TypeError: Cannot read
// property 'get' of undefined`. We force-define an accessor descriptor whose
// getter delegates to a typed-array view (a distinct accessor in Hermes, no
// recursion).
if (typeof ArrayBuffer !== "undefined" && typeof Uint8Array !== "undefined") {
  try {
    var __pokemarketByteLengthDesc = Object.getOwnPropertyDescriptor(
      ArrayBuffer.prototype,
      "byteLength",
    );
    var __pokemarketHadGetter =
      !!__pokemarketByteLengthDesc &&
      typeof __pokemarketByteLengthDesc.get === "function";
    if (!__pokemarketHadGetter) {
      Object.defineProperty(ArrayBuffer.prototype, "byteLength", {
        configurable: true,
        get: function () {
          return new Uint8Array(this).byteLength;
        },
      });
    }
  } catch (_e) {
    // Best-effort: if Hermes refuses to redefine the accessor, the
    // webidl-conversions source patch (see apps/mobile/patches/) will catch
    // the resulting undefined descriptor at the call site.
  }
}

// Note: we previously tried to install accessor descriptors for the ES2024
// Resizable / Growable Buffers properties (`resizable`, `growable`,
// `maxByteLength`) directly on `ArrayBuffer.prototype` /
// `SharedArrayBuffer.prototype` so that webidl-conversions could read them.
// That approach does not work on Hermes:
//
//   1. Hermes silently rejects user-installed accessors on these "real
//      intrinsic" prototypes — our defineProperty appears to take effect for
//      our own subsequent reads but webidl-conversions still gets `undefined`.
//   2. Hermes inlines/optimizes `Object.getOwnPropertyDescriptor` calls from
//      compiled module bodies, so monkey-patching that intrinsic from JS does
//      NOT redirect the call: webidl-conversions' module-load read goes
//      straight to the native implementation, bypassing our override.
//
// The only fix that actually works is to replace the offending source file
// (`webidl-conversions/lib/index.js`) with a defensive copy that guards each
// `.get` lookup. That patch lives in `apps/mobile/patches/` and is wired up
// via `metro.config.js`'s `resolver.resolveRequest`.

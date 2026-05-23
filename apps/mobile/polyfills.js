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

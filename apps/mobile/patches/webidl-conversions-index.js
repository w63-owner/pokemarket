"use strict";

// Patched mirror of `webidl-conversions/lib/index.js` (npm version 7.0.0+).
//
// The upstream file reads several accessor descriptors at module-load time
// without guarding the `.get` lookup, e.g.:
//
//   const abByteLengthGetter = Object.getOwnPropertyDescriptor(
//     ArrayBuffer.prototype, "byteLength").get;
//   const abResizableGetter = Object.getOwnPropertyDescriptor(
//     ArrayBuffer.prototype, "resizable").get;
//   const sabGrowableGetter = Object.getOwnPropertyDescriptor(
//     SharedArrayBuffer.prototype, "growable").get;
//   const dvByteLengthGetter = Object.getOwnPropertyDescriptor(
//     DataView.prototype, "byteLength").get;
//   const typedArrayNameGetter = Object.getOwnPropertyDescriptor(
//     Object.getPrototypeOf(Uint8Array).prototype, Symbol.toStringTag).get;
//
// On Hermes (used by React Native), the ES2024 Resizable/Growable Buffers
// proposal is NOT implemented, so `Object.getOwnPropertyDescriptor` returns
// `undefined` for `resizable`/`growable`, and `.get` on `undefined` throws
// `TypeError: Cannot read property 'get' of undefined` BEFORE the bundle
// finishes loading — leaving the app stuck at the native splash forever.
//
// Hermes also aggressively inlines intrinsic calls like
// `Object.getOwnPropertyDescriptor`, so monkey-patching that intrinsic from
// JS (in `polyfills.js`) does NOT work — Hermes bypasses the override. The
// only reliable fix is to guard the access at the call site, which is what
// this file does. Every problematic descriptor read now falls back to a
// defensive shim when the upstream property is missing on Hermes.
//
// Routed in via `apps/mobile/metro.config.js`'s `resolver.resolveRequest`.

function makeException(ErrorType, message, options) {
  if (options.globals) {
    ErrorType = options.globals[ErrorType.name];
  }
  return new ErrorType(`${options.context ? options.context : "Value"} ${message}.`);
}

function toNumber(value, options) {
  if (typeof value === "bigint") {
    throw makeException(TypeError, "is a BigInt which cannot be converted to a number", options);
  }
  if (!options.globals) {
    return Number(value);
  }
  return options.globals.Number(value);
}

function evenRound(x) {
  if ((x > 0 && (x % 1) === +0.5 && (x & 1) === 0) ||
        (x < 0 && (x % 1) === -0.5 && (x & 1) === 1)) {
    return censorNegativeZero(Math.floor(x));
  }
  return censorNegativeZero(Math.round(x));
}

function integerPart(n) {
  return censorNegativeZero(Math.trunc(n));
}

function sign(x) {
  return x < 0 ? -1 : 1;
}

function modulo(x, y) {
  const signMightNotMatch = x % y;
  if (sign(y) !== sign(signMightNotMatch)) {
    return signMightNotMatch + y;
  }
  return signMightNotMatch;
}

function censorNegativeZero(x) {
  return x === 0 ? 0 : x;
}

function createIntegerConversion(bitLength, { unsigned }) {
  let lowerBound, upperBound;
  if (unsigned) {
    lowerBound = 0;
    upperBound = 2 ** bitLength - 1;
  } else {
    lowerBound = -(2 ** (bitLength - 1));
    upperBound = 2 ** (bitLength - 1) - 1;
  }

  const twoToTheBitLength = 2 ** bitLength;
  const twoToOneLessThanTheBitLength = 2 ** (bitLength - 1);

  return (value, options = {}) => {
    let x = toNumber(value, options);
    x = censorNegativeZero(x);

    if (options.enforceRange) {
      if (!Number.isFinite(x)) {
        throw makeException(TypeError, "is not a finite number", options);
      }

      x = integerPart(x);

      if (x < lowerBound || x > upperBound) {
        throw makeException(
          TypeError,
          `is outside the accepted range of ${lowerBound} to ${upperBound}, inclusive`,
          options
        );
      }

      return x;
    }

    if (!Number.isNaN(x) && options.clamp) {
      x = Math.min(Math.max(x, lowerBound), upperBound);
      x = evenRound(x);
      return x;
    }

    if (!Number.isFinite(x) || x === 0) {
      return 0;
    }
    x = integerPart(x);

    if (x >= lowerBound && x <= upperBound) {
      return x;
    }

    x = modulo(x, twoToTheBitLength);
    if (!unsigned && x >= twoToOneLessThanTheBitLength) {
      return x - twoToTheBitLength;
    }
    return x;
  };
}

function createLongLongConversion(bitLength, { unsigned }) {
  const upperBound = Number.MAX_SAFE_INTEGER;
  const lowerBound = unsigned ? 0 : Number.MIN_SAFE_INTEGER;
  const asBigIntN = unsigned ? BigInt.asUintN : BigInt.asIntN;

  return (value, options = {}) => {
    let x = toNumber(value, options);
    x = censorNegativeZero(x);

    if (options.enforceRange) {
      if (!Number.isFinite(x)) {
        throw makeException(TypeError, "is not a finite number", options);
      }

      x = integerPart(x);

      if (x < lowerBound || x > upperBound) {
        throw makeException(
          TypeError,
          `is outside the accepted range of ${lowerBound} to ${upperBound}, inclusive`,
          options
        );
      }

      return x;
    }

    if (!Number.isNaN(x) && options.clamp) {
      x = Math.min(Math.max(x, lowerBound), upperBound);
      x = evenRound(x);
      return x;
    }

    if (!Number.isFinite(x) || x === 0) {
      return 0;
    }

    let xBigInt = BigInt(integerPart(x));
    xBigInt = asBigIntN(bitLength, xBigInt);
    return Number(xBigInt);
  };
}

exports.any = value => {
  return value;
};

exports.undefined = () => {
  return undefined;
};

exports.boolean = value => {
  return Boolean(value);
};

exports.byte = createIntegerConversion(8, { unsigned: false });
exports.octet = createIntegerConversion(8, { unsigned: true });

exports.short = createIntegerConversion(16, { unsigned: false });
exports["unsigned short"] = createIntegerConversion(16, { unsigned: true });

exports.long = createIntegerConversion(32, { unsigned: false });
exports["unsigned long"] = createIntegerConversion(32, { unsigned: true });

exports["long long"] = createLongLongConversion(64, { unsigned: false });
exports["unsigned long long"] = createLongLongConversion(64, { unsigned: true });

exports.double = (value, options = {}) => {
  const x = toNumber(value, options);

  if (!Number.isFinite(x)) {
    throw makeException(TypeError, "is not a finite floating-point value", options);
  }

  return x;
};

exports["unrestricted double"] = (value, options = {}) => {
  const x = toNumber(value, options);

  return x;
};

exports.float = (value, options = {}) => {
  const x = toNumber(value, options);

  if (!Number.isFinite(x)) {
    throw makeException(TypeError, "is not a finite floating-point value", options);
  }

  if (Object.is(x, -0)) {
    return x;
  }

  const y = Math.fround(x);

  if (!Number.isFinite(y)) {
    throw makeException(TypeError, "is outside the range of a single-precision floating-point value", options);
  }

  return y;
};

exports["unrestricted float"] = (value, options = {}) => {
  const x = toNumber(value, options);

  if (isNaN(x)) {
    return x;
  }

  if (Object.is(x, -0)) {
    return x;
  }

  return Math.fround(x);
};

exports.DOMString = (value, options = {}) => {
  if (options.treatNullAsEmptyString && value === null) {
    return "";
  }

  if (typeof value === "symbol") {
    throw makeException(TypeError, "is a symbol, which cannot be converted to a string", options);
  }

  const StringCtor = options.globals ? options.globals.String : String;
  return StringCtor(value);
};

exports.ByteString = (value, options = {}) => {
  const x = exports.DOMString(value, options);

  // eslint-disable-next-line require-unicode-regexp
  if (/[^\x00-\xFF]/.test(x)) {
    throw makeException(TypeError, "is not a valid ByteString", options);
  }

  return x;
};

// `String.prototype.toWellFormed()` is ES2024 and missing on Hermes. We fall
// back to a regexp-based equivalent that replaces lone surrogates with the
// Unicode replacement character (U+FFFD), matching the spec.
const _LONE_SURROGATE_RE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:^|[^\uD800-\uDBFF])([\uDC00-\uDFFF])/g;
function _toWellFormed(s) {
  if (typeof s.toWellFormed === "function") return s.toWellFormed();
  return String(s).replace(_LONE_SURROGATE_RE, function (m, trailing) {
    if (trailing) return m.charAt(0) + "\uFFFD";
    return "\uFFFD";
  });
}

exports.USVString = (value, options = {}) => {
  return _toWellFormed(exports.DOMString(value, options));
};

exports.object = (value, options = {}) => {
  if (value === null || (typeof value !== "object" && typeof value !== "function")) {
    throw makeException(TypeError, "is not an object", options);
  }

  return value;
};

// === Hermes-safe accessor lookups ===
//
// We can't trust `Object.getOwnPropertyDescriptor(...)?.get` because Hermes
// returns `undefined` for properties from the ES2024 Resizable Buffers
// proposal. Each lookup below falls back to a shim that delegates to a
// typed-array view (a separate accessor in Hermes, no recursion).
function _safeAccessorGetter(proto, key, fallback) {
  try {
    var desc = Object.getOwnPropertyDescriptor(proto, key);
    if (desc && typeof desc.get === "function") return desc.get;
  } catch (_e) {}
  return fallback;
}

const abByteLengthGetter = _safeAccessorGetter(
  ArrayBuffer.prototype,
  "byteLength",
  function abByteLengthShim() {
    // `this` must be an ArrayBuffer; if not, `new Uint8Array(this)` throws,
    // which is exactly the contract the upstream code relies on.
    return new Uint8Array(this).byteLength;
  }
);

const sabByteLengthGetter = _safeAccessorGetter(
  SharedArrayBuffer.prototype,
  "byteLength",
  function sabByteLengthShim() {
    return new Uint8Array(this).byteLength;
  }
);

function isNonSharedArrayBuffer(value) {
  try {
    abByteLengthGetter.call(value);
    return true;
  } catch {
    return false;
  }
}

function isSharedArrayBuffer(value) {
  try {
    sabByteLengthGetter.call(value);
    return true;
  } catch {
    return false;
  }
}

// Resizable / Growable buffers — not implemented on Hermes. The shims always
// return false, which is the truthful answer for our runtime.
const abResizableGetter = _safeAccessorGetter(
  ArrayBuffer.prototype,
  "resizable",
  function abResizableShim() {
    return false;
  }
);

const sabGrowableGetter = _safeAccessorGetter(
  SharedArrayBuffer.prototype,
  "growable",
  function sabGrowableShim() {
    return false;
  }
);

function isNonSharedArrayBufferResizable(value) {
  try {
    return abResizableGetter.call(value);
  } catch {
    return false;
  }
}

function isSharedArrayBufferGrowable(value) {
  try {
    return sabGrowableGetter.call(value);
  } catch {
    return false;
  }
}

function isArrayBufferDetached(value) {
  try {
    // eslint-disable-next-line no-new
    new Uint8Array(value);
    return false;
  } catch {
    return true;
  }
}

exports.ArrayBuffer = (value, options = {}) => {
  if (!isNonSharedArrayBuffer(value)) {
    throw makeException(TypeError, "is not an ArrayBuffer", options);
  }
  if (!options.allowResizable && isNonSharedArrayBufferResizable(value)) {
    throw makeException(TypeError, "is a resizable ArrayBuffer", options);
  }
  if (isArrayBufferDetached(value)) {
    throw makeException(TypeError, "is a detached ArrayBuffer", options);
  }

  return value;
};

exports.SharedArrayBuffer = (value, options = {}) => {
  if (!isSharedArrayBuffer(value)) {
    throw makeException(TypeError, "is not a SharedArrayBuffer", options);
  }
  if (!options.allowResizable && isSharedArrayBufferGrowable(value)) {
    throw makeException(TypeError, "is a growable SharedArrayBuffer", options);
  }

  return value;
};

const dvByteLengthGetter = _safeAccessorGetter(
  DataView.prototype,
  "byteLength",
  function dvByteLengthShim() {
    // Touching `this.byteLength` on a non-DataView throws — same contract.
    return this.byteLength;
  }
);

exports.DataView = (value, options = {}) => {
  try {
    dvByteLengthGetter.call(value);
  } catch {
    throw makeException(TypeError, "is not a DataView", options);
  }
  return exports.ArrayBufferView(value, options);
};

// %TypedArray%.prototype[Symbol.toStringTag] — guard the same way.
const _taProto = Object.getPrototypeOf(Uint8Array).prototype;
const typedArrayNameGetter = _safeAccessorGetter(
  _taProto,
  Symbol.toStringTag,
  function typedArrayNameShim() {
    if (this instanceof Int8Array) return "Int8Array";
    if (this instanceof Int16Array) return "Int16Array";
    if (this instanceof Int32Array) return "Int32Array";
    if (this instanceof Uint8ClampedArray) return "Uint8ClampedArray";
    if (this instanceof Uint8Array) return "Uint8Array";
    if (this instanceof Uint16Array) return "Uint16Array";
    if (this instanceof Uint32Array) return "Uint32Array";
    if (this instanceof Float32Array) return "Float32Array";
    if (this instanceof Float64Array) return "Float64Array";
    return undefined;
  }
);

[
  Int8Array,
  Int16Array,
  Int32Array,
  Uint8Array,
  Uint16Array,
  Uint32Array,
  Uint8ClampedArray,
  Float32Array,
  Float64Array
].forEach(func => {
  const { name } = func;
  const article = /^[AEIOU]/u.test(name) ? "an" : "a";
  exports[name] = (value, options = {}) => {
    if (!ArrayBuffer.isView(value) || typedArrayNameGetter.call(value) !== name) {
      throw makeException(TypeError, `is not ${article} ${name} object`, options);
    }
    return exports.ArrayBufferView(value, options);
  };
});

// Common definitions

exports.ArrayBufferView = (value, options = {}) => {
  if (!ArrayBuffer.isView(value)) {
    throw makeException(TypeError, "is not a view on an ArrayBuffer or SharedArrayBuffer", options);
  }

  if (!options.allowShared && isSharedArrayBuffer(value.buffer)) {
    throw makeException(TypeError, "is a view on a SharedArrayBuffer, which is not allowed", options);
  }

  if (!options.allowResizable) {
    if (isNonSharedArrayBufferResizable(value.buffer)) {
      throw makeException(TypeError, "is a view on a resizable ArrayBuffer, which is not allowed", options);
    } else if (isSharedArrayBufferGrowable(value.buffer)) {
      throw makeException(TypeError, "is a view on a growable SharedArrayBuffer, which is not allowed", options);
    }
  }

  if (isArrayBufferDetached(value.buffer)) {
    throw makeException(TypeError, "is a view on a detached ArrayBuffer", options);
  }
  return value;
};

exports.BufferSource = (value, options = {}) => {
  if (ArrayBuffer.isView(value)) {
    return exports.ArrayBufferView(value, options);
  }

  if (isNonSharedArrayBuffer(value)) {
    return exports.ArrayBuffer(value, options);
  } else if (options.allowShared && isSharedArrayBuffer(value)) {
    return exports.SharedArrayBuffer(value, options);
  }

  if (options.allowShared) {
    throw makeException(TypeError, "is not an ArrayBuffer, SharedArrayBuffer, or a view on one", options);
  } else {
    throw makeException(TypeError, "is not an ArrayBuffer or a view on one", options);
  }
};

exports.DOMTimeStamp = exports["unsigned long long"];

"use strict";

// Patched mirror of `whatwg-url-without-unicode/lib/utils.js`.
//
// The upstream file does this at module-load time (line 67):
//
//   const byteLengthGetter =
//     Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, "byteLength").get;
//
// On Hermes, `byteLength` is implemented as an internal-slot accessor that
// `Object.getOwnPropertyDescriptor` returns either as `undefined` or as a
// descriptor without a `.get` function, so `.get` blows up the bundle with
// `TypeError: Cannot read property 'get' of undefined` BEFORE any user code
// runs. We replicate the file verbatim except the byteLengthGetter lookup,
// which we make defensive: prefer the real getter when present, otherwise fall
// back to a shim that delegates to a typed-array view (a separate accessor in
// Hermes, no recursion).
//
// Routed in via `metro.config.js`'s `resolver.resolveRequest`.

function isObject(value) {
  return (typeof value === "object" && value !== null) || typeof value === "function";
}

function hasOwn(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

const wrapperSymbol = Symbol("wrapper");
const implSymbol = Symbol("impl");
const sameObjectCaches = Symbol("SameObject caches");
const ctorRegistrySymbol = Symbol.for("[webidl2js]  constructor registry");

function getSameObject(wrapper, prop, creator) {
  if (!wrapper[sameObjectCaches]) {
    wrapper[sameObjectCaches] = Object.create(null);
  }

  if (prop in wrapper[sameObjectCaches]) {
    return wrapper[sameObjectCaches][prop];
  }

  wrapper[sameObjectCaches][prop] = creator();
  return wrapper[sameObjectCaches][prop];
}

function wrapperForImpl(impl) {
  return impl ? impl[wrapperSymbol] : null;
}

function implForWrapper(wrapper) {
  return wrapper ? wrapper[implSymbol] : null;
}

function tryWrapperForImpl(impl) {
  const wrapper = wrapperForImpl(impl);
  return wrapper ? wrapper : impl;
}

function tryImplForWrapper(wrapper) {
  const impl = implForWrapper(wrapper);
  return impl ? impl : wrapper;
}

const iterInternalSymbol = Symbol("internal");
const IteratorPrototype = Object.getPrototypeOf(Object.getPrototypeOf([][Symbol.iterator]()));

function isArrayIndexPropName(P) {
  if (typeof P !== "string") {
    return false;
  }
  const i = P >>> 0;
  if (i === Math.pow(2, 32) - 1) {
    return false;
  }
  const s = `${i}`;
  if (P !== s) {
    return false;
  }
  return true;
}

// === Hermes-safe byteLengthGetter ===
const _byteLengthDesc = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, "byteLength");
const byteLengthGetter =
  _byteLengthDesc && typeof _byteLengthDesc.get === "function"
    ? _byteLengthDesc.get
    : function byteLengthGetterShim() {
        // `this` is expected to be an ArrayBuffer; if it isn't, `new Uint8Array(this)`
        // throws (which is exactly what `isArrayBuffer` below relies on).
        return new Uint8Array(this).byteLength;
      };

function isArrayBuffer(value) {
  try {
    byteLengthGetter.call(value);
    return true;
  } catch (e) {
    return false;
  }
}

const supportsPropertyIndex = Symbol("supports property index");
const supportedPropertyIndices = Symbol("supported property indices");
const supportsPropertyName = Symbol("supports property name");
const supportedPropertyNames = Symbol("supported property names");
const indexedGet = Symbol("indexed property get");
const indexedSetNew = Symbol("indexed property set new");
const indexedSetExisting = Symbol("indexed property set existing");
const namedGet = Symbol("named property get");
const namedSetNew = Symbol("named property set new");
const namedSetExisting = Symbol("named property set existing");
const namedDelete = Symbol("named property delete");

module.exports = exports = {
  isObject,
  hasOwn,
  wrapperSymbol,
  implSymbol,
  getSameObject,
  ctorRegistrySymbol,
  wrapperForImpl,
  implForWrapper,
  tryWrapperForImpl,
  tryImplForWrapper,
  iterInternalSymbol,
  IteratorPrototype,
  isArrayBuffer,
  isArrayIndexPropName,
  supportsPropertyIndex,
  supportedPropertyIndices,
  supportsPropertyName,
  supportedPropertyNames,
  indexedGet,
  indexedSetNew,
  indexedSetExisting,
  namedGet,
  namedSetNew,
  namedSetExisting,
  namedDelete,
};

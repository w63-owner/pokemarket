// Metro stub used by metro.config.js's `resolver.resolveRequest` to neutralize
// browser-only modules that get pulled into the bundle via @sentry/react-native's
// transitive deps on @sentry/browser. These modules touch DOM/web APIs (canvas,
// Web Workers, SharedArrayBuffer) that Hermes does not implement, and crash the
// JS runtime at module-load time. Replacing them with this empty object is safe:
// they're only used by Sentry features (Session Replay canvas/worker) that are
// not supported on React Native and never invoked at runtime there.
module.exports = {};

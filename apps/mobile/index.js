// Custom entry point. Order matters:
//   1. Install polyfills (e.g. SharedArrayBuffer for Hermes) BEFORE any other
//      module is required, so transitive deps that touch it at module-load
//      time don't crash the JS runtime.
//   2. Hand off to expo-router's entry, which registers the root component.
require("./polyfills");
require("expo-router/entry");

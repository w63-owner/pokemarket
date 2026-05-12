const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

config.resolver.disableHierarchicalLookup = true;

config.resolver.unstable_enablePackageExports = true;

// Module redirects:
//
// 1. STUBBED_MODULES: browser-only modules that @sentry/react-native pulls in
//    transitively via @sentry/browser (canvas/web-workers/SharedArrayBuffer).
//    These power Sentry features (Session Replay canvas, replay worker) with
//    no meaning on React Native, so replacing them with an empty object is
//    behaviourally inert.
//
// 2. PATCHED_MODULES: upstream files that crash on Hermes at module-load time
//    and need a defensive replacement. Hermes inlines/optimizes intrinsic
//    accesses like `Object.getOwnPropertyDescriptor`, so JS-level monkey-
//    patching from `polyfills.js` does NOT work — every bypass must be done
//    at the call site (i.e. by replacing the source file). Currently:
//      - `whatwg-url-without-unicode/lib/utils.js` (pulled in by expo's URL
//        polyfill in `winter/runtime.native.ts`), reads
//        `Object.getOwnPropertyDescriptor(ArrayBuffer.prototype,
//        "byteLength").get` at top-level.
//      - `webidl-conversions/lib/index.js` (pulled in transitively by
//        `whatwg-url-without-unicode` and friends), additionally reads
//        `resizable` / `growable` accessors that are part of the ES2024
//        Resizable Buffers proposal — Hermes does NOT implement it, so the
//        bundle blows up with `TypeError: Cannot read property 'get' of
//        undefined` and `AppRegistry.registerComponent` is never reached
//        (the app stays stuck at the native splash forever).
const STUBBED_MODULES = new Set([
  "@sentry-internal/replay-canvas",
  "@sentry-internal/replay-worker",
]);
const emptyModulePath = path.resolve(projectRoot, "empty-module.js");
const whatwgUrlUtilsPatchPath = path.resolve(
  projectRoot,
  "patches/whatwg-url-without-unicode-utils.js",
);
const webidlConversionsPatchPath = path.resolve(
  projectRoot,
  "patches/webidl-conversions-index.js",
);
// Match any file path ending in `whatwg-url-without-unicode/lib/utils.js`
// regardless of whether it's required via "./utils" (relative, sibling file
// inside the package) or as the bare module name. We check the resolved
// absolute file path post-resolution.
const whatwgUrlUtilsRe = /[\\/]whatwg-url-without-unicode[\\/]lib[\\/]utils\.js$/;
// Match any `webidl-conversions/lib/index.js` file path — the top-level npm
// install AND the nested copy inside `whatwg-url-without-unicode/`. Both have
// the same call-site pattern that crashes on Hermes.
const webidlConversionsRe = /[\\/]webidl-conversions[\\/]lib[\\/]index\.js$/;
const baseResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (STUBBED_MODULES.has(moduleName)) {
    return { type: "sourceFile", filePath: emptyModulePath };
  }
  const resolved = baseResolveRequest
    ? baseResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
  if (
    resolved &&
    resolved.type === "sourceFile" &&
    typeof resolved.filePath === "string"
  ) {
    if (whatwgUrlUtilsRe.test(resolved.filePath)) {
      return { type: "sourceFile", filePath: whatwgUrlUtilsPatchPath };
    }
    if (webidlConversionsRe.test(resolved.filePath)) {
      return { type: "sourceFile", filePath: webidlConversionsPatchPath };
    }
  }
  return resolved;
};

// Inject our polyfill at the very top of the bundle, before InitializeCore
// and before any module registration. Belt-and-suspenders for the SharedArrayBuffer
// global some other transitive deps may still touch with `instanceof` checks.
const baseGetPolyfills = config.serializer.getPolyfills;
config.serializer.getPolyfills = (options) => [
  path.resolve(projectRoot, "polyfills.js"),
  ...baseGetPolyfills(options),
];

module.exports = withNativeWind(config, { input: "./global.css" });

const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

// SDK 54+: Expo auto-detects the monorepo workspace root and configures
// watchFolders / resolver.nodeModulesPaths automatically via getDefaultConfig.
// Manual overrides of those properties are no longer needed and can break
// features like expo-router's EXPO_ROUTER_APP_ROOT resolution.
const config = getDefaultConfig(__dirname);

config.resolver.unstable_enablePackageExports = true;

// framer-motion is a browser-only library pulled in by moti 0.30.x at module-
// load time. On Hermes its static initializers crash immediately because they
// touch DOM globals (document, window, matchMedia, ResizeObserver). Replace it
// with a minimal React-Native-safe stub that exports the subset moti uses.
const FRAMER_MOTION_STUB = path.resolve(__dirname, "stubs/framer-motion.js");

const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "framer-motion") {
    return { filePath: FRAMER_MOTION_STUB, type: "sourceFile" };
  }
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: "./global.css" });

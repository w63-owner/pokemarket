/**
 * Minimal framer-motion stub for React Native / Metro.
 *
 * moti 0.30.x imports several framer-motion APIs across its build:
 *   - { AnimatePresence }        from 'framer-motion'  (core/index.js)
 *   - { usePresence, PresenceContext } from 'framer-motion'  (core/motify.js)
 *   - type { usePresence as useFramerPresence, PresenceContext } (use-motify.ts — type-only, no runtime)
 *
 * framer-motion is a browser-only library that touches DOM globals (document,
 * window, matchMedia, ResizeObserver) at module-load time. On Hermes those
 * globals are undefined, causing:
 *   TypeError: Cannot read property 'prototype' of undefined
 *
 * This stub replaces the full library with React-Native-safe no-ops.
 * Wired via metro.config.js → resolver.resolveRequest.
 */
const React = require("react");
const { createContext } = React;

function AnimatePresence({ children }) {
  return children == null ? null : children;
}

const PresenceContext = createContext({
  isPresent: true,
  custom: [],
  initial: false,
});

function usePresence() {
  return [true, () => {}];
}

// #region agent log
(function logStubLoad() {
  try {
    if (typeof globalThis.__agentLog === "function") {
      globalThis.__agentLog({
        location: "stubs/framer-motion.js:eval",
        message: "FRAMER_MOTION_STUB_LOADED",
        hypothesisId: "H3",
        data: { hasAnimatePresence: typeof AnimatePresence, hasUsePresence: typeof usePresence },
      });
    }
  } catch (_e) {}
})();
// #endregion

const exportsObj = { AnimatePresence, PresenceContext, usePresence };

module.exports = new Proxy(exportsObj, {
  get(target, prop, receiver) {
    if (prop in target) {
      return Reflect.get(target, prop, receiver);
    }
    // #region agent log
    try {
      if (typeof globalThis.__agentLog === "function") {
        globalThis.__agentLog({
          location: "stubs/framer-motion.js:proxyGet",
          message: "FRAMER_MOTION_UNKNOWN_KEY_ACCESS",
          hypothesisId: "H1",
          data: { key: String(prop) },
        });
      }
    } catch (_e) {}
    // #endregion
    return undefined;
  },
});

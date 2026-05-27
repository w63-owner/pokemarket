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

const exportsObj = { AnimatePresence, PresenceContext, usePresence };

module.exports = new Proxy(exportsObj, {
  get(target, prop, receiver) {
    if (prop in target) {
      return Reflect.get(target, prop, receiver);
    }
    return undefined;
  },
});

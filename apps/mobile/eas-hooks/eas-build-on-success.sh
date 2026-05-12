#!/usr/bin/env bash
# EAS Build hook — runs after a successful native build.
#
# What it does:
#   1. Bundles the JS for the build target (iOS / Android)
#   2. Uploads the bundle + sourcemap to Sentry via @sentry/react-native
#   3. Tags the release as `<bundleId>@<version>+<runtimeVersion>` to
#      match what apps/mobile/lib/sentry.ts publishes at runtime.
#
# Skipped unless EAS_BUILD_PROFILE == "production".
#
# Requires the following EAS secrets (`eas secret:create`):
#   - SENTRY_AUTH_TOKEN  (auth token with project:write)
#   - SENTRY_ORG
#   - SENTRY_PROJECT     (typically "pokemarket-mobile")
set -euo pipefail

if [ "${EAS_BUILD_PROFILE:-}" != "production" ]; then
  echo "[sentry] Skipping sourcemap upload (profile=${EAS_BUILD_PROFILE:-unset})"
  exit 0
fi

if [ -z "${SENTRY_AUTH_TOKEN:-}" ] || [ -z "${SENTRY_ORG:-}" ] || [ -z "${SENTRY_PROJECT:-}" ]; then
  echo "::warning::[sentry] SENTRY_AUTH_TOKEN / SENTRY_ORG / SENTRY_PROJECT missing; skipping sourcemap upload"
  exit 0
fi

# `npx sentry-expo-upload-sourcemaps` is the Expo-aware wrapper that
# auto-discovers the bundle/sourcemap pair produced by Expo CLI.
# Cf. https://docs.expo.dev/guides/using-sentry/#uploading-source-maps-during-the-build-process
echo "[sentry] Uploading sourcemaps to ${SENTRY_ORG}/${SENTRY_PROJECT}..."
npx --yes sentry-expo-upload-sourcemaps dist || {
  echo "::warning::[sentry] sentry-expo-upload-sourcemaps failed; build continues"
  exit 0
}

echo "[sentry] Done."

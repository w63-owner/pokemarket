import * as Sentry from "@sentry/react-native";
import Constants from "expo-constants";
import { env } from "./env";

/**
 * Tags the Sentry release/dist so that source maps uploaded by the
 * @sentry/react-native/expo plugin during EAS Build line up with the
 * crashes captured at runtime.
 *
 *  - `release` is `<bundleId>@<version>+<runtimeVersion>` to disambiguate
 *    OTA updates from binary releases.
 *  - `dist` mirrors the native build number / versionCode so iOS and
 *    Android can be filtered separately in Sentry.
 */
function deriveReleaseAndDist() {
  const expo = Constants.expoConfig;
  const version = expo?.version ?? "0.0.0";
  const runtime = expo?.runtimeVersion ?? version;
  const bundleId = expo?.ios?.bundleIdentifier ?? expo?.android?.package ?? "app.pokemarket.mobile";
  const release = `${bundleId}@${version}+${runtime}`;
  const dist =
    String(expo?.ios?.buildNumber ?? expo?.android?.versionCode ?? "1");
  return { release, dist };
}

export function initSentry() {
  if (!env.SENTRY_DSN) {
    if (__DEV__) console.warn("[sentry] DSN not configured, skipping init");
    return;
  }

  const { release, dist } = deriveReleaseAndDist();

  Sentry.init({
    dsn: env.SENTRY_DSN,
    enableNative: true,
    release,
    dist,
    tracesSampleRate: __DEV__ ? 1.0 : 0.2,
    debug: __DEV__,
    environment: __DEV__ ? "development" : "production",
  });
}

export { Sentry };

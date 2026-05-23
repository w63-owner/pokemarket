import * as Sentry from "@sentry/react-native";
import { env } from "./env";

export function initSentry() {
  if (!env.SENTRY_DSN) {
    if (__DEV__) console.warn("[sentry] DSN not configured, skipping init");
    return;
  }

  Sentry.init({
    dsn: env.SENTRY_DSN,
    enableNative: true,
    tracesSampleRate: __DEV__ ? 1.0 : 0.2,
    debug: __DEV__,
  });
}

export { Sentry };

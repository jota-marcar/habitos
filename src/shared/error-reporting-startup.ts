// Starts the error reports before any other code of the app (see index.ts), so that an error
// while starting also reaches Sentry (ADR-0026).

import Constants from "expo-constants";

import { startErrorReporting } from "./error-reporting";

startErrorReporting({
  // Expo only inlines `process.env.EXPO_PUBLIC_…` read with a dot.
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  variant: Constants.expoConfig?.extra?.appVariant,
});

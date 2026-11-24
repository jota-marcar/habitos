// Metro, with the Sentry serializer: it gives each bundle a Debug ID, so the errors of a build
// or of an over-the-air update find their source maps in Sentry (ADR-0026).
// https://docs.sentry.io/platforms/react-native/manual-setup/expo/
const { getSentryExpoConfig } = require("@sentry/react-native/metro");

module.exports = getSentryExpoConfig(__dirname);

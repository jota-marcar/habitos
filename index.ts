// The entry point of the app. The error reports start first, so that an error while starting
// also reaches them (ADR-0026). The reminders start listening before Expo Router, because iOS
// may start the app in the background only to deliver the button of a reminder (RF-25).
import "./src/shared/error-reporting-startup";
import "./src/notifications/startup";
import "expo-router/entry";

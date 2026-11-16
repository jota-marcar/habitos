// The entry point of the app. The reminders start listening before Expo Router, because iOS
// may start the app in the background only to deliver the button of a reminder (RF-25).
import "./src/notifications/startup";
import "expo-router/entry";

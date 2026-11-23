// What the reminders need as soon as the app starts, before Expo Router (see index.ts): iOS
// may start the app in the background only to deliver the button of a reminder (RF-25) or to
// run the task that refreshes them.

import { openAppDatabase } from "@/shared/app-database";

import { refreshRemindersInBackground } from "./background";
import { showRemindersInForeground } from "./expo-notifier";
import { listenToReminders } from "./reminders";

showRemindersInForeground();
listenToReminders(openAppDatabase);
refreshRemindersInBackground(openAppDatabase);

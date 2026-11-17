import { StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { AppStack, STACK_SETTINGS } from "@/ui/app-stack";
import { DatabaseProvider } from "@/ui/database";
import { ReminderKeeper } from "@/ui/reminders";
import { SessionProvider, useSession } from "@/ui/session";

export const unstable_settings = STACK_SETTINGS;

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SessionProvider>
        <DatabaseProvider>
          <SignedInReminders />
          <AppStack />
        </DatabaseProvider>
      </SessionProvider>
    </GestureHandlerRootView>
  );
}

/** The reminders, and the permission to send them, only matter with a session (RF-01). */
function SignedInReminders() {
  return useSession() === null ? null : <ReminderKeeper />;
}

const styles = StyleSheet.create({ root: { flex: 1 } });

import { StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { AppStack, STACK_SETTINGS } from "@/ui/app-stack";
import { DatabaseProvider } from "@/ui/database";
import { ReminderKeeper } from "@/ui/reminders";
import { SessionProvider, useSession } from "@/ui/session";
import { SyncKeeper } from "@/ui/sync";

export const unstable_settings = STACK_SETTINGS;

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SessionProvider>
        <DatabaseProvider>
          <SignedInKeepers />
          <AppStack />
        </DatabaseProvider>
      </SessionProvider>
    </GestureHandlerRootView>
  );
}

/**
 * The reminders, the permission to send them and the synchronization only matter with a
 * session (RF-01).
 */
function SignedInKeepers() {
  if (useSession() === null) return null;
  return (
    <>
      <ReminderKeeper />
      <SyncKeeper />
    </>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });

// Keeps the reminders up to date while the app runs (ADR-0005). On opening the app it asks for
// permission to send them (RF-35) and schedules them, and it refreshes them again every time
// the app comes back: the user may have allowed them meanwhile in the phone's settings (RF-36).

import { useEffect } from "react";
import { Alert, AppState, Linking } from "react-native";

import { ensureNotificationPermission } from "@/notifications/expo-notifier";
import { refreshReminders } from "@/notifications/reminders";

import { useDatabase } from "./database";

export function ReminderKeeper() {
  const db = useDatabase();

  useEffect(() => {
    void ensureNotificationPermission().then(() => refreshReminders(db));

    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void refreshReminders(db);
    });
    return () => subscription.remove();
  }, [db]);

  return null;
}

/**
 * Warns that the reminders of a habit or task just saved will not arrive, if they are not
 * allowed (RF-36, RF-45). It is saved anyway: its reminders start working once they are allowed.
 */
export async function warnIfRemindersNotAllowed(
  subject = "este hábito",
): Promise<void> {
  if (await ensureNotificationPermission()) return;
  Alert.alert(
    "Recordatorios desactivados",
    `No recibirás los recordatorios de ${subject} hasta que los actives en los ajustes del teléfono.`,
    [
      { text: "Ahora no", style: "cancel" },
      { text: "Abrir Ajustes", onPress: () => void Linking.openSettings() },
    ],
  );
}

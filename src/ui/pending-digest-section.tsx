// The settings of the pending digest (RF-37): whether it is on and at what time. The choice is
// of the device, so it is saved there and applied at once: the digest of today already follows
// the new time if it is still to come.

import DateTimePicker from "@react-native-community/datetimepicker";
import { useEffect, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";

import type { PendingDigestSettings } from "@/domain/digests";
import { localTimeOf, type LocalTime } from "@/domain/times";
import {
  readPendingDigestSettings,
  savePendingDigestSettings,
} from "@/notifications/pending-digest-store";
import { refreshReminders } from "@/notifications/reminders";

import { Section, SwitchRow } from "./components";
import { useDatabase } from "./database";
import { fontSize, spacing, useColors } from "./theme";

const DISABLED_LINE =
  "No recibirás el aviso de lo que te queda por hacer o apuntar.";
const SAVE_ERROR = "No se ha podido guardar el cambio. Inténtalo de nuevo.";

function dateAt(time: LocalTime): Date {
  const [hours, minutes] = time.split(":").map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date;
}

export function PendingDigestSection() {
  const colors = useColors();
  const db = useDatabase();
  // Null until it is read, so that the switch does not jump from the default to the choice.
  const [settings, setSettings] = useState<PendingDigestSettings | null>(null);

  useEffect(() => {
    let active = true;
    void readPendingDigestSettings().then((read) => {
      if (active) setSettings(read);
    });
    return () => {
      active = false;
    };
  }, []);

  if (settings === null) return null;

  const change = async (next: PendingDigestSettings) => {
    const previous = settings;
    setSettings(next);
    try {
      await savePendingDigestSettings(next);
    } catch (error) {
      console.warn("The pending digest settings could not be saved.", error);
      setSettings(previous);
      Alert.alert("Aviso de pendientes", SAVE_ERROR);
      return;
    }
    await refreshReminders(db);
  };

  return (
    <Section title="Avisos">
      <SwitchRow
        label="Aviso de pendientes"
        value={settings.enabled}
        onValueChange={(enabled) => void change({ ...settings, enabled })}
      />
      {settings.enabled ? (
        <View style={styles.row}>
          <Text style={[styles.label, { color: colors.text }]}>Hora</Text>
          <DateTimePicker
            testID="pending-digest-time"
            mode="time"
            display="compact"
            locale="es-ES"
            value={dateAt(settings.time)}
            onValueChange={(_event, date) => {
              const time = localTimeOf(date);
              if (time !== settings.time) void change({ ...settings, time });
            }}
          />
        </View>
      ) : (
        <Text style={[styles.disabled, { color: colors.textSecondary }]}>
          {DISABLED_LINE}
        </Text>
      )}
    </Section>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: "center", flexDirection: "row", gap: spacing.md },
  label: { flex: 1, fontSize: fontSize.body },
  disabled: { fontSize: fontSize.caption },
});

// The form of a habit, shared by the screens that create one (RF-06) and edit one (RF-08).
// It holds what the user types and shows the errors; each screen decides how to save it.

import DateTimePicker from "@react-native-community/datetimepicker";
import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import {
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { Weekday } from "@/domain/dates";
import type { HabitError } from "@/domain/habits";
import { isScheduledOn } from "@/domain/schedule";
import { localTime, localTimeOf, type LocalTime } from "@/domain/times";
import { refreshReminders } from "@/notifications/reminders";
import { syncSoon } from "@/sync/app-sync";

import { Button, HeaderButton, Section, ToggleChip } from "./components";
import { useDatabase } from "./database";
import {
  AmountsSection,
  ColorSection,
  NameSection,
  messagesByField,
} from "./form-sections";
import { WEEKDAY_INITIALS, WEEKDAY_NAMES } from "@/shared/format";
import {
  addReminderTime,
  withPickedTime,
  type HabitFormValues,
} from "./habit-form";
import { REMINDER_ERROR_MESSAGES } from "./messages";
import { warnIfRemindersNotAllowed } from "./reminders";
import { fontSize, spacing, useColors } from "./theme";
import { hasFormChanges, useDiscardGuard } from "./use-discard-guard";
import { useRevealEnd } from "./use-reveal-end";

const WEEKDAYS: readonly Weekday[] = [0, 1, 2, 3, 4, 5, 6];

// The time the reminder picker starts at.
const DEFAULT_REMINDER_TIME = localTime("09:00");

function dateAt(time: LocalTime): Date {
  const [hours, minutes] = time.split(":").map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date;
}

export function HabitFormScreen({
  initialValues,
  editing = false,
  note,
  onSubmit,
}: {
  initialValues: HabitFormValues;
  /** A discreet line above the form. */
  note?: string;
  /** Editing a habit that already exists: its type cannot change (RF-06). */
  editing?: boolean;
  /** Saves the habit. Returns the errors that reject it: none if it was saved. */
  onSubmit: (values: HabitFormValues) => Promise<readonly HabitError[]>;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const db = useDatabase();
  const [values, setValues] = useState<HabitFormValues>(initialValues);
  const [errors, setErrors] = useState<readonly HabitError[]>([]);
  const [pickedTime, setPickedTime] = useState<LocalTime | null>(null);
  const [reminderError, setReminderError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { scrollProps, revealEnd, onPickerLayout } = useRevealEnd();

  const messages = messagesByField(errors);
  // An open picker counts: saving would add its time (RF-22).
  const closeSaved = useDiscardGuard(
    pickedTime !== null || hasFormChanges(values, initialValues),
  );

  const update = (changes: Partial<HabitFormValues>) =>
    setValues((current) => ({ ...current, ...changes }));

  const toggleDay = (weekday: Weekday) =>
    update({ scheduledDays: values.scheduledDays ^ (1 << weekday) });

  const confirmReminder = () => {
    if (pickedTime === null) return;
    const result = addReminderTime(values.reminderTimes, pickedTime);
    if (!result.ok) {
      setReminderError(REMINDER_ERROR_MESSAGES[result.errors[0]]);
      return;
    }
    update({ reminderTimes: result.value });
    setPickedTime(null);
    setReminderError(null);
  };

  // The picker opens at the bottom of the form, below the screen: the form scrolls down to show
  // it whole, with its buttons. The keyboard, if open, would hide it.
  const openPicker = () => {
    Keyboard.dismiss();
    revealEnd();
    setPickedTime(DEFAULT_REMINDER_TIME);
  };

  const removeReminder = (time: LocalTime) =>
    update({ reminderTimes: values.reminderTimes.filter((t) => t !== time) });

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const submitted = withPickedTime(values, pickedTime);
      const rejected = await onSubmit(submitted);
      setErrors(rejected);
      if (rejected.length > 0) return;
      if (submitted.reminderTimes.length > 0) await warnIfRemindersNotAllowed();
      void refreshReminders(db);
      syncSoon(db);
      closeSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView
      {...scrollProps}
      testID="habit-form"
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled"
      // The end of the form clears the home indicator, so that the last buttons, which the
      // form scrolls to, are not against the edge of the screen.
      contentContainerStyle={[
        styles.content,
        { paddingBottom: insets.bottom + spacing.md },
      ]}
    >
      <Stack.Screen
        options={{
          headerLeft: () => (
            <HeaderButton label="Cancelar" onPress={() => router.back()} />
          ),
          headerRight: () => (
            <HeaderButton label="Guardar" bold onPress={save} />
          ),
        }}
      />

      {note ? (
        <Text style={[styles.note, { color: colors.textSecondary }]}>
          {note}
        </Text>
      ) : null}

      <NameSection
        title="Hábito"
        error={messages.name}
        value={values.name}
        autoFocus={!editing}
        onChange={(name) => update({ name })}
      />

      <ColorSection
        value={values.color}
        onChange={(color) => update({ color })}
      />

      <AmountsSection
        editing={editing}
        values={values}
        error={messages.amounts}
        targetPlaceholder="2"
        unitPlaceholder="litros"
        onChange={update}
      />

      <Section title="Días" error={messages.scheduledDays}>
        <View style={styles.days}>
          {WEEKDAYS.map((weekday) => (
            <ToggleChip
              key={weekday}
              label={WEEKDAY_INITIALS[weekday]}
              accessibilityLabel={WEEKDAY_NAMES[weekday]}
              selected={isScheduledOn(values.scheduledDays, weekday)}
              onPress={() => toggleDay(weekday)}
            />
          ))}
        </View>
      </Section>

      <Section title="Recordatorios" error={reminderError}>
        {values.reminderTimes.map((time) => (
          <View key={time} style={styles.reminder}>
            <Text style={[styles.reminderTime, { color: colors.text }]}>
              {time}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Quitar el recordatorio de las ${time}`}
              hitSlop={spacing.sm}
              onPress={() => removeReminder(time)}
            >
              <Text style={[styles.remove, { color: colors.danger }]}>
                Quitar
              </Text>
            </Pressable>
          </View>
        ))}
        {pickedTime === null ? (
          <Button
            label="Añadir recordatorio"
            variant="secondary"
            onPress={openPicker}
          />
        ) : (
          <>
            <DateTimePicker
              testID="reminder-picker"
              mode="time"
              display="spinner"
              locale="es-ES"
              value={dateAt(pickedTime)}
              onLayout={onPickerLayout}
              onValueChange={(_event, date) => setPickedTime(localTimeOf(date))}
            />
            <View style={styles.pickerActions}>
              <Button
                label="Descartar"
                variant="secondary"
                onPress={() => {
                  setPickedTime(null);
                  setReminderError(null);
                }}
              />
              <Button label="Añadir" onPress={confirmReminder} />
            </View>
          </>
        )}
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg, padding: spacing.md },
  note: { fontSize: fontSize.caption, paddingHorizontal: spacing.md },
  days: { flexDirection: "row", justifyContent: "space-between" },
  reminder: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  reminderTime: { fontSize: fontSize.body, fontVariant: ["tabular-nums"] },
  remove: { fontSize: fontSize.body },
  pickerActions: {
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "flex-end",
  },
});

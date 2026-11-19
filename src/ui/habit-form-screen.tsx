// The form of a habit, shared by the screens that create one (RF-06) and edit one (RF-08).
// It holds what the user types and shows the errors; each screen decides how to save it.

import DateTimePicker from "@react-native-community/datetimepicker";
import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import type { Weekday } from "@/domain/dates";
import {
  HABIT_COLORS,
  type HabitColor,
  type HabitError,
  type HabitType,
} from "@/domain/habits";
import { isScheduledOn } from "@/domain/schedule";
import { localTime, localTimeOf, type LocalTime } from "@/domain/times";
import { refreshReminders } from "@/notifications/reminders";
import { syncSoon } from "@/sync/app-sync";

import {
  Button,
  ColorSwatch,
  Field,
  HeaderButton,
  Section,
  SegmentedControl,
  ToggleChip,
} from "./components";
import { useDatabase } from "./database";
import { HABIT_COLOR_NAMES, WEEKDAY_INITIALS, WEEKDAY_NAMES } from "./format";
import {
  addReminderTime,
  fieldOf,
  type HabitFormField,
  type HabitFormValues,
} from "./habit-form";
import { HABIT_ERROR_MESSAGES, REMINDER_ERROR_MESSAGES } from "./messages";
import { warnIfRemindersNotAllowed } from "./reminders";
import { fontSize, spacing, useColors } from "./theme";

const TYPE_OPTIONS: readonly { value: HabitType; label: string }[] = [
  { value: "boolean", label: "Sí o no" },
  { value: "quantitative", label: "Cantidad" },
];

const WEEKDAYS: readonly Weekday[] = [0, 1, 2, 3, 4, 5, 6];

// The colors are shown in rows, like the days of the week.
const COLORS_PER_ROW = 6;
const COLOR_ROWS: readonly (readonly HabitColor[])[] = [
  HABIT_COLORS.slice(0, COLORS_PER_ROW),
  HABIT_COLORS.slice(COLORS_PER_ROW),
];

// The time the reminder picker starts at.
const DEFAULT_REMINDER_TIME = localTime("09:00");

function dateAt(time: LocalTime): Date {
  const [hours, minutes] = time.split(":").map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date;
}

/** The first message for each field, if it has errors. */
function messagesByField(
  errors: readonly HabitError[],
): Partial<Record<HabitFormField, string>> {
  const messages: Partial<Record<HabitFormField, string>> = {};
  for (const error of errors) {
    messages[fieldOf(error)] ??= HABIT_ERROR_MESSAGES[error];
  }
  return messages;
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
  const router = useRouter();
  const db = useDatabase();
  const [values, setValues] = useState<HabitFormValues>(initialValues);
  const [errors, setErrors] = useState<readonly HabitError[]>([]);
  const [pickedTime, setPickedTime] = useState<LocalTime | null>(null);
  const [reminderError, setReminderError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const messages = messagesByField(errors);
  const quantitative = values.type === "quantitative";

  const update = (changes: Partial<HabitFormValues>) =>
    setValues((current) => ({ ...current, ...changes }));

  const toggleDay = (weekday: Weekday) =>
    update({ scheduledDays: values.scheduledDays ^ (1 << weekday) });

  // Touching the chosen color leaves the habit without one (RF-06).
  const toggleColor = (color: HabitColor) =>
    update({ color: values.color === color ? null : color });

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

  const removeReminder = (time: LocalTime) =>
    update({ reminderTimes: values.reminderTimes.filter((t) => t !== time) });

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const rejected = await onSubmit(values);
      setErrors(rejected);
      if (rejected.length > 0) return;
      if (values.reminderTimes.length > 0) await warnIfRemindersNotAllowed();
      void refreshReminders(db);
      syncSoon(db);
      router.back();
    } finally {
      setSaving(false);
    }
  };

  // Touching an amount selects it, so that what is typed replaces it: a target of 2 becomes
  // 3, not 23.
  const amounts = quantitative ? (
    <>
      <Field
        label="Meta"
        placeholder="2"
        keyboardType="decimal-pad"
        selectTextOnFocus
        value={values.target}
        onChangeText={(target) => update({ target })}
      />
      <Field
        label="Unidad"
        placeholder="L"
        selectTextOnFocus
        value={values.unit}
        onChangeText={(unit) => update({ unit })}
      />
      <Field
        label="Incremento"
        keyboardType="decimal-pad"
        selectTextOnFocus
        value={values.increment}
        onChangeText={(increment) => update({ increment })}
      />
    </>
  ) : null;

  return (
    <ScrollView
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.content}
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

      <Section title="Hábito" error={messages.name}>
        <Field
          label="Nombre"
          labelHidden
          placeholder="Nombre"
          value={values.name}
          onChangeText={(name) => update({ name })}
          autoFocus={!editing}
          returnKeyType="done"
        />
      </Section>

      <Section title="Color">
        <View style={styles.colors}>
          {COLOR_ROWS.map((row) => (
            <View key={row[0]} style={styles.colorRow}>
              {row.map((color) => (
                <ColorSwatch
                  key={color}
                  color={colors.habit[color]}
                  accessibilityLabel={HABIT_COLOR_NAMES[color]}
                  selected={values.color === color}
                  onPress={() => toggleColor(color)}
                />
              ))}
            </View>
          ))}
        </View>
      </Section>

      {editing ? (
        quantitative ? (
          <Section title="Cantidad" error={messages.amounts}>
            {amounts}
          </Section>
        ) : null
      ) : (
        <Section title="Tipo" error={messages.amounts}>
          <SegmentedControl
            options={TYPE_OPTIONS}
            value={values.type}
            onChange={(type) => update({ type })}
          />
          {amounts}
        </Section>
      )}

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
            onPress={() => setPickedTime(DEFAULT_REMINDER_TIME)}
          />
        ) : (
          <>
            <DateTimePicker
              testID="reminder-picker"
              mode="time"
              display="spinner"
              locale="es-ES"
              value={dateAt(pickedTime)}
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
  colors: { gap: spacing.xs },
  colorRow: { flexDirection: "row", justifyContent: "space-between" },
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

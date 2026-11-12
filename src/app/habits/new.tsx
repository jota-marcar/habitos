// The form to create a habit (RF-06), presented as a modal.

import DateTimePicker from "@react-native-community/datetimepicker";
import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { addHabit } from "@/data/habits-repository";
import type { Weekday } from "@/domain/dates";
import type { HabitError, HabitType } from "@/domain/habits";
import { isScheduledOn } from "@/domain/schedule";
import { localTime, localTimeOf, type LocalTime } from "@/domain/times";
import { newId, today } from "@/ui/clock";
import {
  Button,
  Field,
  HeaderButton,
  Section,
  SegmentedControl,
  ToggleChip,
} from "@/ui/components";
import { useDatabase } from "@/ui/database";
import { WEEKDAY_INITIALS, WEEKDAY_NAMES } from "@/ui/format";
import {
  EMPTY_HABIT_FORM,
  addReminderTime,
  buildHabit,
  fieldOf,
  type HabitFormField,
  type HabitFormValues,
} from "@/ui/habit-form";
import { HABIT_ERROR_MESSAGES, REMINDER_ERROR_MESSAGES } from "@/ui/messages";
import { fontSize, spacing, useColors } from "@/ui/theme";

const TYPE_OPTIONS: readonly { value: HabitType; label: string }[] = [
  { value: "boolean", label: "Sí o no" },
  { value: "quantitative", label: "Cantidad" },
];

const WEEKDAYS: readonly Weekday[] = [0, 1, 2, 3, 4, 5, 6];

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

export default function NewHabit() {
  const colors = useColors();
  const router = useRouter();
  const db = useDatabase();
  const [values, setValues] = useState<HabitFormValues>(EMPTY_HABIT_FORM);
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
    const result = buildHabit(values, newId, today());
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setSaving(true);
    try {
      await addHabit(db, result.habit, result.version, result.reminders);
      router.back();
    } finally {
      setSaving(false);
    }
  };

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

      <Section title="Hábito" error={messages.name}>
        <Field
          label="Nombre"
          placeholder="Meditar"
          value={values.name}
          onChangeText={(name) => update({ name })}
          autoFocus
          returnKeyType="done"
        />
      </Section>

      <Section title="Tipo" error={messages.amounts}>
        <SegmentedControl
          options={TYPE_OPTIONS}
          value={values.type}
          onChange={(type) => update({ type })}
        />
        {quantitative ? (
          <>
            <Field
              label="Meta"
              placeholder="2"
              keyboardType="decimal-pad"
              value={values.target}
              onChangeText={(target) => update({ target })}
            />
            <Field
              label="Unidad"
              placeholder="L"
              value={values.unit}
              onChangeText={(unit) => update({ unit })}
            />
            <Field
              label="Incremento"
              keyboardType="decimal-pad"
              value={values.increment}
              onChangeText={(increment) => update({ increment })}
            />
          </>
        ) : null}
      </Section>

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

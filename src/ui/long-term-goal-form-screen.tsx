// The form of a long-term goal, shared by the screens that create one (RF-55) and edit one
// (RF-56). It holds what the user types and shows the errors; each screen decides how to save it.

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

import { localDateOf, type LocalDate } from "@/domain/dates";
import {
  countdownStart,
  daysLeft,
  earliestDeadline,
  type LongTermGoalError,
} from "@/domain/long-term-goals";
import { refreshReminders } from "@/notifications/reminders";
import { syncSoon } from "@/sync/app-sync";

import { today } from "@/shared/clock";
import { formatDaysLeftLine, formatFullDate } from "@/shared/format";
import { Button, HeaderButton, Section } from "./components";
import { useDatabase } from "./database";
import {
  AmountsSection,
  ColorSection,
  NameSection,
  messagesByField,
} from "./form-sections";
import {
  isDeadlineError,
  type LongTermGoalFormValues,
} from "./long-term-goal-form";
import { DEADLINE_ERROR_MESSAGES } from "./messages";
import { fontSize, spacing, useColors } from "./theme";
import { hasFormChanges, useDiscardGuard } from "./use-discard-guard";
import { useRevealEnd } from "./use-reveal-end";

// The calendar works with instants: midday keeps the day whatever the time zone does.
function instantOf(date: LocalDate): Date {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

export function LongTermGoalFormScreen({
  initialValues,
  firstDay,
  editing = false,
  onSubmit,
}: {
  initialValues: LongTermGoalFormValues;
  /** The day the goal starts, which the deadline has to come after. */
  firstDay: LocalDate;
  /** Editing a goal that already exists: its type cannot change (RF-55). */
  editing?: boolean;
  /** Saves the goal. Returns the errors that reject it: none if it was saved. */
  onSubmit: (
    values: LongTermGoalFormValues,
  ) => Promise<readonly LongTermGoalError[]>;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const db = useDatabase();
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState<readonly LongTermGoalError[]>([]);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const { scrollProps, revealEnd, onPickerLayout } = useRevealEnd();
  const messages = messagesByField(errors.filter((e) => !isDeadlineError(e)));
  const deadlineError = errors.find(isDeadlineError);
  const closeSaved = useDiscardGuard(hasFormChanges(values, initialValues));

  const update = (changes: Partial<LongTermGoalFormValues>) =>
    setValues((current) => ({ ...current, ...changes }));

  const earliest = earliestDeadline(firstDay, today());

  // The calendar opens at the end of the form, which scrolls down to show it. A calendar has to
  // show a day: opening it chooses the first one allowed, and the line under it says how much
  // time that gives (RF-55).
  const openCalendar = () => {
    Keyboard.dismiss();
    revealEnd();
    update({ deadline: values.deadline ?? earliest });
    setCalendarOpen(true);
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const rejected = await onSubmit(values);
      setErrors(rejected);
      if (rejected.length > 0) return;
      // The goal may change what the long-term goal digests name or how they say it (RF-63).
      void refreshReminders(db);
      syncSoon(db);
      closeSaved();
    } finally {
      setSaving(false);
    }
  };

  const { deadline } = values;

  return (
    <ScrollView
      {...scrollProps}
      testID="long-term-goal-form"
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled"
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

      <NameSection
        title="Meta"
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
        targetPlaceholder="24"
        unitPlaceholder="libros"
        onChange={update}
      />

      <Section
        title="Fecha límite"
        error={
          deadlineError === undefined
            ? undefined
            : DEADLINE_ERROR_MESSAGES[deadlineError]
        }
      >
        {deadline === null ? (
          <Button
            label="Elegir fecha límite"
            variant="secondary"
            onPress={openCalendar}
          />
        ) : calendarOpen ? (
          <DateTimePicker
            testID="deadline-picker"
            mode="date"
            display="inline"
            locale="es-ES"
            value={instantOf(deadline)}
            minimumDate={instantOf(earliest)}
            onLayout={onPickerLayout}
            onValueChange={(_event, date) =>
              update({ deadline: localDateOf(date) })
            }
          />
        ) : (
          <View style={styles.deadline}>
            <Text style={[styles.deadlineDate, { color: colors.text }]}>
              {formatFullDate(deadline)}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cambiar la fecha límite"
              hitSlop={spacing.sm}
              onPress={openCalendar}
            >
              <Text style={[styles.change, { color: colors.primary }]}>
                Cambiar
              </Text>
            </Pressable>
          </View>
        )}
        {/* How much time the date gives, so that a wrong day or year shows at once (RF-55). */}
        {deadline === null ? null : (
          <Text
            testID="days-left"
            style={[styles.daysLeft, { color: colors.textSecondary }]}
          >
            {formatDaysLeftLine(
              daysLeft(deadline, countdownStart(firstDay, today())),
            )}
          </Text>
        )}
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg, padding: spacing.md },
  deadline: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  deadlineDate: { fontSize: fontSize.body },
  change: { fontSize: fontSize.body },
  daysLeft: { fontSize: fontSize.caption },
});

// The form of a weekly goal, shared by the screens that create one (RF-42) and edit one (RF-43).
// It holds what the user types and shows the errors; each screen decides how to save it.

import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { LocalDate } from "@/domain/dates";
import type { WeeklyGoalError } from "@/domain/weekly-goals";
import { syncSoon } from "@/sync/app-sync";

import { today } from "./clock";
import { HeaderButton, Section, SwitchRow } from "./components";
import { useDatabase } from "./database";
import {
  AmountsSection,
  ColorSection,
  NameSection,
  messagesByField,
} from "./form-sections";
import { fontSize, spacing, useColors } from "./theme";
import { repetitionNote, type WeeklyGoalFormValues } from "./weekly-goal-form";

export function WeeklyGoalFormScreen({
  initialValues,
  firstWeek,
  note,
  onSubmit,
}: {
  initialValues: WeeklyGoalFormValues;
  /**
   * The Monday a new goal starts on, to say what will happen with it. Without it the goal already
   * exists, and neither its type nor its repetition can change (RF-42).
   */
  firstWeek?: LocalDate;
  /** A discreet line above the form. */
  note?: string;
  /** Saves the goal. Returns the errors that reject it: none if it was saved. */
  onSubmit: (
    values: WeeklyGoalFormValues,
  ) => Promise<readonly WeeklyGoalError[]>;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const db = useDatabase();
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState<readonly WeeklyGoalError[]>([]);
  const [saving, setSaving] = useState(false);
  const editing = firstWeek === undefined;
  const messages = messagesByField(errors);

  const update = (changes: Partial<WeeklyGoalFormValues>) =>
    setValues((current) => ({ ...current, ...changes }));

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const rejected = await onSubmit(values);
      setErrors(rejected);
      if (rejected.length > 0) return;
      syncSoon(db);
      router.back();
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView
      testID="weekly-goal-form"
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

      {note ? (
        <Text style={[styles.note, { color: colors.textSecondary }]}>
          {note}
        </Text>
      ) : null}

      <NameSection
        title="Objetivo"
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
        targetPlaceholder="5"
        unitPlaceholder="h"
        onChange={update}
      />

      {firstWeek === undefined ? null : (
        <Section title="Repetición">
          <SwitchRow
            label="Repetir cada semana"
            value={values.recurring}
            onValueChange={(recurring) => update({ recurring })}
          />
          <Text style={[styles.repetition, { color: colors.textSecondary }]}>
            {repetitionNote(values.recurring, firstWeek, today())}
          </Text>
        </Section>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg, padding: spacing.md },
  note: { fontSize: fontSize.caption, paddingHorizontal: spacing.md },
  repetition: { fontSize: fontSize.caption },
});

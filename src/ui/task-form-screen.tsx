// The form of a task, shared by the screens that create one (RF-40) and edit one (RF-41). It is
// like the form of a habit, with a due day and time instead of the days and the reminders.

import DateTimePicker from "@react-native-community/datetimepicker";
import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { TaskError } from "@/domain/tasks";
import { instantOf, localDateTimeOf } from "@/notifications/planner";
import { refreshReminders } from "@/notifications/reminders";
import { syncSoon } from "@/sync/app-sync";

import { now } from "./clock";
import { Field, HeaderButton, Section } from "./components";
import { useDatabase } from "./database";
import { AmountFields, ColorSection, TypeSection } from "./form-sections";
import { TASK_ERROR_MESSAGES } from "./messages";
import { warnIfRemindersNotAllowed } from "./reminders";
import {
  taskFieldOf,
  type TaskFormField,
  type TaskFormValues,
} from "./task-form";
import { fontSize, spacing, useColors } from "./theme";

/** The first message for each field, if it has errors. */
function messagesByField(
  errors: readonly TaskError[],
): Partial<Record<TaskFormField, string>> {
  const messages: Partial<Record<TaskFormField, string>> = {};
  for (const error of errors) {
    messages[taskFieldOf(error)] ??= TASK_ERROR_MESSAGES[error];
  }
  return messages;
}

export function TaskFormScreen({
  initialValues,
  editing = false,
  onSubmit,
}: {
  initialValues: TaskFormValues;
  /** Editing a task that already exists: its type cannot change (RF-40). */
  editing?: boolean;
  /** Saves the task. Returns the errors that reject it: none if it was saved. */
  onSubmit: (values: TaskFormValues) => Promise<readonly TaskError[]>;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const db = useDatabase();
  const [values, setValues] = useState<TaskFormValues>(initialValues);
  const [errors, setErrors] = useState<readonly TaskError[]>([]);
  const [saving, setSaving] = useState(false);

  const messages = messagesByField(errors);
  const quantitative = values.type === "quantitative";

  const update = (changes: Partial<TaskFormValues>) =>
    setValues((current) => ({ ...current, ...changes }));

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const rejected = await onSubmit(values);
      setErrors(rejected);
      if (rejected.length > 0) return;
      await warnIfRemindersNotAllowed("esta tarea");
      void refreshReminders(db);
      syncSoon(db);
      router.back();
    } finally {
      setSaving(false);
    }
  };

  const amounts = quantitative ? (
    <AmountFields values={values} onChange={update} />
  ) : null;

  return (
    <ScrollView
      testID="task-form"
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

      <Section title="Tarea" error={messages.name}>
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

      <ColorSection
        value={values.color}
        onChange={(color) => update({ color })}
      />

      {editing ? (
        quantitative ? (
          <Section title="Cantidad" error={messages.amounts}>
            {amounts}
          </Section>
        ) : null
      ) : (
        <TypeSection
          value={values.type}
          error={messages.amounts}
          onChange={(type) => update({ type })}
        >
          {amounts}
        </TypeSection>
      )}

      <Section title="Vencimiento" error={messages.due}>
        <View style={styles.due}>
          <Text style={[styles.dueLabel, { color: colors.text }]}>
            Día y hora
          </Text>
          {/* The compact picker opens over the form, so it never falls off the screen. */}
          <DateTimePicker
            testID="task-due-picker"
            mode="datetime"
            display="compact"
            locale="es-ES"
            minimumDate={now()}
            value={instantOf(values.due)}
            onValueChange={(_event, date) =>
              update({ due: localDateTimeOf(date) })
            }
          />
        </View>
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg, padding: spacing.md },
  due: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  dueLabel: { fontSize: fontSize.body },
});

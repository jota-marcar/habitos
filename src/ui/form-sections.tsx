// The parts that the forms of a habit (RF-06) and a task (RF-40) have in common.

import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { HABIT_COLORS, type HabitColor, type HabitType } from "@/domain/habits";

import { ColorSwatch, Field, Section, SegmentedControl } from "./components";
import { HABIT_COLOR_NAMES } from "./format";
import { spacing, useColors } from "./theme";

const TYPE_OPTIONS: readonly { value: HabitType; label: string }[] = [
  { value: "boolean", label: "Sí o no" },
  { value: "quantitative", label: "Cantidad" },
];

// The colors are shown in rows, like the days of the week.
const COLORS_PER_ROW = 6;
const COLOR_ROWS: readonly (readonly HabitColor[])[] = [
  HABIT_COLORS.slice(0, COLORS_PER_ROW),
  HABIT_COLORS.slice(COLORS_PER_ROW),
];

/** The palette. Touching the chosen color leaves it without one (RF-06). */
export function ColorSection({
  value,
  onChange,
}: {
  value: HabitColor | null;
  onChange: (color: HabitColor | null) => void;
}) {
  const colors = useColors();
  return (
    <Section title="Color">
      <View style={styles.colors}>
        {COLOR_ROWS.map((row) => (
          <View key={row[0]} style={styles.colorRow}>
            {row.map((color) => (
              <ColorSwatch
                key={color}
                color={colors.habit[color]}
                accessibilityLabel={HABIT_COLOR_NAMES[color]}
                selected={value === color}
                onPress={() => onChange(value === color ? null : color)}
              />
            ))}
          </View>
        ))}
      </View>
    </Section>
  );
}

export interface AmountValues {
  /** The amounts as typed, so that "1," can be shown while typing "1,5". */
  readonly target: string;
  readonly unit: string;
  readonly increment: string;
}

/**
 * The amounts of a quantitative habit or task. Touching one selects it, so that what is typed
 * replaces it: a target of 2 becomes 3, not 23.
 */
export function AmountFields({
  values,
  onChange,
}: {
  values: AmountValues;
  onChange: (changes: Partial<AmountValues>) => void;
}) {
  return (
    <>
      <Field
        label="Meta"
        placeholder="2"
        keyboardType="decimal-pad"
        selectTextOnFocus
        value={values.target}
        onChangeText={(target) => onChange({ target })}
      />
      <Field
        label="Unidad"
        placeholder="L"
        selectTextOnFocus
        value={values.unit}
        onChangeText={(unit) => onChange({ unit })}
      />
      <Field
        label="Incremento"
        keyboardType="decimal-pad"
        selectTextOnFocus
        value={values.increment}
        onChangeText={(increment) => onChange({ increment })}
      />
    </>
  );
}

/** The type, which can only be chosen when creating, followed by its amounts. */
export function TypeSection({
  value,
  error,
  onChange,
  children,
}: {
  value: HabitType;
  error?: string;
  onChange: (type: HabitType) => void;
  children: ReactNode;
}) {
  return (
    <Section title="Tipo" error={error}>
      <SegmentedControl
        options={TYPE_OPTIONS}
        value={value}
        onChange={onChange}
      />
      {children}
    </Section>
  );
}

const styles = StyleSheet.create({
  colors: { gap: spacing.xs },
  colorRow: { flexDirection: "row", justifyContent: "space-between" },
});

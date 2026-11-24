// The sections shared by the forms of a habit (RF-06) and a weekly goal (RF-42): the name, the
// color, and the type with its amounts.

import { StyleSheet, View } from "react-native";

import { fitsMaxAmount } from "@/domain/amounts";
import {
  HABIT_COLORS,
  MAX_NAME_LENGTH,
  MAX_UNIT_LENGTH,
  limitedText,
  type HabitColor,
  type HabitError,
  type HabitType,
} from "@/domain/habits";

import { ColorSwatch, Field, Section, SegmentedControl } from "./components";
import { HABIT_COLOR_NAMES } from "@/shared/format";
import { fieldOf, type HabitFormField } from "./habit-form";
import { HABIT_ERROR_MESSAGES } from "./messages";
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

/** The first message for each field, if it has errors. */
export function messagesByField(
  errors: readonly HabitError[],
): Partial<Record<HabitFormField, string>> {
  const messages: Partial<Record<HabitFormField, string>> = {};
  for (const error of errors) {
    messages[fieldOf(error)] ??= HABIT_ERROR_MESSAGES[error];
  }
  return messages;
}

export function NameSection({
  title,
  error,
  value,
  autoFocus,
  onChange,
}: {
  title: string;
  error?: string;
  value: string;
  autoFocus: boolean;
  onChange: (name: string) => void;
}) {
  return (
    <Section title={title} error={error}>
      <Field
        label="Nombre"
        labelHidden
        placeholder="Nombre"
        value={value}
        // Not `maxLength`: it counts an emoji as two characters, and the rule as one.
        onChangeText={(name) => onChange(limitedText(name, MAX_NAME_LENGTH))}
        autoFocus={autoFocus}
        returnKeyType="done"
      />
    </Section>
  );
}

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
                // Touching the chosen color takes it away (RF-06).
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
  readonly type: HabitType;
  /** The amounts as typed, so that "1," can be shown while typing "1,5". */
  readonly target: string;
  readonly unit: string;
  readonly increment: string;
}

/**
 * The type and the amounts. The type cannot change once created, so when `editing` only the
 * amounts are shown, if it has any.
 */
export function AmountsSection({
  editing,
  values,
  error,
  targetPlaceholder,
  unitPlaceholder,
  onChange,
}: {
  editing: boolean;
  values: AmountValues;
  error?: string;
  targetPlaceholder: string;
  unitPlaceholder: string;
  onChange: (changes: Partial<AmountValues>) => void;
}) {
  const quantitative = values.type === "quantitative";

  // Touching an amount selects it, so that what is typed replaces it: a target of 2 becomes
  // 3, not 23.
  const amounts = quantitative ? (
    <>
      <Field
        label="Meta"
        placeholder={targetPlaceholder}
        keyboardType="decimal-pad"
        selectTextOnFocus
        value={values.target}
        onChangeText={(target) => {
          // Shorter always goes through: an older amount above the maximum can be corrected.
          if (fitsMaxAmount(target) || target.length < values.target.length) {
            onChange({ target });
          }
        }}
      />
      <Field
        label="Unidad"
        placeholder={unitPlaceholder}
        selectTextOnFocus
        value={values.unit}
        onChangeText={(unit) =>
          onChange({ unit: limitedText(unit, MAX_UNIT_LENGTH) })
        }
      />
      <Field
        label="Incremento"
        keyboardType="decimal-pad"
        selectTextOnFocus
        value={values.increment}
        onChangeText={(increment) => {
          if (
            fitsMaxAmount(increment) ||
            increment.length < values.increment.length
          ) {
            onChange({ increment });
          }
        }}
      />
    </>
  ) : null;

  if (editing) {
    return quantitative ? (
      <Section title="Cantidad" error={error}>
        {amounts}
      </Section>
    ) : null;
  }
  return (
    <Section title="Tipo" error={error}>
      <SegmentedControl
        options={TYPE_OPTIONS}
        value={values.type}
        onChange={(type) => onChange({ type })}
      />
      {amounts}
    </Section>
  );
}

const styles = StyleSheet.create({
  colors: { gap: spacing.xs },
  colorRow: { flexDirection: "row", justifyContent: "space-between" },
});

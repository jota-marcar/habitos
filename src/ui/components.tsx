// Reusable pieces of the interface, styled with the tokens of the theme (ADR-0010).

import type { ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";

import { fontSize, radius, spacing, useColors } from "./theme";

/** A text button for the header of a screen. */
export function HeaderButton({
  label,
  accessibilityLabel,
  onPress,
  bold = false,
}: {
  label: string;
  accessibilityLabel?: string;
  onPress: () => void;
  bold?: boolean;
}) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      hitSlop={spacing.sm}
      onPress={onPress}
    >
      <Text
        style={[
          styles.headerButton,
          { color: colors.primary },
          bold && styles.bold,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** The main action of a screen, or a secondary one with `variant="secondary"`. */
export function Button({
  label,
  onPress,
  variant = "primary",
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary";
}) {
  const colors = useColors();
  const primary = variant === "primary";
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        primary
          ? { backgroundColor: colors.primary }
          : { borderColor: colors.primary, borderWidth: 1 },
        pressed && styles.pressed,
      ]}
    >
      <Text
        style={[
          styles.buttonLabel,
          { color: primary ? colors.onPrimary : colors.primary },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** A titled group of controls, like the sections of an iOS form. */
export function Section({
  title,
  error,
  children,
}: {
  title: string;
  error?: string | null;
  children: ReactNode;
}) {
  const colors = useColors();
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
        {title.toUpperCase()}
      </Text>
      <View style={[styles.sectionBody, { backgroundColor: colors.surface }]}>
        {children}
      </View>
      {error ? (
        <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>
      ) : null}
    </View>
  );
}

/** A text field with a label, to place inside a Section. */
export function Field({
  label,
  ...props
}: { label: string } & Omit<TextInputProps, "style" | "accessibilityLabel">) {
  const colors = useColors();
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: colors.text }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.textSecondary}
        style={[styles.fieldInput, { color: colors.text }]}
        {...props}
      />
    </View>
  );
}

/** Mutually exclusive options, shown side by side. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const colors = useColors();
  return (
    <View style={styles.segments}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            onPress={() => onChange(option.value)}
            style={[
              styles.segment,
              { borderColor: colors.primary },
              selected && { backgroundColor: colors.primary },
            ]}
          >
            <Text
              style={[
                styles.segmentLabel,
                { color: selected ? colors.onPrimary : colors.primary },
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A round toggle with a short label, such as the initial of a weekday. */
export function ToggleChip({
  label,
  accessibilityLabel,
  selected,
  onPress,
}: {
  label: string;
  accessibilityLabel: string;
  selected: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={[
        styles.chip,
        { borderColor: colors.primary },
        selected && { backgroundColor: colors.primary },
      ]}
    >
      <Text
        style={[
          styles.chipLabel,
          { color: selected ? colors.onPrimary : colors.primary },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bold: { fontWeight: "600" },
  pressed: { opacity: 0.6 },
  headerButton: { fontSize: fontSize.body },
  button: {
    alignItems: "center",
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md - spacing.xs,
  },
  buttonLabel: { fontSize: fontSize.body, fontWeight: "600" },
  section: { gap: spacing.xs + 2 },
  sectionTitle: {
    fontSize: fontSize.caption,
    paddingHorizontal: spacing.md,
  },
  sectionBody: {
    borderRadius: radius.md,
    gap: spacing.md,
    padding: spacing.md,
  },
  error: { fontSize: fontSize.caption, paddingHorizontal: spacing.md },
  field: { alignItems: "center", flexDirection: "row", gap: spacing.md },
  fieldLabel: { fontSize: fontSize.body },
  fieldInput: { flex: 1, fontSize: fontSize.body, textAlign: "right" },
  segments: { flexDirection: "row", gap: spacing.sm },
  segment: {
    alignItems: "center",
    borderRadius: radius.sm,
    borderWidth: 1,
    flex: 1,
    paddingVertical: spacing.sm,
  },
  segmentLabel: { fontSize: fontSize.body },
  chip: {
    alignItems: "center",
    borderRadius: radius.round,
    borderWidth: 1,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  chipLabel: { fontSize: fontSize.body - 2, fontWeight: "600" },
});

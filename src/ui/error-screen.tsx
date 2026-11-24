// What the app shows if it cannot go on, for example if the database does not open. It replaces
// the whole app, so it depends on no provider.

import type { ErrorBoundaryProps } from "expo-router";
import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";

import { reportError } from "@/shared/error-reporting";

import { Button } from "./components";
import { fontSize, spacing, useColors } from "./theme";

export function ErrorScreen({ error, retry }: ErrorBoundaryProps) {
  const colors = useColors();
  // The boundary catches the error before Sentry could see it (ADR-0026).
  useEffect(() => reportError(error, "error-screen"), [error]);
  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Text
        accessibilityRole="header"
        style={[styles.title, { color: colors.text }]}
      >
        Algo ha fallado
      </Text>
      <Text style={[styles.body, { color: colors.textSecondary }]}>
        Este error no borra tus datos. Inténtalo de nuevo y, si sigue pasando,
        cierra la app y vuelve a abrirla.
      </Text>
      <Button label="Reintentar" onPress={() => void retry()} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    gap: spacing.md,
    justifyContent: "center",
    padding: spacing.xl,
  },
  title: { fontSize: fontSize.title, fontWeight: "600", textAlign: "center" },
  body: { fontSize: fontSize.body, textAlign: "center" },
});

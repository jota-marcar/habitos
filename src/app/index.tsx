// The day view, the main screen (RF-12). For now it only shows today's date and leads to the
// habits; the list of the day comes next.

import { Stack, useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { today } from "@/ui/clock";
import { Button, HeaderButton } from "@/ui/components";
import { formatLongDate } from "@/ui/format";
import { fontSize, spacing, useColors } from "@/ui/theme";
import { useActiveHabits } from "@/ui/use-active-habits";

export default function Today() {
  const colors = useColors();
  const router = useRouter();
  const habits = useActiveHabits();

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerLeft: () => (
            <HeaderButton
              label="Hábitos"
              onPress={() => router.push("/habits")}
            />
          ),
          headerRight: () => (
            <HeaderButton
              label="+"
              accessibilityLabel="Nuevo hábito"
              bold
              onPress={() => router.push("/habits/new")}
            />
          ),
        }}
      />
      <Text style={[styles.date, { color: colors.text }]}>
        {formatLongDate(today())}
      </Text>
      {habits !== null && habits.length === 0 ? (
        <View style={styles.empty}>
          <Text style={[styles.message, { color: colors.textSecondary }]}>
            Todavía no tienes hábitos.
          </Text>
          <Button
            label="Crear hábito"
            onPress={() => router.push("/habits/new")}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, gap: spacing.xl, padding: spacing.md },
  date: { fontSize: fontSize.large, fontWeight: "700" },
  empty: { alignItems: "center", gap: spacing.md, marginTop: spacing.xl },
  message: { fontSize: fontSize.body, textAlign: "center" },
});

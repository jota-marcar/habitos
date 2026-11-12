// The list of active habits (RF-07), in the same order as the day view.

import { Stack, useRouter } from "expo-router";
import { FlatList, StyleSheet, Text, View } from "react-native";

import { Button, HeaderButton } from "@/ui/components";
import {
  formatReminderTimes,
  formatScheduledDays,
  formatTarget,
} from "@/ui/format";
import { fontSize, radius, spacing, useColors } from "@/ui/theme";
import { useActiveHabits, type ActiveHabit } from "@/ui/use-active-habits";

function HabitRow({ item }: { item: ActiveHabit }) {
  const colors = useColors();
  const details = [
    formatTarget(item.version),
    formatScheduledDays(item.version.scheduledDays),
  ].filter((text) => text !== null);
  const times = item.reminders.map((r) => r.time);

  return (
    <View style={[styles.row, { backgroundColor: colors.surface }]}>
      <Text style={[styles.name, { color: colors.text }]}>
        {item.habit.name}
      </Text>
      <Text style={[styles.details, { color: colors.textSecondary }]}>
        {details.join(" · ")}
      </Text>
      <Text style={[styles.details, { color: colors.textSecondary }]}>
        {times.length > 0
          ? `Recordatorios: ${formatReminderTimes(times)}`
          : "Sin recordatorios"}
      </Text>
    </View>
  );
}

export default function Habits() {
  const colors = useColors();
  const router = useRouter();
  const habits = useActiveHabits();
  const create = () => router.push("/habits/new");

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <HeaderButton
              label="+"
              accessibilityLabel="Nuevo hábito"
              bold
              onPress={create}
            />
          ),
        }}
      />
      {habits !== null && habits.length === 0 ? (
        <View style={styles.empty}>
          <Text style={[styles.message, { color: colors.textSecondary }]}>
            Todavía no tienes hábitos.
          </Text>
          <Button label="Crear hábito" onPress={create} />
        </View>
      ) : (
        <FlatList
          data={habits ?? []}
          keyExtractor={(item) => item.habit.id}
          renderItem={({ item }) => <HabitRow item={item} />}
          contentContainerStyle={styles.list}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm, padding: spacing.md },
  row: { borderRadius: radius.md, gap: spacing.xs, padding: spacing.md },
  name: { fontSize: fontSize.body, fontWeight: "600" },
  details: { fontSize: fontSize.caption },
  empty: { alignItems: "center", gap: spacing.md, padding: spacing.xl },
  message: { fontSize: fontSize.body, textAlign: "center" },
});

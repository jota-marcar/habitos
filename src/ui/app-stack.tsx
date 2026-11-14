// The navigation of the app (ADR-0010): a Stack that opens on the day, the only main screen,
// with the forms as modals over it. Its own file so the tests can use it.

import { Stack } from "expo-router";

import { useColors } from "./theme";

/**
 * The day is always under the other screens, so that the modal is presented as such even when
 * the app opens on it from a link. The layout exports it as `unstable_settings`.
 */
export const STACK_SETTINGS = { anchor: "index" };

export function AppStack() {
  const colors = useColors();
  return (
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: colors.background },
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.primary,
        headerTitleStyle: { color: colors.text },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen
        name="habits/new"
        options={{ title: "Nuevo hábito", presentation: "modal" }}
      />
    </Stack>
  );
}

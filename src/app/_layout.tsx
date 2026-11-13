import { StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { AppStack, STACK_SETTINGS } from "@/ui/app-stack";
import { DatabaseProvider } from "@/ui/database";

export const unstable_settings = STACK_SETTINGS;

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <DatabaseProvider>
        <AppStack />
      </DatabaseProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });

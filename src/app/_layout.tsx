import { AppStack, STACK_SETTINGS } from "@/ui/app-stack";
import { DatabaseProvider } from "@/ui/database";

export const unstable_settings = STACK_SETTINGS;

export default function RootLayout() {
  return (
    <DatabaseProvider>
      <AppStack />
    </DatabaseProvider>
  );
}

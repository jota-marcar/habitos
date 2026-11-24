// The error screen with the real navigation: a layout that fails shows it, and retrying renders
// the layout again.
import { fireEvent, renderRouter, screen } from "expo-router/testing-library";
import { Slot } from "expo-router";
import { Text } from "react-native";

import { ErrorBoundary } from "@/app/_layout";
import { ErrorScreen } from "@/ui/error-screen";

describe("error screen", () => {
  let failing: boolean;

  test("is the one the root layout gives Expo Router", () => {
    expect(ErrorBoundary).toBe(ErrorScreen);
  });

  function Layout() {
    if (failing) throw new Error("The database did not open.");
    return <Slot />;
  }

  beforeEach(() => {
    failing = true;
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  async function renderFailingApp() {
    await renderRouter({
      _layout: { default: Layout, ErrorBoundary: ErrorScreen },
      index: () => <Text>Inicio</Text>,
    });
  }

  test("explains the failure in Spanish instead of the generic screen", async () => {
    await renderFailingApp();

    expect(screen.getByText("Algo ha fallado")).toBeTruthy();
    expect(screen.getByText(/Este error no borra tus datos/)).toBeTruthy();
    expect(screen.queryByText("Inicio")).toBeNull();
  });

  test("retrying opens the app once the failure is over", async () => {
    await renderFailingApp();

    failing = false;
    await fireEvent.press(screen.getByText("Reintentar"));

    expect(await screen.findByText("Inicio")).toBeTruthy();
  });
});

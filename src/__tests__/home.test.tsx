// Tests cannot live in src/app: Expo Router would treat each file as a screen.
import { render, screen } from "@testing-library/react-native";

import Home from "@/app/index";

test("the home screen shows the app name", async () => {
  await render(<Home />);

  expect(screen.getByText("Hábitos")).toBeTruthy();
});

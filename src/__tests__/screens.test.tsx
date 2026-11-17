// Tests of the screens with the real navigation and a real database on the SQLite built into
// Node. Tests cannot live in src/app: Expo Router would treat each file as a screen.
import {
  act,
  fireEvent,
  renderRouter,
  screen,
  waitFor,
  within,
} from "expo-router/testing-library";
import {
  Alert,
  AppState,
  StyleSheet,
  type AlertButton,
  type AppStateStatus,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { createGestureController } from "react-native-gesture-handler/jest-utils";

import Today from "@/app/index";
import EditHabit from "@/app/habits/[id]/edit";
import NewHabit from "@/app/habits/new";
import { listEntries, saveEntry } from "@/data/entries-repository";
import {
  addHabit,
  listHabitVersions,
  listHabits,
} from "@/data/habits-repository";
import { listReminders } from "@/data/reminders-repository";
import { habit, openMigratedDatabase, version } from "@/data/testing/fixtures";
import { notifyReminderRecorded } from "@/notifications/actions";
import type { TestDatabase } from "@/data/testing/node-database";
import { localDate, type Weekday } from "@/domain/dates";
import { scheduledDaysFrom } from "@/domain/schedule";
import { localTime } from "@/domain/times";
import { AppStack, STACK_SETTINGS } from "@/ui/app-stack";
import { DatabaseContext } from "@/ui/database";

// Thursday, 12 November 2026: after the day the fixtures are created (2026-11-01).
const TODAY = localDate("2026-11-12");
let mockToday: string = TODAY;
jest.mock("@/ui/clock", () => ({
  ...jest.requireActual("@/ui/clock"),
  today: () => jest.requireActual("@/domain/dates").localDate(mockToday),
  // 10:00 of the current day, for the reminders.
  now: () => new Date(`${mockToday}T10:00:00`),
}));

let mockIdCounter = 0;
jest.mock("expo-crypto", () => ({
  randomUUID: () => `id-${++mockIdCounter}`,
}));

// The native picker is replaced by a button that picks 08:30.
jest.mock("@react-native-community/datetimepicker", () => {
  const { createElement } = jest.requireActual("react");
  const { Pressable } = jest.requireActual("react-native");
  return function MockDateTimePicker(props: {
    testID: string;
    onValueChange: (event: unknown, date: Date) => void;
  }) {
    return createElement(Pressable, {
      testID: props.testID,
      onPress: () => props.onValueChange({}, new Date(2026, 10, 12, 8, 30)),
    });
  };
});

// The notifications of the device: the permission and what is scheduled, by identifier.
let mockNotificationsAllowed = true;
const mockScheduled = new Map<string, unknown>();
jest.mock("expo-notifications", () => ({
  SchedulableTriggerInputTypes: { DATE: "date" },
  IosAuthorizationStatus: { PROVISIONAL: 3 },
  getPermissionsAsync: async () => ({
    granted: mockNotificationsAllowed,
    canAskAgain: false,
  }),
  requestPermissionsAsync: async () => ({
    granted: mockNotificationsAllowed,
    canAskAgain: false,
  }),
  getAllScheduledNotificationsAsync: async () =>
    [...mockScheduled].map(([identifier, content]) => ({
      identifier,
      content,
    })),
  scheduleNotificationAsync: async (request: {
    identifier: string;
    content: unknown;
  }) => {
    mockScheduled.set(request.identifier, request.content);
  },
  cancelScheduledNotificationAsync: async (identifier: string) => {
    mockScheduled.delete(identifier);
  },
  setNotificationCategoryAsync: async () => undefined,
}));

let db: TestDatabase;

beforeEach(async () => {
  mockToday = TODAY;
  mockNotificationsAllowed = true;
  mockScheduled.clear();
  db = await openMigratedDatabase();
});

afterEach(() => {
  db.close();
  jest.restoreAllMocks();
});

async function renderApp(initialUrl = "/") {
  function Layout() {
    return (
      <GestureHandlerRootView style={StyleSheet.absoluteFill}>
        <DatabaseContext value={db}>
          <AppStack />
        </DatabaseContext>
      </GestureHandlerRootView>
    );
  }
  await renderRouter(
    {
      _layout: { default: Layout, unstable_settings: STACK_SETTINGS },
      index: Today,
      "habits/new": NewHabit,
      "habits/[id]/edit": EditHabit,
    },
    { initialUrl },
  );
}

// Drags a sheet as a finger would: up is a negative translation.
async function drag(testID: string, translationY: number, velocityY = 0) {
  const finger = createGestureController(testID);
  await act(async () => {
    finger.begin();
    finger.activate();
    finger.update({ translationY, velocityY });
    finger.end({ translationY, velocityY });
    // The sheet tells the screen whether it ended open in a microtask, which renderRouter's
    // fake timers hold until they are run.
    jest.runAllTicks();
  });
}

// Jest does not lay views out: a sheet gets the size it would have on a phone. The Reanimated
// mock of expo-router/testing-library creates new shared values on every render, so the size
// must be given again after the sheet renders, right before dragging it.
async function layOut(testID: string) {
  await fireEvent(
    screen.getByTestId(testID, { includeHiddenElements: true }),
    "layout",
    { nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 200 } } },
  );
}

const layOutMenu = () => layOut("menu");

/** Replaces the state of the app, to make it leave and come back. */
function spyOnAppState() {
  const listeners: ((state: AppStateStatus) => void)[] = [];
  jest
    .spyOn(AppState, "addEventListener")
    .mockImplementation((_type, listener) => {
      listeners.push(listener);
      return { remove: () => undefined };
    });
  return async (state: AppStateStatus) => {
    await act(async () => {
      listeners.forEach((listener) => listener(state));
    });
  };
}

async function openMenu() {
  await layOutMenu();
  await drag("menu-strip", -300, -800);
  expect(screen.getByLabelText("Crear")).toBeTruthy();
}

/** The names of the habits of the day, from top to bottom. */
function habitNames() {
  return screen
    .getAllByTestId(/^habit-/)
    .map((row) => row.props.accessibilityLabel as string);
}

/** The names of the habits in the done group, at the bottom of the box (RF-12). */
function doneNames() {
  const group = screen.queryByTestId("day-habits-done");
  if (group === null) return [];
  return within(group)
    .getAllByTestId(/^habit-/)
    .map((row) => row.props.accessibilityLabel as string);
}

async function addBoolean(id: string, name: string, time?: string) {
  await addHabit(
    db,
    habit(id, { name }),
    version(id),
    time ? [{ id: `${id}-r`, habitId: id, time: localTime(time) }] : [],
  );
}

describe("day view", () => {
  test("shows Hoy and invites to create the first habit (RF-30)", async () => {
    await renderApp();

    expect(await screen.findByText("Todavía no tienes hábitos.")).toBeTruthy();
    expect(screen.getByText("Hoy")).toBeTruthy();
  });

  test("lists the habits of the day with the progress of the quantitative ones (RF-13)", async () => {
    await addBoolean("walk", "Pasear");
    await addHabit(
      db,
      habit("water", { name: "Beber agua", type: "quantitative" }),
      version("water", { target: 2, unit: "L", increment: 0.25 }),
    );
    await addHabit(
      db,
      habit("sunday", { name: "Solo domingos" }),
      version("sunday", { scheduledDays: scheduledDaysFrom([6]) }),
    );

    await renderApp();

    expect(await screen.findByText("Pasear")).toBeTruthy();
    expect(screen.getByText("Beber agua")).toBeTruthy();
    expect(screen.getByText("0 / 2 L")).toBeTruthy();
    expect(screen.queryByText("Solo domingos")).toBeNull();
  });

  test("shows a dot with the color of each habit, empty for those without one (RF-13)", async () => {
    await addHabit(
      db,
      habit("read", { name: "Leer", color: "teal" }),
      version("read"),
    );
    await addBoolean("walk", "Pasear");
    await renderApp();
    await screen.findByText("Leer");

    expect(screen.getByTestId("color-dot-read")).toHaveStyle({
      backgroundColor: "#2DD4BF",
    });
    expect(screen.getByTestId("color-dot-walk")).toHaveStyle({
      borderWidth: 1,
    });
    // The dots are not rows of the list.
    expect(habitNames()).toEqual(["Leer", "Pasear"]);
  });

  test("a day with no colored habit has no dots (RF-13)", async () => {
    await addBoolean("walk", "Pasear");
    await renderApp();
    await screen.findByText("Pasear");

    expect(screen.queryByTestId(/^color-dot-/)).toBeNull();
  });

  test("says when no habit is due today", async () => {
    await addHabit(
      db,
      habit("sunday", { name: "Solo domingos" }),
      version("sunday", { scheduledDays: scheduledDaysFrom([6]) }),
    );

    await renderApp();

    expect(await screen.findByText("Hoy no toca ningún hábito.")).toBeTruthy();
  });

  test("marks and unmarks a boolean habit, dimmed when done (RF-13, RF-14)", async () => {
    await addBoolean("walk", "Pasear");
    await renderApp();
    const row = await screen.findByTestId("habit-walk");
    expect(row).not.toBeChecked();
    expect(row).not.toHaveStyle({ opacity: 0.4 });

    await fireEvent.press(row);

    expect(await screen.findByRole("checkbox", { checked: true })).toBeTruthy();
    expect(screen.getByTestId("habit-walk")).toHaveStyle({ opacity: 0.4 });
    expect(await listEntries(db, TODAY, TODAY)).toEqual([
      expect.objectContaining({ habitId: "walk", value: 1 }),
    ]);

    await fireEvent.press(screen.getByTestId("habit-walk"));

    expect(
      await screen.findByRole("checkbox", { checked: false }),
    ).toBeTruthy();
    expect(screen.getByTestId("habit-walk")).not.toHaveStyle({ opacity: 0.4 });
    expect(await listEntries(db, TODAY, TODAY)).toEqual([
      expect.objectContaining({ habitId: "walk", value: 0 }),
    ]);
  });

  test("adds the increment to a quantitative habit until it is done (RF-15, RF-16)", async () => {
    await addHabit(
      db,
      habit("water", { name: "Beber agua", type: "quantitative" }),
      version("water", { target: 0.5, unit: "L", increment: 0.25 }),
    );
    await renderApp();

    await fireEvent.press(await screen.findByTestId("habit-water"));
    expect(await screen.findByText("0,25 / 0,5 L")).toBeTruthy();
    expect(screen.getByTestId("habit-water")).not.toHaveStyle({
      opacity: 0.4,
    });

    await fireEvent.press(screen.getByTestId("habit-water"));
    expect(await screen.findByText("0,5 / 0,5 L")).toBeTruthy();
    expect(screen.getByTestId("habit-water")).toHaveStyle({ opacity: 0.4 });

    await fireEvent.press(screen.getByTestId("habit-water"));
    expect(await screen.findByText("0,75 / 0,5 L")).toBeTruthy();
  });

  test("keeps the order while the day is on screen and sorts it when coming back (RF-12)", async () => {
    const appBecomes = spyOnAppState();
    await addBoolean("read", "Leer", "22:00");
    await addBoolean("walk", "Pasear", "08:00");
    await addBoolean("none", "Sin hora");
    await renderApp();
    await screen.findByText("Pasear");
    expect(habitNames()).toEqual(["Pasear", "Leer", "Sin hora"]);

    await fireEvent.press(screen.getByTestId("habit-walk"));

    expect(await screen.findByRole("checkbox", { checked: true })).toBeTruthy();
    expect(habitNames()).toEqual(["Pasear", "Leer", "Sin hora"]);
    // It stays in the pending group until the day is shown again.
    expect(doneNames()).toEqual([]);

    // Opening the Control Center is not leaving the app.
    await appBecomes("inactive");
    await appBecomes("active");
    expect(habitNames()).toEqual(["Pasear", "Leer", "Sin hora"]);

    await appBecomes("background");
    await appBecomes("active");
    expect(habitNames()).toEqual(["Leer", "Sin hora", "Pasear"]);
    expect(doneNames()).toEqual(["Pasear"]);
  });

  test("today puts the overdue habits first, then the others by their next reminder (RF-12)", async () => {
    // The clock of the tests says 10:00.
    await addHabit(
      db,
      habit("water", { name: "Beber agua" }),
      version("water"),
      [
        { id: "water-r1", habitId: "water", time: localTime("08:00") },
        { id: "water-r2", habitId: "water", time: localTime("12:00") },
      ],
    );
    await addBoolean("read", "Leer", "11:00");
    await addBoolean("meditate", "Meditar", "09:00");
    await addBoolean("none", "Sin hora");
    await renderApp();
    await screen.findByText("Leer");

    expect(habitNames()).toEqual(["Meditar", "Leer", "Beber agua", "Sin hora"]);
  });

  test("a habit undone while the day is on screen stays in the done group (RF-12)", async () => {
    const appBecomes = spyOnAppState();
    await addBoolean("read", "Leer");
    await addBoolean("walk", "Pasear");
    await renderApp();
    await fireEvent.press(await screen.findByTestId("habit-walk"));
    await appBecomes("background");
    await appBecomes("active");
    expect(doneNames()).toEqual(["Pasear"]);

    await fireEvent.press(screen.getByTestId("habit-walk"));

    expect(
      await screen.findByRole("checkbox", { checked: false, name: "Pasear" }),
    ).toBeTruthy();
    expect(doneNames()).toEqual(["Pasear"]);
  });

  test("moves on to the new day at midnight while the app stays open (RF-12)", async () => {
    await addHabit(
      db,
      habit("thursday", { name: "Solo jueves" }),
      version("thursday", { scheduledDays: scheduledDaysFrom([3]) }),
    );
    await addHabit(
      db,
      habit("friday", { name: "Solo viernes" }),
      version("friday", { scheduledDays: scheduledDaysFrom([4]) }),
    );
    await renderApp();
    expect(await screen.findByText("Solo jueves")).toBeTruthy();
    expect(screen.queryByText("Solo viernes")).toBeNull();

    // Midnight comes within a day, whatever the time the test runs at.
    mockToday = "2026-11-13";
    await act(async () => {
      jest.advanceTimersByTime(24 * 60 * 60 * 1000);
    });

    expect(await screen.findByText("Solo viernes")).toBeTruthy();
    expect(screen.queryByText("Solo jueves")).toBeNull();
    expect(screen.getByText("Hoy")).toBeTruthy();
  });
});

describe("menu", () => {
  test("is hidden until it is pulled up from the strip (RF-32)", async () => {
    await renderApp();
    await screen.findByText("Todavía no tienes hábitos.");
    expect(screen.queryByLabelText("Crear")).toBeNull();

    await layOutMenu();
    await drag("menu-strip", -20);
    expect(screen.queryByLabelText("Crear")).toBeNull();

    await openMenu();
    await fireEvent.press(screen.getByLabelText("Crear"));

    expect(screen).toHavePathname("/habits/new");
  });

  test("closes when touching outside", async () => {
    await renderApp();
    await openMenu();

    await fireEvent.press(screen.getByLabelText("Cerrar el menú"));

    expect(screen.queryByLabelText("Crear")).toBeNull();
  });

  test("closes when dragged down", async () => {
    await renderApp();
    await screen.findByText("Todavía no tienes hábitos.");
    await openMenu();

    await layOutMenu();
    await drag("menu-drag", 10, 50);
    expect(screen.getByLabelText("Crear")).toBeTruthy();

    await layOutMenu();
    await drag("menu-drag", 200, 800);
    expect(screen.queryByLabelText("Crear")).toBeNull();
  });
});

describe("new habit", () => {
  async function save() {
    await fireEvent.press(screen.getByLabelText("Guardar"));
  }

  async function openForm() {
    await renderApp();
    await openMenu();
    await fireEvent.press(screen.getByLabelText("Crear"));
  }

  test("creates a boolean habit with a reminder and goes back to the day (RF-06)", async () => {
    await openForm();

    await fireEvent.changeText(screen.getByLabelText("Nombre"), "Meditar");
    await fireEvent.press(screen.getByLabelText("domingo"));
    await fireEvent.press(screen.getByText("Añadir recordatorio"));
    await fireEvent.press(screen.getByTestId("reminder-picker"));
    await fireEvent.press(screen.getByText("Añadir"));
    await save();

    const [saved] = await listHabits(db);
    expect(saved).toMatchObject({ name: "Meditar", type: "boolean" });
    expect(await listHabitVersions(db)).toEqual([
      expect.objectContaining({
        habitId: saved.id,
        scheduledDays: scheduledDaysFrom([0, 1, 2, 3, 4, 5]),
      }),
    ]);
    expect(await listReminders(db)).toEqual([
      expect.objectContaining({ habitId: saved.id, time: "08:30" }),
    ]);
    expect(screen).toHavePathname("/");
    expect(await screen.findByText("Meditar")).toBeTruthy();
  });

  test("gives the habit the color chosen last (RF-06)", async () => {
    await openForm();

    await fireEvent.changeText(screen.getByLabelText("Nombre"), "Meditar");
    expect(screen.getAllByRole("checkbox", { checked: true })).toHaveLength(7);
    await fireEvent.press(screen.getByLabelText("Azul"));
    expect(screen.getByLabelText("Azul")).toBeChecked();
    await fireEvent.press(screen.getByLabelText("Verde"));
    expect(screen.getByLabelText("Azul")).not.toBeChecked();
    expect(screen.getByLabelText("Verde")).toBeChecked();
    await save();

    await waitFor(() => expect(screen).toHavePathname("/"));
    expect(await listHabits(db)).toEqual([
      expect.objectContaining({ name: "Meditar", color: "green" }),
    ]);
    expect(await screen.findByTestId(/^color-dot-/)).toHaveStyle({
      backgroundColor: "#4ADE80",
    });
  });

  test("touching the chosen color leaves the habit without one (RF-06)", async () => {
    await openForm();

    await fireEvent.changeText(screen.getByLabelText("Nombre"), "Meditar");
    await fireEvent.press(screen.getByLabelText("Azul"));
    await fireEvent.press(screen.getByLabelText("Azul"));
    expect(screen.getByLabelText("Azul")).not.toBeChecked();
    await save();

    await waitFor(() => expect(screen).toHavePathname("/"));
    expect(await listHabits(db)).toEqual([
      expect.objectContaining({ name: "Meditar", color: null }),
    ]);
  });

  test("creates a quantitative habit with decimal amounts", async () => {
    await renderApp("/habits/new");

    await fireEvent.changeText(screen.getByLabelText("Nombre"), "Beber agua");
    await fireEvent.press(screen.getByText("Cantidad"));
    await fireEvent.changeText(screen.getByLabelText("Meta"), "2");
    await fireEvent.changeText(screen.getByLabelText("Unidad"), "L");
    await fireEvent.changeText(screen.getByLabelText("Incremento"), "0,25");
    await save();

    expect(await listHabitVersions(db)).toEqual([
      expect.objectContaining({ target: 2, unit: "L", increment: 0.25 }),
    ]);
  });

  test("shows the errors next to their fields and saves nothing", async () => {
    await renderApp("/habits/new");

    await fireEvent.press(screen.getByText("Cantidad"));
    await fireEvent.changeText(
      screen.getByLabelText("Unidad"),
      "litros de agua",
    );
    for (const day of [
      "lunes",
      "martes",
      "miércoles",
      "jueves",
      "viernes",
      "sábado",
      "domingo",
    ]) {
      await fireEvent.press(screen.getByLabelText(day));
    }
    await save();

    expect(screen.getByText("Escribe un nombre.")).toBeTruthy();
    expect(
      screen.getByText("La meta debe ser un número mayor que 0."),
    ).toBeTruthy();
    expect(screen.getByText("Elige al menos un día.")).toBeTruthy();
    expect(await listHabits(db)).toEqual([]);
    expect(screen).toHavePathname("/habits/new");
  });

  test("does not add the same reminder time twice (RF-22)", async () => {
    await renderApp("/habits/new");

    for (let i = 0; i < 2; i++) {
      await fireEvent.press(screen.getByText("Añadir recordatorio"));
      await fireEvent.press(screen.getByTestId("reminder-picker"));
      await fireEvent.press(screen.getByText("Añadir"));
    }

    expect(screen.getByText("Ya hay un recordatorio a esa hora.")).toBeTruthy();
    expect(screen.getAllByText("08:30")).toHaveLength(1);

    await fireEvent.press(screen.getByText("Descartar"));
    expect(screen.queryByText("Ya hay un recordatorio a esa hora.")).toBeNull();
  });

  test("removes a reminder", async () => {
    await renderApp("/habits/new");

    await fireEvent.press(screen.getByText("Añadir recordatorio"));
    await fireEvent.press(screen.getByTestId("reminder-picker"));
    await fireEvent.press(screen.getByText("Añadir"));
    await fireEvent.press(
      screen.getByLabelText("Quitar el recordatorio de las 08:30"),
    );

    expect(screen.queryByText("08:30")).toBeNull();
  });

  test("cancel goes back to the day without saving", async () => {
    await openForm();

    await fireEvent.changeText(screen.getByLabelText("Nombre"), "Meditar");
    await fireEvent.press(screen.getByLabelText("Cancelar"));

    expect(screen).toHavePathname("/");
    expect(await listHabits(db)).toEqual([]);
  });
});

describe("habit options (RF-34)", () => {
  async function addWater() {
    await addHabit(
      db,
      habit("water", { name: "Beber agua", type: "quantitative" }),
      version("water", { target: 2, unit: "L", increment: 0.25 }),
      [{ id: "water-r", habitId: "water", time: localTime("10:00") }],
    );
  }

  /** Holds a habit down, which opens its options. */
  async function hold(id: string) {
    await fireEvent(await screen.findByTestId(`habit-${id}`), "longPress");
  }

  /** Presses a button of the last native alert or prompt, as iOS would. */
  async function pressAlertButton(
    alert: jest.SpyInstance,
    label: string,
    text?: string,
  ) {
    const buttons = alert.mock.lastCall?.[2] as AlertButton[];
    const button = buttons.find((b) => b.text === label);
    await act(async () => {
      await button?.onPress?.(text);
    });
  }

  test("holding a boolean habit down opens its options, which close when touching outside", async () => {
    await addBoolean("walk", "Pasear");
    await renderApp();
    await screen.findByText("Pasear");
    expect(screen.queryByLabelText("Editar")).toBeNull();

    await hold("walk");

    expect(screen.getByLabelText("Editar")).toBeTruthy();
    expect(screen.getByLabelText("Archivar")).toBeTruthy();
    expect(screen.getByLabelText("Eliminar")).toBeTruthy();
    expect(screen.queryByLabelText(/^Restar/)).toBeNull();
    expect(screen.queryByLabelText("Escribir la cantidad")).toBeNull();
    // Holding it down does not mark it.
    expect(screen.getByTestId("habit-walk")).not.toBeChecked();

    await fireEvent.press(screen.getByLabelText("Cerrar las opciones"));

    expect(screen.queryByLabelText("Editar")).toBeNull();
  });

  test("subtracts the increment, never below 0, and stays open (RF-15)", async () => {
    await addWater();
    await renderApp();
    await fireEvent.press(await screen.findByTestId("habit-water"));
    await fireEvent.press(screen.getByTestId("habit-water"));
    await screen.findByText("0,5 / 2 L");

    await hold("water");
    await fireEvent.press(screen.getByLabelText("Restar 0,25 L"));

    // In the row and in the title of the options.
    expect(await screen.findAllByText("0,25 / 2 L")).toHaveLength(2);

    await fireEvent.press(screen.getByLabelText("Restar 0,25 L"));
    await fireEvent.press(screen.getByLabelText("Restar 0,25 L"));

    expect(await screen.findAllByText("0 / 2 L")).toHaveLength(2);
    expect(await listEntries(db, TODAY, TODAY)).toEqual([
      expect.objectContaining({ habitId: "water", value: 0 }),
    ]);
  });

  test("writes the exact amount in the native prompt, which rejects what is not an amount (RF-15)", async () => {
    const prompt = jest.spyOn(Alert, "prompt").mockImplementation(() => {});
    await addWater();
    await renderApp();
    await fireEvent.press(await screen.findByTestId("habit-water"));
    await screen.findByText("0,25 / 2 L");

    await hold("water");
    await fireEvent.press(screen.getByLabelText("Escribir la cantidad"));

    expect(screen.queryByLabelText("Escribir la cantidad")).toBeNull();
    expect(prompt).toHaveBeenLastCalledWith(
      "Beber agua",
      "Cantidad en L",
      expect.any(Array),
      "plain-text",
      "0,25",
      "decimal-pad",
    );

    await pressAlertButton(prompt, "Guardar", "1,234");
    expect(prompt).toHaveBeenLastCalledWith(
      "Beber agua",
      "La cantidad admite 2 decimales como máximo.",
      expect.any(Array),
      "plain-text",
      "1,234",
      "decimal-pad",
    );

    await pressAlertButton(prompt, "Guardar", "");
    expect(prompt.mock.lastCall?.[1]).toBe("Escribe un número.");

    await pressAlertButton(prompt, "Guardar", "1,5");
    expect(prompt).toHaveBeenCalledTimes(3);
    expect(await screen.findByText("1,5 / 2 L")).toBeTruthy();
    expect(await listEntries(db, TODAY, TODAY)).toEqual([
      expect.objectContaining({ habitId: "water", value: 1.5 }),
    ]);
  });

  test("archives a habit after confirming: it leaves the day if nothing was recorded (RF-10)", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    await addBoolean("walk", "Pasear");
    await addBoolean("read", "Leer");
    await renderApp();

    await hold("walk");
    await fireEvent.press(screen.getByLabelText("Archivar"));

    expect(screen.queryByLabelText("Archivar")).toBeNull();
    expect(alert).toHaveBeenCalledWith(
      "¿Archivar «Pasear»?",
      expect.stringContaining("No se puede deshacer"),
      expect.any(Array),
    );

    await pressAlertButton(alert, "Cancelar");
    expect(habitNames()).toEqual(["Pasear", "Leer"]);

    await pressAlertButton(alert, "Archivar");

    await waitFor(() => expect(habitNames()).toEqual(["Leer"]));
    expect(await listHabits(db)).toEqual([
      expect.objectContaining({ id: "walk", archivedOn: TODAY }),
      expect.objectContaining({ id: "read", archivedOn: null }),
    ]);
  });

  test("an archived habit stays on the day it has something recorded, only to be corrected or deleted (RF-10)", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    await addWater();
    await renderApp();
    await fireEvent.press(await screen.findByTestId("habit-water"));
    await screen.findByText("0,25 / 2 L");

    await hold("water");
    await fireEvent.press(screen.getByLabelText("Archivar"));
    await pressAlertButton(alert, "Archivar");
    expect(await listHabits(db)).toEqual([
      expect.objectContaining({ archivedOn: TODAY }),
    ]);

    expect(screen.getByText("Beber agua")).toBeTruthy();

    await hold("water");

    expect(screen.getByLabelText("Restar 0,25 L")).toBeTruthy();
    expect(screen.getByLabelText("Escribir la cantidad")).toBeTruthy();
    expect(screen.getByLabelText("Eliminar")).toBeTruthy();
    expect(screen.queryByLabelText("Editar")).toBeNull();
    expect(screen.queryByLabelText("Archivar")).toBeNull();
  });

  test("deletes a habit with its history after confirming (RF-11)", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    await addBoolean("walk", "Pasear", "08:00");
    await renderApp();
    await fireEvent.press(await screen.findByTestId("habit-walk"));
    await screen.findByRole("checkbox", { checked: true });

    await hold("walk");
    await fireEvent.press(screen.getByLabelText("Eliminar"));

    expect(alert).toHaveBeenCalledWith(
      "¿Eliminar «Pasear»?",
      expect.stringContaining("No se puede deshacer"),
      expect.any(Array),
    );

    await pressAlertButton(alert, "Eliminar");

    expect(await screen.findByText("Todavía no tienes hábitos.")).toBeTruthy();
    expect(await listHabits(db)).toEqual([]);
    expect(await listEntries(db, TODAY, TODAY)).toEqual([]);
    expect(await listReminders(db)).toEqual([]);
  });
});

describe("edit habit (RF-08)", () => {
  async function addWater() {
    await addHabit(
      db,
      habit("water", { name: "Beber agua", type: "quantitative" }),
      version("water", { target: 2, unit: "L", increment: 0.25 }),
      [
        { id: "water-r1", habitId: "water", time: localTime("10:00") },
        { id: "water-r2", habitId: "water", time: localTime("18:00") },
      ],
    );
  }

  test("opens from the options with the habit as it is, without its type", async () => {
    await addWater();
    await renderApp();

    await fireEvent(await screen.findByTestId("habit-water"), "longPress");
    await fireEvent.press(screen.getByLabelText("Editar"));

    expect(screen).toHavePathname("/habits/water/edit");
    expect(await screen.findByDisplayValue("Beber agua")).toBeTruthy();
    expect(screen.getByLabelText("Meta")).toHaveDisplayValue("2");
    expect(screen.getByLabelText("Unidad")).toHaveDisplayValue("L");
    expect(screen.getByLabelText("Incremento")).toHaveDisplayValue("0,25");
    expect(screen.getByLabelText("domingo")).toBeChecked();
    expect(screen.getByText("10:00")).toBeTruthy();
    expect(screen.getByText("18:00")).toBeTruthy();
    expect(screen.queryByText("Sí o no")).toBeNull();
  });

  test("saves the changes from today onwards and goes back to the day (RF-09)", async () => {
    await addWater();
    await renderApp("/habits/water/edit");
    await screen.findByDisplayValue("Beber agua");

    await fireEvent.changeText(screen.getByLabelText("Nombre"), "Agua");
    await fireEvent.changeText(screen.getByLabelText("Meta"), "1,5");
    await fireEvent.press(screen.getByLabelText("domingo"));
    await fireEvent.press(
      screen.getByLabelText("Quitar el recordatorio de las 10:00"),
    );
    await fireEvent.press(screen.getByText("Añadir recordatorio"));
    await fireEvent.press(screen.getByTestId("reminder-picker"));
    await fireEvent.press(screen.getByText("Añadir"));
    await fireEvent.press(screen.getByLabelText("Guardar"));

    await waitFor(() => expect(screen).toHavePathname("/"));
    expect(await screen.findByText("Agua")).toBeTruthy();
    expect(screen.getByText("0 / 1,5 L")).toBeTruthy();
    expect(await listHabits(db)).toEqual([
      expect.objectContaining({ id: "water", name: "Agua" }),
    ]);
    // The days before today keep the configuration they had.
    expect(await listHabitVersions(db)).toEqual([
      version("water", { target: 2, unit: "L", increment: 0.25 }),
      expect.objectContaining({
        habitId: "water",
        effectiveFrom: TODAY,
        target: 1.5,
        unit: "L",
        increment: 0.25,
        scheduledDays: scheduledDaysFrom([0, 1, 2, 3, 4, 5]),
      }),
    ]);
    expect(await listReminders(db)).toEqual([
      expect.objectContaining({ habitId: "water", time: "08:30" }),
      { id: "water-r2", habitId: "water", time: "18:00" },
    ]);
  });

  test("opens with the color of the habit and changes it without a new version (RF-08)", async () => {
    await addHabit(
      db,
      habit("walk", { name: "Pasear", color: "teal" }),
      version("walk"),
    );
    await renderApp("/habits/walk/edit");
    await screen.findByDisplayValue("Pasear");
    expect(screen.getByLabelText("Turquesa")).toBeChecked();

    await fireEvent.press(screen.getByLabelText("Rosa"));
    await fireEvent.press(screen.getByLabelText("Guardar"));

    await waitFor(() => expect(screen).toHavePathname("/"));
    expect(await listHabits(db)).toEqual([
      expect.objectContaining({ id: "walk", color: "pink" }),
    ]);
    expect(await listHabitVersions(db)).toEqual([version("walk")]);
  });

  test("a boolean habit has no amounts to edit", async () => {
    await addBoolean("walk", "Pasear");
    await renderApp("/habits/walk/edit");

    expect(await screen.findByDisplayValue("Pasear")).toBeTruthy();
    expect(screen.queryByLabelText("Meta")).toBeNull();
    expect(screen.queryByText("Sí o no")).toBeNull();
  });

  test("shows the errors and saves nothing", async () => {
    await addWater();
    await renderApp("/habits/water/edit");
    await screen.findByDisplayValue("Beber agua");

    await fireEvent.changeText(screen.getByLabelText("Nombre"), " ");
    await fireEvent.changeText(screen.getByLabelText("Meta"), "0");
    await fireEvent.press(screen.getByLabelText("Guardar"));

    expect(await screen.findByText("Escribe un nombre.")).toBeTruthy();
    expect(
      screen.getByText("La meta debe ser un número mayor que 0."),
    ).toBeTruthy();
    expect(screen).toHavePathname("/habits/water/edit");
    expect(await listHabits(db)).toEqual([
      expect.objectContaining({ name: "Beber agua" }),
    ]);
  });

  test.each([
    ["archived", "walk"],
    ["missing", "nothing"],
  ])("goes back to the day if the habit is %s (RF-10)", async (_case, id) => {
    await addHabit(
      db,
      habit("walk", { name: "Pasear", archivedOn: TODAY }),
      version("walk"),
    );

    await renderApp(`/habits/${id}/edit`);

    await waitFor(() => expect(screen).toHavePathname("/"));
  });
});

describe("reminders (RF-22 to RF-24, RF-36)", () => {
  const scheduledIds = () => [...mockScheduled.keys()];

  async function createWithReminder() {
    await renderApp("/habits/new");
    await fireEvent.changeText(screen.getByLabelText("Nombre"), "Meditar");
    await fireEvent.press(screen.getByText("Añadir recordatorio"));
    await fireEvent.press(screen.getByTestId("reminder-picker"));
    await fireEvent.press(screen.getByText("Añadir"));
    await fireEvent.press(screen.getByLabelText("Guardar"));
  }

  test("saving a habit with a reminder schedules it from its next time on", async () => {
    // The picker gives 08:30, and it is 10:00: today's has passed.
    await createWithReminder();

    await waitFor(() => expect(scheduledIds()).toHaveLength(60));
    expect(scheduledIds()[0]).toMatch(/^reminder\..*\.2026-11-13$/);
    expect(screen).toHavePathname("/");
  });

  test("warns when reminders are not allowed, and saves the habit anyway (RF-36)", async () => {
    mockNotificationsAllowed = false;
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});

    await createWithReminder();

    await waitFor(() =>
      expect(alert).toHaveBeenCalledWith(
        "Recordatorios desactivados",
        expect.any(String),
        expect.arrayContaining([
          expect.objectContaining({ text: "Abrir Ajustes" }),
        ]),
      ),
    );
    expect(await listHabits(db)).toHaveLength(1);
    expect(screen).toHavePathname("/");
  });

  test("does not warn about a habit without reminders", async () => {
    mockNotificationsAllowed = false;
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    await renderApp("/habits/new");

    await fireEvent.changeText(screen.getByLabelText("Nombre"), "Leer");
    await fireEvent.press(screen.getByLabelText("Guardar"));

    await waitFor(() => expect(screen).toHavePathname("/"));
    expect(alert).not.toHaveBeenCalled();
  });

  test("shows at once what a button of a reminder records (RF-25)", async () => {
    await addBoolean("walk", "Pasear", "21:00");
    await renderApp();
    expect(await screen.findByTestId("habit-walk")).not.toBeChecked();

    await saveEntry(db, { id: "e1", habitId: "walk", date: TODAY, value: 1 });
    await act(async () => notifyReminderRecorded());

    expect(await screen.findByRole("checkbox", { checked: true })).toBeTruthy();
  });

  test("marking a habit done cancels its reminder of today (RF-24)", async () => {
    await addBoolean("walk", "Pasear", "21:00");
    await renderApp();

    await fireEvent.press(await screen.findByTestId("habit-walk"));
    await waitFor(() => expect(scheduledIds()).toHaveLength(60));

    expect(scheduledIds()).not.toContain("reminder.walk-r.2026-11-12");
    expect(scheduledIds()).toContain("reminder.walk-r.2026-11-13");
  });
});

describe("calendar (RF-18, RF-31)", () => {
  async function addWater() {
    await addHabit(
      db,
      habit("water", { name: "Beber agua", type: "quantitative" }),
      version("water", { target: 2, unit: "L", increment: 0.25 }),
    );
  }

  async function addOnWeekday(id: string, name: string, weekday: Weekday) {
    await addHabit(
      db,
      habit(id, { name }),
      version(id, { scheduledDays: scheduledDaysFrom([weekday]) }),
    );
  }

  /** Pulls the calendar down from the date. Down is a positive translation. */
  async function openCalendar() {
    await layOut("calendar");
    await drag("day-date", 300, 800);
    expect(screen.getByLabelText("Cerrar el calendario")).toBeTruthy();
  }

  async function chooseDay(label: string) {
    await openCalendar();
    await fireEvent.press(screen.getByLabelText(label));
  }

  /** Drags the months of the calendar sideways: to the left is a negative translation. */
  async function swipeMonths(translationX: number, velocityX = 0) {
    const finger = createGestureController("calendar-months");
    await act(async () => {
      finger.begin();
      finger.activate();
      finger.update({ translationX, velocityX });
      finger.end({ translationX, velocityX });
      jest.runAllTicks();
    });
  }

  test("is hidden until it is pulled down from the date, and opens in the month of today", async () => {
    await renderApp();
    await screen.findByText("Todavía no tienes hábitos.");
    expect(screen.queryByText("Noviembre 2026")).toBeNull();

    await layOut("calendar");
    await drag("day-date", 20);
    expect(screen.queryByText("Noviembre 2026")).toBeNull();

    await openCalendar();

    expect(screen.getByText("Noviembre 2026")).toBeTruthy();
    expect(screen.getByText("X")).toBeTruthy();
    // The current day is told apart and, as it is the one on screen, selected.
    expect(
      screen.getByLabelText("Hoy, 12 de noviembre de 2026"),
    ).toBeSelected();
    expect(screen.getByLabelText("11 de noviembre de 2026")).not.toBeSelected();
    expect(screen.queryByLabelText("31 de noviembre de 2026")).toBeNull();
  });

  test("choosing a past day closes it and shows that day, which can be recorded (RF-19)", async () => {
    await addOnWeekday("tuesday", "Solo martes", 1);
    await addOnWeekday("thursday", "Solo jueves", 3);
    await renderApp();
    await screen.findByText("Solo jueves");

    await chooseDay("10 de noviembre de 2026");

    expect(screen.queryByText("Noviembre 2026")).toBeNull();
    expect(screen.getByText("Martes, 10 nov")).toBeTruthy();
    expect(await screen.findByText("Solo martes")).toBeTruthy();
    expect(screen.queryByText("Solo jueves")).toBeNull();

    await fireEvent.press(screen.getByTestId("habit-tuesday"));

    expect(await screen.findByRole("checkbox", { checked: true })).toBeTruthy();
    expect(
      await listEntries(db, localDate("2026-11-01"), localDate("2026-11-30")),
    ).toEqual([
      expect.objectContaining({
        habitId: "tuesday",
        date: "2026-11-10",
        value: 1,
      }),
    ]);

    // The calendar now tells both days apart.
    await openCalendar();
    expect(screen.getByLabelText("10 de noviembre de 2026")).toBeSelected();
    expect(
      screen.getByLabelText("Hoy, 12 de noviembre de 2026"),
    ).not.toBeSelected();
  });

  test("a future day can be seen but not recorded (RF-20)", async () => {
    await addWater();
    await renderApp();
    await screen.findByText("Beber agua");

    await chooseDay("13 de noviembre de 2026");

    expect(screen.getByText("Viernes, 13 nov")).toBeTruthy();

    await fireEvent.press(await screen.findByTestId("habit-water"));
    await fireEvent(screen.getByTestId("habit-water"), "longPress");

    // In the row and in the title of the options: nothing was added.
    expect(await screen.findAllByText("0 / 2 L")).toHaveLength(2);
    expect(screen.queryByLabelText("Restar 0,25 L")).toBeNull();
    expect(screen.queryByLabelText("Escribir la cantidad")).toBeNull();
    expect(screen.getByLabelText("Editar")).toBeTruthy();
    expect(screen.getByLabelText("Archivar")).toBeTruthy();
    expect(screen.getByLabelText("Eliminar")).toBeTruthy();
    expect(
      await listEntries(db, localDate("2026-11-01"), localDate("2026-11-30")),
    ).toEqual([]);
  });

  test("says when no habit is due on another day", async () => {
    await addOnWeekday("thursday", "Solo jueves", 3);
    await renderApp();
    await screen.findByText("Solo jueves");

    await chooseDay("13 de noviembre de 2026");

    expect(
      await screen.findByText("Este día no toca ningún hábito."),
    ).toBeTruthy();
  });

  test("touching the date of another day goes back to today (RF-21)", async () => {
    await addOnWeekday("thursday", "Solo jueves", 3);
    await renderApp();
    await chooseDay("10 de noviembre de 2026");
    await waitFor(() => expect(screen.queryByText("Solo jueves")).toBeNull());

    await fireEvent.press(screen.getByText("Martes, 10 nov"));

    expect(screen.getByText("Hoy")).toBeTruthy();
    expect(await screen.findByText("Solo jueves")).toBeTruthy();
  });

  test("dragging it sideways changes the month (RF-18)", async () => {
    await renderApp();
    await openCalendar();

    await swipeMonths(-200);
    expect(screen.getByText("Diciembre 2026")).toBeTruthy();

    await swipeMonths(-5, -800);
    expect(screen.getByText("Enero 2027")).toBeTruthy();

    // A drag that does not go on stays in the month.
    await layOut("calendar-months-box");
    await swipeMonths(30);
    expect(screen.getByText("Enero 2027")).toBeTruthy();

    await swipeMonths(200);
    await swipeMonths(200);
    await swipeMonths(200);
    expect(screen.getByText("Octubre 2026")).toBeTruthy();

    await fireEvent.press(screen.getByLabelText("25 de octubre de 2026"));

    expect(screen.getByText("Domingo, 25 oct")).toBeTruthy();

    // It opens again in the month of the day on screen.
    await openCalendar();
    expect(screen.getByText("Octubre 2026")).toBeTruthy();
  });

  test("closed without choosing a day, it goes back to the month of the day on screen", async () => {
    await renderApp();
    await openCalendar();
    await swipeMonths(-200);
    expect(screen.getByText("Diciembre 2026")).toBeTruthy();

    await fireEvent.press(screen.getByLabelText("Cerrar el calendario"));

    expect(screen.queryByLabelText("Cerrar el calendario")).toBeNull();
    expect(screen.getByText("Hoy")).toBeTruthy();

    await openCalendar();
    expect(screen.getByText("Noviembre 2026")).toBeTruthy();
  });

  test("closes when dragged up", async () => {
    await renderApp();
    await openCalendar();

    await layOut("calendar");
    await drag("calendar-drag", -10, -50);
    expect(screen.getByText("Noviembre 2026")).toBeTruthy();

    await layOut("calendar");
    await drag("calendar-drag", -200, -800);
    expect(screen.queryByText("Noviembre 2026")).toBeNull();
  });

  test("is pulled down from the list only when it is scrolled to the top (RF-31)", async () => {
    await addBoolean("walk", "Pasear");
    await renderApp();
    await screen.findByText("Pasear");
    const scrollTo = (y: number) =>
      fireEvent.scroll(screen.getByTestId("day-habits"), {
        nativeEvent: {
          contentOffset: { x: 0, y },
          contentSize: { width: 390, height: 2000 },
          layoutMeasurement: { width: 390, height: 600 },
        },
      });

    await layOut("calendar");
    await scrollTo(120);
    await drag("day-list", 300, 800);
    expect(screen.queryByText("Noviembre 2026")).toBeNull();

    await layOut("calendar");
    await scrollTo(0);
    await drag("day-list", 300, 800);
    expect(screen.getByText("Noviembre 2026")).toBeTruthy();
  });

  test("is pulled down from an empty day too", async () => {
    await renderApp();
    await screen.findByText("Todavía no tienes hábitos.");

    await layOut("calendar");
    await drag("day-list", 300, 800);

    expect(screen.getByText("Noviembre 2026")).toBeTruthy();
  });

  test("the form says the changes apply from today when it is opened from another day, and going back keeps the day (RF-09)", async () => {
    await addWater();
    await renderApp();
    await chooseDay("10 de noviembre de 2026");

    await fireEvent(await screen.findByTestId("habit-water"), "longPress");
    await fireEvent.press(screen.getByLabelText("Editar"));

    expect(screen).toHavePathname("/habits/water/edit");
    expect(
      await screen.findByText("Los cambios se aplican desde hoy"),
    ).toBeTruthy();

    await fireEvent.press(screen.getByLabelText("Cancelar"));

    await waitFor(() => expect(screen).toHavePathname("/"));
    expect(screen.getByText("Martes, 10 nov")).toBeTruthy();
  });

  test("the form opened from today does not say when the changes apply", async () => {
    await addWater();
    await renderApp();

    await fireEvent(await screen.findByTestId("habit-water"), "longPress");
    await fireEvent.press(screen.getByLabelText("Editar"));

    expect(await screen.findByDisplayValue("Beber agua")).toBeTruthy();
    expect(screen.queryByText("Los cambios se aplican desde hoy")).toBeNull();
  });

  test("coming back to the app shows today again (RF-12)", async () => {
    const appBecomes = spyOnAppState();
    await addOnWeekday("thursday", "Solo jueves", 3);
    await renderApp();
    await chooseDay("10 de noviembre de 2026");
    expect(screen.getByText("Martes, 10 nov")).toBeTruthy();

    // Opening the Control Center is not leaving the app.
    await appBecomes("inactive");
    await appBecomes("active");
    expect(screen.getByText("Martes, 10 nov")).toBeTruthy();

    await appBecomes("background");
    await appBecomes("active");

    expect(screen.getByText("Hoy")).toBeTruthy();
    expect(await screen.findByText("Solo jueves")).toBeTruthy();
  });

  test("midnight leaves another day on screen, which may become today (RF-12)", async () => {
    await renderApp();
    await chooseDay("13 de noviembre de 2026");
    expect(screen.getByText("Viernes, 13 nov")).toBeTruthy();

    mockToday = "2026-11-13";
    await act(async () => {
      jest.advanceTimersByTime(24 * 60 * 60 * 1000);
    });

    // The day on screen has become the current one.
    expect(screen.getByText("Hoy")).toBeTruthy();

    await chooseDay("10 de noviembre de 2026");
    mockToday = "2026-11-14";
    await act(async () => {
      jest.advanceTimersByTime(24 * 60 * 60 * 1000);
    });

    expect(screen.getByText("Martes, 10 nov")).toBeTruthy();
  });
});

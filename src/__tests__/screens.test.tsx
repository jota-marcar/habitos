// Tests of the screens with the real navigation and a real database on the SQLite built into
// Node. Tests cannot live in src/app: Expo Router would treat each file as a screen.
import { fireEvent, renderRouter, screen } from "expo-router/testing-library";

import Today from "@/app/index";
import Habits from "@/app/habits/index";
import NewHabit from "@/app/habits/new";
import {
  addHabit,
  listHabitVersions,
  listHabits,
} from "@/data/habits-repository";
import { listReminders } from "@/data/reminders-repository";
import { habit, openMigratedDatabase, version } from "@/data/testing/fixtures";
import type { TestDatabase } from "@/data/testing/node-database";
import { scheduledDaysFrom } from "@/domain/schedule";
import { localTime } from "@/domain/times";
import { AppStack, STACK_SETTINGS } from "@/ui/app-stack";
import { DatabaseContext } from "@/ui/database";

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

let db: TestDatabase;

beforeEach(async () => {
  db = await openMigratedDatabase();
});

afterEach(() => {
  db.close();
});

async function renderApp(initialUrl = "/") {
  function Layout() {
    return (
      <DatabaseContext value={db}>
        <AppStack />
      </DatabaseContext>
    );
  }
  await renderRouter(
    {
      _layout: { default: Layout, unstable_settings: STACK_SETTINGS },
      index: Today,
      "habits/index": Habits,
      "habits/new": NewHabit,
    },
    { initialUrl },
  );
}

describe("today", () => {
  test("invites to create the first habit", async () => {
    await renderApp();

    expect(await screen.findByText("Todavía no tienes hábitos.")).toBeTruthy();
    await fireEvent.press(screen.getByText("Crear hábito"));

    expect(screen).toHavePathname("/habits/new");
  });

  test("leads to the list of habits and to a new habit from the header", async () => {
    await renderApp();

    await fireEvent.press(screen.getByLabelText("Hábitos"));
    expect(screen).toHavePathname("/habits");

    await fireEvent.press(screen.getByLabelText("Nuevo hábito"));
    expect(screen).toHavePathname("/habits/new");
  });
});

describe("habits", () => {
  test("lists the active habits in the order of their first reminder (RF-07)", async () => {
    await addHabit(db, habit("walk", { name: "Pasear" }), version("walk"));
    await addHabit(
      db,
      habit("water", { name: "Beber agua", type: "quantitative" }),
      version("water", {
        scheduledDays: scheduledDaysFrom([0, 2, 4]),
        target: 2,
        unit: "L",
        increment: 0.25,
      }),
      [{ id: "r1", habitId: "water", time: localTime("09:00") }],
    );
    await addHabit(
      db,
      habit("old", { name: "Archivado", archivedOn: habit("old").createdOn }),
      version("old"),
    );

    await renderApp("/habits");

    const names = await screen.findAllByText(/^(Pasear|Beber agua)$/);
    expect(names.map((n) => n.props.children)).toEqual([
      "Beber agua",
      "Pasear",
    ]);
    expect(screen.getByText("Meta 2 L · +0,25 · L, X, V")).toBeTruthy();
    expect(screen.getByText("Recordatorios: 09:00")).toBeTruthy();
    expect(screen.getByText("Todos los días")).toBeTruthy();
    expect(screen.getByText("Sin recordatorios")).toBeTruthy();
    expect(screen.queryByText("Archivado")).toBeNull();
  });

  test("invites to create the first habit", async () => {
    await renderApp("/habits");

    await fireEvent.press(await screen.findByText("Crear hábito"));

    expect(screen).toHavePathname("/habits/new");
  });
});

describe("new habit", () => {
  async function save() {
    await fireEvent.press(screen.getByLabelText("Guardar"));
  }

  test("creates a boolean habit with a reminder and goes back (RF-06)", async () => {
    await renderApp("/habits");
    await fireEvent.press(await screen.findByText("Crear hábito"));

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
    expect(screen).toHavePathname("/habits");
    expect(await screen.findByText("Meditar")).toBeTruthy();
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

  test("cancel goes back without saving", async () => {
    await renderApp("/habits");
    await fireEvent.press(await screen.findByText("Crear hábito"));

    await fireEvent.changeText(screen.getByLabelText("Nombre"), "Meditar");
    await fireEvent.press(screen.getByLabelText("Cancelar"));

    expect(screen).toHavePathname("/habits");
    expect(await listHabits(db)).toEqual([]);
  });
});

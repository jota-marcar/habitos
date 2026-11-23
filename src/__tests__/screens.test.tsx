// Tests of the screens with the real navigation and a real database on the SQLite built into
// Node. Tests cannot live in src/app: Expo Router would treat each file as a screen.
import {
  act,
  fireEvent,
  renderRouter,
  screen,
  waitFor,
} from "expo-router/testing-library";
import {
  Alert,
  AppState,
  Dimensions,
  ScrollView,
  StyleSheet,
  type AlertButton,
  type AppStateStatus,
} from "react-native";
import { FunctionsHttpError, type Session } from "@supabase/supabase-js";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { createGestureController } from "react-native-gesture-handler/jest-utils";

import appJson from "../../app.json";

import Today from "@/app/index";
import EditHabit from "@/app/habits/[id]/edit";
import NewHabit from "@/app/habits/new";
import Settings from "@/app/settings";
import SignIn from "@/app/sign-in";
import EditWeeklyGoal from "@/app/weekly-goals/[id]/edit";
import NewWeeklyGoal from "@/app/weekly-goals/new";
import { listEntries, saveEntry } from "@/data/entries-repository";
import {
  addHabit,
  listHabitVersions,
  listHabits,
} from "@/data/habits-repository";
import { listReminders } from "@/data/reminders-repository";
import {
  habit,
  markSynced,
  openMigratedDatabase,
  version,
  weeklyGoal,
  weeklyGoalVersion,
} from "@/data/testing/fixtures";
import {
  addWeeklyGoal,
  listWeeklyGoalEntries,
  listWeeklyGoalVersions,
  listWeeklyGoals,
} from "@/data/weekly-goals-repository";
import { notifyReminderRecorded } from "@/notifications/actions";
import type { TestDatabase } from "@/data/testing/node-database";
import { localDate, type Weekday } from "@/domain/dates";
import { scheduledDaysFrom } from "@/domain/schedule";
import { localTime } from "@/domain/times";
import type { WeeklyGoal, WeeklyGoalVersion } from "@/domain/weekly-goals";
import { AppStack, STACK_SETTINGS } from "@/ui/app-stack";
import { DatabaseContext } from "@/ui/database";
import { requestHorizon } from "@/shared/horizon-request";
import type { Horizon } from "@/shared/horizon-request";
import { SessionContext } from "@/ui/session";
import { SETTLE_DELAY_MS } from "@/ui/use-day";

// Thursday, 12 November 2026: after the day the fixtures are created (2026-11-01).
const TODAY = localDate("2026-11-12");
let mockToday: string = TODAY;
jest.mock("@/shared/clock", () => ({
  ...jest.requireActual("@/shared/clock"),
  today: () => jest.requireActual("@/domain/dates").localDate(mockToday),
  // 10:00 of the current day, for the reminders.
  now: () => new Date(`${mockToday}T10:00:00`),
}));

let mockIdCounter = 0;
jest.mock("expo-crypto", () => ({
  randomUUID: () => `id-${++mockIdCounter}`,
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  digestStringAsync: async (_: string, value: string) => `sha256(${value})`,
}));

// The Supabase client: signing in and out only reach these two calls, and deleting the account
// the Edge Function.
const mockAuth = {
  signInWithIdToken: jest.fn(),
  signOut: jest.fn(),
};
const mockFunctions = { invoke: jest.fn() };
jest.mock("@/shared/supabase", () => ({
  supabase: () => ({ auth: mockAuth, functions: mockFunctions }),
}));
// The synchronization: the screens only ask for it and listen to what it changes.
const mockSync = {
  syncNow: jest.fn(async (_db: unknown) => {}),
  syncSoon: jest.fn(),
  listeners: new Set<() => void>(),
};
jest.mock("@/sync/app-sync", () => ({
  syncNow: (db: unknown) => mockSync.syncNow(db),
  syncSoon: (db: unknown) => mockSync.syncSoon(db),
  suspendSync: async () => {},
  resumeSync: () => {},
  onSyncedChanges: (listener: () => void) => {
    mockSync.listeners.add(listener);
    return () => mockSync.listeners.delete(listener);
  },
  onSyncFinished: () => () => {},
}));
// What the device remembers about the synchronizations (RF-53).
let mockSyncRecord: {
  lastCopiedAt: number | null;
  failingSince: number | null;
} = { lastCopiedAt: null, failingSince: null };
const mockClearSyncRecord = jest.fn(async () => {});
jest.mock("@/sync/sync-record", () => ({
  readSyncRecord: async () => mockSyncRecord,
  clearSyncRecord: () => mockClearSyncRecord(),
}));
jest.mock("@/shared/config", () => ({
  readAuthConfig: () => ({
    supabaseUrl: "https://project.supabase.co",
    supabaseKey: "sb_publishable_key",
    googleWebClientId: "web.apps.googleusercontent.com",
    googleIosClientId: "ios.apps.googleusercontent.com",
  }),
}));

// The native sign-in buttons are replaced by plain buttons.
const mockAppleSignIn = jest.fn();
jest.mock("expo-apple-authentication", () => {
  const { createElement } = jest.requireActual("react");
  const { Pressable } = jest.requireActual("react-native");
  return {
    AppleAuthenticationButton: (props: object) =>
      createElement(Pressable, props),
    AppleAuthenticationButtonStyle: { WHITE: 0 },
    AppleAuthenticationButtonType: { SIGN_IN: 0 },
    AppleAuthenticationScope: { EMAIL: 1 },
    signInAsync: (options: unknown) => mockAppleSignIn(options),
  };
});

const mockGoogle = {
  configure: jest.fn(),
  signIn: jest.fn(),
  signOut: jest.fn(),
  revokeAccess: jest.fn(),
  hasPreviousSignIn: jest.fn(),
};
jest.mock("@react-native-google-signin/google-signin", () => {
  const { createElement } = jest.requireActual("react");
  const { Pressable } = jest.requireActual("react-native");
  const GoogleSigninButton = (props: object) => createElement(Pressable, props);
  GoogleSigninButton.Size = { Wide: 1 };
  GoogleSigninButton.Color = { Light: "light" };
  return {
    // Read when used: the mock is created after this factory runs.
    get GoogleSignin() {
      return mockGoogle;
    },
    GoogleSigninButton,
    isErrorWithCode: () => false,
    statusCodes: {},
  };
});

function session(
  provider: string,
  email: string,
  providers: string[] = [provider],
): Session {
  return {
    access_token: "access",
    refresh_token: "refresh",
    expires_in: 3600,
    token_type: "bearer",
    user: {
      id: "user-1",
      email,
      app_metadata: { provider, providers },
      user_metadata: {},
      aud: "authenticated",
      created_at: "2026-11-17T10:00:00Z",
    },
  };
}

let mockSession: Session | null = null;

// The native picker is replaced by a button that picks 08:30.
jest.mock("@react-native-community/datetimepicker", () => {
  const { createElement } = jest.requireActual("react");
  const { Pressable } = jest.requireActual("react-native");
  return function MockDateTimePicker(props: {
    testID: string;
    onLayout?: (event: unknown) => void;
    onValueChange: (event: unknown, date: Date) => void;
  }) {
    return createElement(Pressable, {
      testID: props.testID,
      onLayout: props.onLayout,
      onPress: () => props.onValueChange({}, new Date(2026, 10, 12, 8, 30)),
    });
  };
});

// The height of the home indicator, which the tests have none of unless they set it.
let mockBottomInset = 0;
jest.mock("react-native-safe-area-context", () => {
  const actual = jest.requireActual("react-native-safe-area-context");
  return {
    ...actual,
    useSafeAreaInsets: () => ({
      ...actual.useSafeAreaInsets(),
      bottom: mockBottomInset,
    }),
  };
});

// The notifications of the device: the permission and what is scheduled, by identifier.
// The haptics played, in order.
const mockHaptics: string[] = [];
jest.mock("expo-haptics", () => ({
  NotificationFeedbackType: { Success: "success" },
  ImpactFeedbackStyle: { Light: "light" },
  notificationAsync: async (type: string) => {
    mockHaptics.push(`notification:${type}`);
  },
  selectionAsync: async () => {
    mockHaptics.push("selection");
  },
  impactAsync: async (style: string) => {
    mockHaptics.push(`impact:${style}`);
  },
}));

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
  cancelAllScheduledNotificationsAsync: async () => {
    mockScheduled.clear();
  },
  dismissAllNotificationsAsync: async () => undefined,
}));

let db: TestDatabase;

beforeEach(async () => {
  mockToday = TODAY;
  mockNotificationsAllowed = true;
  mockScheduled.clear();
  mockSession = session("apple", "persona@example.com");
  for (const mock of [
    ...Object.values(mockAuth),
    ...Object.values(mockGoogle),
    mockFunctions.invoke,
    mockAppleSignIn,
  ]) {
    mock.mockReset();
  }
  mockAuth.signInWithIdToken.mockResolvedValue({ data: {}, error: null });
  mockAuth.signOut.mockResolvedValue({ error: null });
  mockFunctions.invoke.mockResolvedValue({
    data: { deleted: true },
    error: null,
  });
  mockGoogle.hasPreviousSignIn.mockReturnValue(false);
  mockSync.syncNow.mockReset().mockResolvedValue(undefined);
  mockSync.syncSoon.mockReset();
  mockSyncRecord = { lastCopiedAt: null, failingSince: null };
  mockClearSyncRecord.mockClear();
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
        <SessionContext value={mockSession}>
          <DatabaseContext value={db}>
            <AppStack />
          </DatabaseContext>
        </SessionContext>
      </GestureHandlerRootView>
    );
  }
  await renderRouter(
    {
      _layout: { default: Layout, unstable_settings: STACK_SETTINGS },
      index: Today,
      "habits/new": NewHabit,
      "habits/[id]/edit": EditHabit,
      "weekly-goals/new": NewWeeklyGoal,
      "weekly-goals/[id]/edit": EditWeeklyGoal,
      settings: Settings,
      "sign-in": SignIn,
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

/**
 * The names of the habits in the done group, at the bottom of the box (RF-12): the ones after
 * the gap that separates the groups. Both groups are in the same container, so that a habit
 * slides from one to the other.
 */
function doneNames() {
  const items = screen.getAllByTestId(/^habit-|^day-habits-gap$/);
  const gap = items.findIndex((item) => item.props.testID === "day-habits-gap");
  return items
    .slice(gap + 1)
    .map((row) => row.props.accessibilityLabel as string);
}

/** Lets the pause after the last tap go by, after which the habits move to their group. */
async function waitForTheMove(ms = SETTLE_DELAY_MS) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
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
  test("shows Hoy and explains how to create the first habit and open the calendar (RF-30)", async () => {
    await renderApp();

    expect(await screen.findByText("Todavía no tienes hábitos.")).toBeTruthy();
    expect(
      screen.getByText(
        "Desliza desde abajo para crear uno y desde arriba para abrir el calendario.",
      ),
    ).toBeTruthy();
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

  test("the habits of the list are a touch larger than the body text, and the date larger still", async () => {
    await addHabit(
      db,
      habit("water", { name: "Beber agua", type: "quantitative" }),
      version("water", { target: 2, unit: "L", increment: 0.25 }),
    );
    await renderApp();

    expect(await screen.findByText("Beber agua")).toHaveStyle({ fontSize: 18 });
    expect(screen.getByText("0 / 2 L")).toHaveStyle({ fontSize: 18 });
    expect(screen.getByText("Hoy")).toHaveStyle({ fontSize: 20 });
  });

  test("shows a circle with the color of each habit, filled up to its progress (RF-13)", async () => {
    await addHabit(
      db,
      habit("read", { name: "Leer", color: "teal" }),
      version("read"),
    );
    await addHabit(
      db,
      habit("water", {
        name: "Beber agua",
        type: "quantitative",
        color: "blue",
      }),
      version("water", { target: 2, unit: "L", increment: 0.25 }),
    );
    await addBoolean("walk", "Pasear");
    await saveEntry(db, { id: "e1", habitId: "read", date: TODAY, value: 1 });
    await saveEntry(db, {
      id: "e2",
      habitId: "water",
      date: TODAY,
      value: 0.5,
    });
    await renderApp();
    await screen.findByText("Leer");

    // Done: full.
    expect(screen.getByTestId("color-dot-read")).toHaveStyle({
      borderColor: "#2DD4BF",
    });
    expect(screen.getByTestId("color-dot-read-left")).toHaveStyle({
      transform: [{ rotate: "180deg" }],
    });
    // A quarter of the goal: a quarter of the circle.
    expect(screen.getByTestId("color-dot-water-right")).toHaveStyle({
      transform: [{ rotate: "90deg" }],
    });
    expect(screen.getByTestId("color-dot-water-left")).toHaveStyle({
      transform: [{ rotate: "0deg" }],
    });
    // A habit without a color has no circle, only its room, so that the names line up.
    expect(screen.queryByTestId("color-dot-walk")).toBeNull();
    expect(screen.getByTestId("no-color-walk")).not.toHaveStyle({
      borderWidth: 1.5,
    });
    // The circles are not rows of the list.
    expect(habitNames()).toEqual(["Beber agua", "Pasear", "Leer"]);
  });

  test("a day with no colored habit has no dots (RF-13)", async () => {
    await addBoolean("walk", "Pasear");
    await renderApp();
    await screen.findByText("Pasear");

    expect(screen.queryByTestId(/^color-dot-/)).toBeNull();
    expect(screen.queryByTestId(/^no-color-/)).toBeNull();
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
    expect(screen.getByTestId("fade-walk")).toHaveStyle({ opacity: 1 });

    await fireEvent.press(row);

    expect(await screen.findByRole("checkbox", { checked: true })).toBeTruthy();
    expect(screen.getByTestId("fade-walk")).toHaveStyle({ opacity: 0.4 });
    expect(await listEntries(db, TODAY, TODAY)).toEqual([
      expect.objectContaining({ habitId: "walk", value: 1 }),
    ]);

    await fireEvent.press(screen.getByTestId("habit-walk"));

    expect(
      await screen.findByRole("checkbox", { checked: false }),
    ).toBeTruthy();
    expect(screen.getByTestId("fade-walk")).toHaveStyle({ opacity: 1 });
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
    expect(screen.getByTestId("fade-water")).toHaveStyle({ opacity: 1 });

    await fireEvent.press(screen.getByTestId("habit-water"));
    expect(await screen.findByText("0,5 / 0,5 L")).toBeTruthy();
    expect(screen.getByTestId("fade-water")).toHaveStyle({ opacity: 0.4 });

    await fireEvent.press(screen.getByTestId("habit-water"));
    expect(await screen.findByText("0,75 / 0,5 L")).toBeTruthy();
  });

  test("a tap is felt: a tick for each change and the success of iOS when it is done", async () => {
    await addHabit(
      db,
      habit("water", { name: "Beber agua", type: "quantitative" }),
      version("water", { target: 0.5, unit: "L", increment: 0.25 }),
    );
    await addBoolean("walk", "Pasear");
    await renderApp();
    mockHaptics.length = 0;

    await fireEvent.press(await screen.findByTestId("habit-water"));
    await screen.findByText("0,25 / 0,5 L");
    await fireEvent.press(screen.getByTestId("habit-water"));
    await screen.findByText("0,5 / 0,5 L");
    await fireEvent.press(screen.getByTestId("habit-water"));
    await screen.findByText("0,75 / 0,5 L");
    await fireEvent.press(screen.getByTestId("habit-walk"));
    await screen.findByRole("checkbox", { checked: true });
    await fireEvent.press(screen.getByTestId("habit-walk"));
    await screen.findByRole("checkbox", { checked: false });

    expect(mockHaptics).toEqual([
      "selection",
      "notification:success",
      "selection",
      "notification:success",
      "selection",
    ]);
  });

  test("holding a habit is felt like a context menu of iOS", async () => {
    await addBoolean("walk", "Pasear");
    await renderApp();
    mockHaptics.length = 0;

    await fireEvent(await screen.findByTestId("habit-walk"), "longPress");

    expect(mockHaptics).toEqual(["impact:light"]);
  });

  test("moves a habit that is done to the done group after a pause in the taps (RF-12)", async () => {
    await addBoolean("read", "Leer", "22:00");
    await addBoolean("walk", "Pasear", "08:00");
    await addBoolean("none", "Sin hora");
    await renderApp();
    await screen.findByText("Pasear");
    expect(habitNames()).toEqual(["Pasear", "Leer", "Sin hora"]);

    await fireEvent.press(screen.getByTestId("habit-walk"));

    // It is marked at once, but stays in its place for a moment.
    expect(await screen.findByRole("checkbox", { checked: true })).toBeTruthy();
    expect(habitNames()).toEqual(["Pasear", "Leer", "Sin hora"]);
    expect(doneNames()).toEqual([]);

    await waitForTheMove(SETTLE_DELAY_MS - 1);
    expect(doneNames()).toEqual([]);

    await waitForTheMove(1);
    expect(habitNames()).toEqual(["Leer", "Sin hora", "Pasear"]);
    expect(doneNames()).toEqual(["Pasear"]);
  });

  test("keeps the view of a habit that changes group, so that it can slide (RF-12)", async () => {
    await addBoolean("read", "Leer", "22:00");
    await addBoolean("walk", "Pasear", "08:00");
    await renderApp();
    const row = await screen.findByTestId("habit-walk");

    await fireEvent.press(row);
    await waitForTheMove();
    expect(doneNames()).toEqual(["Pasear"]);
    expect(screen.getByTestId("habit-walk")).toBe(row);

    await fireEvent.press(screen.getByTestId("habit-walk"));
    await waitForTheMove();
    expect(doneNames()).toEqual([]);
    expect(screen.getByTestId("habit-walk")).toBe(row);
  });

  test("keeps every habit in its place while the taps go on (RF-12)", async () => {
    await addBoolean("read", "Leer", "22:00");
    await addBoolean("walk", "Pasear", "08:00");
    await renderApp();
    await screen.findByText("Pasear");

    await fireEvent.press(screen.getByTestId("habit-walk"));
    await waitForTheMove(SETTLE_DELAY_MS - 100);
    await fireEvent.press(screen.getByTestId("habit-read"));
    await waitForTheMove(SETTLE_DELAY_MS - 100);

    // The second tap started the pause again, so nothing has moved yet.
    expect(doneNames()).toEqual([]);

    await waitForTheMove(100);
    expect(doneNames()).toEqual(["Pasear", "Leer"]);
  });

  test("puts the habit among the done ones by its reminders (RF-12)", async () => {
    const appBecomes = spyOnAppState();
    await addBoolean("late", "Tarde", "21:00");
    await addBoolean("early", "Pronto", "11:00");
    await addBoolean("noon", "Mediodía", "12:00");
    await renderApp();
    await screen.findByText("Pronto");
    await fireEvent.press(screen.getByTestId("habit-late"));
    await fireEvent.press(screen.getByTestId("habit-early"));
    await appBecomes("background");
    await appBecomes("active");
    expect(doneNames()).toEqual(["Pronto", "Tarde"]);

    await fireEvent.press(screen.getByTestId("habit-noon"));
    await waitForTheMove();

    expect(doneNames()).toEqual(["Pronto", "Mediodía", "Tarde"]);
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

  test("moves a habit that is undone back to the pending group after the pause (RF-12)", async () => {
    await addBoolean("read", "Leer");
    await addBoolean("walk", "Pasear");
    await renderApp();
    await fireEvent.press(await screen.findByTestId("habit-walk"));
    await waitForTheMove();
    expect(doneNames()).toEqual(["Pasear"]);

    await fireEvent.press(screen.getByTestId("habit-walk"));

    expect(
      await screen.findByRole("checkbox", { checked: false, name: "Pasear" }),
    ).toBeTruthy();
    expect(doneNames()).toEqual(["Pasear"]);

    await waitForTheMove();
    expect(habitNames()).toEqual(["Leer", "Pasear"]);
    expect(doneNames()).toEqual([]);
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

  test("saves the time of the picker left open (RF-22)", async () => {
    await openForm();

    await fireEvent.changeText(screen.getByLabelText("Nombre"), "Meditar");
    await fireEvent.press(screen.getByText("Añadir recordatorio"));
    await fireEvent.press(screen.getByTestId("reminder-picker"));
    await save();

    expect(await listReminders(db)).toEqual([
      expect.objectContaining({ time: "08:30" }),
    ]);
  });

  test("does not save the time of a discarded picker (RF-22)", async () => {
    await openForm();

    await fireEvent.changeText(screen.getByLabelText("Nombre"), "Meditar");
    await fireEvent.press(screen.getByText("Añadir recordatorio"));
    await fireEvent.press(screen.getByTestId("reminder-picker"));
    await fireEvent.press(screen.getByText("Descartar"));
    await save();

    expect(await listHabits(db)).toHaveLength(1);
    expect(await listReminders(db)).toEqual([]);
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
    expect(
      await screen.findByTestId(/^color-dot-(?!.*-(right|left)$)/),
    ).toHaveStyle({
      borderColor: "#4ADE80",
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

  describe("opening the reminder picker", () => {
    afterEach(() => {
      mockBottomInset = 0;
    });

    const layoutOf = (height: number) => ({
      nativeEvent: { layout: { x: 0, y: 0, width: 390, height } },
    });
    const nextFrame = () =>
      act(async () => {
        jest.advanceTimersByTime(100);
      });

    /** Renders a form that is 700 pt tall on screen and 900 pt long, with the picker open. */
    async function openPicker() {
      // The ScrollView of the tests is a class whose methods are mocks.
      const { prototype } = ScrollView as unknown as {
        prototype: { scrollTo: () => void };
      };
      const scrollTo = jest.spyOn(prototype, "scrollTo");
      scrollTo.mockClear();
      await renderApp("/habits/new");
      const form = screen.getByTestId("habit-form");
      await fireEvent(form, "layout", layoutOf(700));
      await fireEvent(form, "contentSizeChange", 390, 900);
      await fireEvent.press(screen.getByText("Añadir recordatorio"));
      return { form, picker: screen.getByTestId("reminder-picker"), scrollTo };
    }

    test("scrolls the form to its end once the picker has its real height", async () => {
      const { form, picker, scrollTo } = await openPicker();

      // Its first layout has no height yet: scrolling now would stop short.
      await fireEvent(picker, "layout", layoutOf(0));
      await fireEvent(form, "contentSizeChange", 390, 960);
      await nextFrame();
      expect(scrollTo).not.toHaveBeenCalled();

      // The size of the form may arrive just after the height of the picker.
      await fireEvent(picker, "layout", layoutOf(216));
      await fireEvent(form, "contentSizeChange", 390, 1176);
      await nextFrame();
      expect(scrollTo).toHaveBeenCalledTimes(1);
      expect(scrollTo).toHaveBeenCalledWith({ y: 476, animated: true });

      // Only then: other changes leave the form where the user puts it.
      await fireEvent(picker, "layout", layoutOf(220));
      await fireEvent(form, "contentSizeChange", 390, 1300);
      await nextFrame();
      expect(scrollTo).toHaveBeenCalledTimes(1);
    });

    test("leaves a margin under the last buttons, above the home indicator", async () => {
      mockBottomInset = 34;
      const { form } = await openPicker();

      const { paddingBottom } = StyleSheet.flatten(
        form.props.contentContainerStyle,
      );

      // The home indicator and 16 pt more.
      expect(paddingBottom).toBe(50);
    });

    test("does not move the form when the picker is already in view", async () => {
      const { form, picker, scrollTo } = await openPicker();
      await fireEvent.scroll(form, {
        nativeEvent: { contentOffset: { x: 0, y: 500 } },
      });

      await fireEvent(picker, "layout", layoutOf(216));
      await fireEvent(form, "contentSizeChange", 390, 1176);
      await nextFrame();

      expect(scrollTo).not.toHaveBeenCalled();
    });
  });

  test("touching an amount selects it, so that typing replaces it", async () => {
    await renderApp("/habits/new");
    await fireEvent.press(screen.getByText("Cantidad"));

    for (const label of ["Meta", "Unidad", "Incremento"]) {
      expect(screen.getByLabelText(label)).toHaveProp(
        "selectTextOnFocus",
        true,
      );
    }
    // The name is not: touching it is usually to correct it.
    expect(screen.getByLabelText("Nombre")).not.toHaveProp("selectTextOnFocus");
  });

  test("the amounts are in boxes, so that they are seen as fields to change", async () => {
    await renderApp("/habits/new");
    await fireEvent.press(screen.getByText("Cantidad"));

    for (const label of ["Meta", "Unidad", "Incremento"]) {
      expect(screen.getByLabelText(label)).toHaveStyle({
        backgroundColor: "#27272A",
        textAlign: "right",
      });
    }
    // The name takes the whole row: it is already seen as a field.
    expect(screen.getByLabelText("Nombre")).not.toHaveStyle({
      backgroundColor: "#27272A",
    });
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

  test("cancel without changes goes back to the day without asking", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    await openForm();

    await fireEvent.press(screen.getByLabelText("Cancelar"));

    expect(alert).not.toHaveBeenCalled();
    expect(screen).toHavePathname("/");
  });

  describe("with changes (RF-52)", () => {
    async function pressDialogButton(alert: jest.SpyInstance, label: string) {
      const buttons = alert.mock.lastCall?.[2] as AlertButton[];
      await act(async () => {
        buttons.find((b) => b.text === label)?.onPress?.();
      });
    }

    test("cancel asks first, and keeping on editing loses nothing", async () => {
      const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
      await openForm();
      await fireEvent.changeText(screen.getByLabelText("Nombre"), "Meditar");

      await fireEvent.press(screen.getByLabelText("Cancelar"));

      expect(alert).toHaveBeenCalledTimes(1);
      expect(alert.mock.lastCall?.[0]).toBe("¿Descartar los cambios?");
      expect(screen).toHavePathname("/habits/new");

      await pressDialogButton(alert, "Seguir editando");

      expect(screen).toHavePathname("/habits/new");
      expect(screen.getByLabelText("Nombre").props.value).toBe("Meditar");
    });

    test("discarding goes back to the day without saving", async () => {
      const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
      await openForm();
      await fireEvent.changeText(screen.getByLabelText("Nombre"), "Meditar");
      await fireEvent.press(screen.getByLabelText("Cancelar"));

      await pressDialogButton(alert, "Descartar");

      expect(screen).toHavePathname("/");
      expect(await listHabits(db)).toEqual([]);
    });

    test("an open reminder picker counts as a change", async () => {
      const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
      await openForm();
      await fireEvent.press(screen.getByText("Añadir recordatorio"));

      await fireEvent.press(screen.getByLabelText("Cancelar"));

      expect(alert).toHaveBeenCalledTimes(1);
      expect(screen).toHavePathname("/habits/new");
    });

    test("undoing the change by hand no longer asks", async () => {
      const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
      await openForm();
      await fireEvent.changeText(screen.getByLabelText("Nombre"), "Meditar");
      await fireEvent.changeText(screen.getByLabelText("Nombre"), "");

      await fireEvent.press(screen.getByLabelText("Cancelar"));

      expect(alert).not.toHaveBeenCalled();
      expect(screen).toHavePathname("/");
    });

    test("saving closes the form without asking", async () => {
      const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
      await openForm();
      await fireEvent.changeText(screen.getByLabelText("Nombre"), "Meditar");

      await fireEvent.press(screen.getByLabelText("Guardar"));

      await waitFor(() => expect(screen).toHavePathname("/"));
      expect(alert).not.toHaveBeenCalled();
      expect((await listHabits(db)).map((h) => h.name)).toEqual(["Meditar"]);
    });
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
    const reminders = scheduledIds().filter((id) => id.startsWith("reminder."));
    expect(reminders[0]).toMatch(/^reminder\..*\.2026-11-13$/);
    expect(screen).toHavePathname("/");
  });

  test("a habit pending today is also in the digests of today (RF-37)", async () => {
    await createWithReminder();

    await waitFor(() => expect(scheduledIds()).toHaveLength(60));
    expect(scheduledIds().slice(0, 2)).toEqual([
      "digest.2026-11-12.17:00",
      "digest.2026-11-12.22:00",
    ]);
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

  test("shows at once what a synchronization brings from another device (RF-05)", async () => {
    await addBoolean("walk", "Pasear");
    await renderApp();
    expect(await screen.findByTestId("habit-walk")).not.toBeChecked();

    await saveEntry(db, { id: "e1", habitId: "walk", date: TODAY, value: 1 });
    await act(async () => mockSync.listeners.forEach((listener) => listener()));

    expect(await screen.findByRole("checkbox", { checked: true })).toBeTruthy();
  });

  test("a change is uploaded to the account in a moment (RF-28)", async () => {
    await addBoolean("walk", "Pasear");
    await renderApp();

    await fireEvent.press(await screen.findByTestId("habit-walk"));

    await waitFor(() => expect(mockSync.syncSoon).toHaveBeenCalledWith(db));
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

describe("horizons (RF-33, RF-40, RF-41)", () => {
  const PAGE_WIDTH = Dimensions.get("window").width;

  /** Leaves the carousel at `offset` points from the first page. */
  async function scrollPager(offset: number) {
    await fireEvent.scroll(screen.getByTestId("horizon-pager"), {
      nativeEvent: {
        contentOffset: { x: offset, y: 0 },
        contentSize: { width: PAGE_WIDTH * 2, height: 600 },
        layoutMeasurement: { width: PAGE_WIDTH, height: 600 },
      },
    });
  }

  const showWeek = () => scrollPager(PAGE_WIDTH);

  async function openCalendar() {
    await layOut("calendar");
    await drag("day-date", 300, 800);
  }

  test("starts on the habits and slides to the empty week, with its title", async () => {
    await renderApp();
    await screen.findByText("Todavía no tienes hábitos.");
    expect(screen.getByText("Hoy")).toBeTruthy();
    expect(screen.queryByText("Esta semana")).toBeNull();

    await showWeek();

    expect(screen.getByText("Esta semana")).toBeTruthy();
    expect(screen.getByText("9–15 nov")).toBeTruthy();
    expect(
      screen.getByText("Todavía no tienes objetivos semanales."),
    ).toBeTruthy();
    expect(screen.queryByText("Hoy")).toBeNull();
    expect(screen.queryByText("Todavía no tienes hábitos.")).toBeNull();
  });

  test("changes page past the middle of the way, and stays within the ends", async () => {
    await renderApp();
    await screen.findByText("Todavía no tienes hábitos.");

    await scrollPager(PAGE_WIDTH * 0.4);
    expect(screen.getByText("Hoy")).toBeTruthy();
    await scrollPager(PAGE_WIDTH * 0.6);
    expect(screen.getByText("Esta semana")).toBeTruthy();
    await scrollPager(PAGE_WIDTH * 1.2);
    expect(screen.getByText("Esta semana")).toBeTruthy();
    await scrollPager(-30);
    expect(screen.getByText("Hoy")).toBeTruthy();
  });

  test("the calendar marks the whole week, also where a month cuts it", async () => {
    await renderApp();
    await screen.findByText("Todavía no tienes hábitos.");
    await showWeek();
    await openCalendar();

    for (const day of [9, 10, 11, 13, 14, 15]) {
      expect(
        screen.getByLabelText(`${day} de noviembre de 2026`),
      ).toBeSelected();
    }
    expect(
      screen.getByLabelText("Hoy, 12 de noviembre de 2026"),
    ).toBeSelected();
    expect(screen.getByLabelText("8 de noviembre de 2026")).not.toBeSelected();
    expect(screen.getByLabelText("16 de noviembre de 2026")).not.toBeSelected();
    expect(screen.getByTestId("week-band-2026-11-09")).toBeTruthy();
  });

  test("shares the day: another week shows its dates, and the habits that day", async () => {
    await renderApp();
    await screen.findByText("Todavía no tienes hábitos.");
    await showWeek();
    await openCalendar();

    await fireEvent.press(screen.getByLabelText("4 de noviembre de 2026"));

    expect(await screen.findByText("2–8 nov")).toBeTruthy();
    expect(screen.queryByText("Esta semana")).toBeNull();

    await scrollPager(0);
    expect(await screen.findByText("Miércoles, 4 nov")).toBeTruthy();
  });

  test("touching the title of another week goes back to this one and to today", async () => {
    await renderApp();
    await screen.findByText("Todavía no tienes hábitos.");
    await showWeek();
    await openCalendar();
    await fireEvent.press(screen.getByLabelText("4 de noviembre de 2026"));
    await screen.findByText("2–8 nov");

    await fireEvent.press(screen.getByText("2–8 nov"));

    expect(await screen.findByText("Esta semana")).toBeTruthy();
    await scrollPager(0);
    expect(await screen.findByText("Hoy")).toBeTruthy();
  });

  describe("tapping a notification (RF-26, RF-37, RF-49)", () => {
    const tap = (horizon: Horizon) => act(async () => requestHorizon(horizon));

    test("a progress digest opens this week, from the habits of another day", async () => {
      await renderApp();
      await screen.findByText("Todavía no tienes hábitos.");
      await openCalendar();
      await fireEvent.press(screen.getByLabelText("4 de noviembre de 2026"));
      await screen.findByText("Miércoles, 4 nov");
      // The ScrollView of the tests is a class whose methods are mocks.
      const { prototype } = ScrollView as unknown as {
        prototype: { scrollTo: () => void };
      };
      const scrollTo = jest.spyOn(prototype, "scrollTo");
      scrollTo.mockClear();

      await tap("weekly");

      expect(await screen.findByText("Esta semana")).toBeTruthy();
      expect(screen.getByText("9–15 nov")).toBeTruthy();
      expect(scrollTo).toHaveBeenCalledWith({
        x: PAGE_WIDTH,
        animated: false,
      });
    });

    test("a reminder goes back to today's habits, from the weekly page", async () => {
      await renderApp();
      await screen.findByText("Todavía no tienes hábitos.");
      await showWeek();

      await tap("habits");

      expect(await screen.findByText("Hoy")).toBeTruthy();
      expect(screen.queryByText("Esta semana")).toBeNull();
    });

    test("a notification that starts the app opens its page", async () => {
      requestHorizon("weekly");

      await renderApp();

      expect(await screen.findByText("Esta semana")).toBeTruthy();
      expect(screen.queryByText("Hoy")).toBeNull();
    });

    test("a form that is open stays on top, with what was typed", async () => {
      await renderApp("/habits/new");
      const name = await screen.findByLabelText("Nombre");
      await fireEvent.changeText(name, "Meditar");

      await tap("weekly");

      expect(screen).toHavePathname("/habits/new");
      expect(screen.getByLabelText("Nombre").props.value).toBe("Meditar");
    });
  });
});

describe("weekly goals (RF-42 to RF-50)", () => {
  const LAST_WEEK = localDate("2026-11-02");
  const THIS_WEEK = localDate("2026-11-09");
  const NEXT_WEEK = localDate("2026-11-16");

  async function showWeek() {
    const width = Dimensions.get("window").width;
    await fireEvent.scroll(await screen.findByTestId("horizon-pager"), {
      nativeEvent: {
        contentOffset: { x: width, y: 0 },
        contentSize: { width: width * 2, height: 600 },
        layoutMeasurement: { width, height: 600 },
      },
    });
    await screen.findByText("Esta semana");
  }

  async function renderWeek() {
    await renderApp();
    await showWeek();
  }

  async function chooseDay(label: string) {
    await layOut("calendar");
    await drag("day-date", 300, 800);
    await fireEvent.press(screen.getByLabelText(label));
  }

  async function addGoal(
    id: string,
    name: string,
    overrides: Partial<WeeklyGoal> = {},
    amounts: Partial<WeeklyGoalVersion> = {},
  ) {
    const firstWeek = overrides.firstWeek ?? LAST_WEEK;
    await addWeeklyGoal(
      db,
      weeklyGoal(id, { name, ...overrides, firstWeek }),
      weeklyGoalVersion(id, { effectiveFrom: firstWeek, ...amounts }),
    );
  }

  const addHours = (target = 5) =>
    addGoal(
      "projects",
      "Proyectos",
      { type: "quantitative" },
      { target, unit: "h", increment: 1 },
    );

  async function openNewGoal(name: string) {
    await openMenu();
    await fireEvent.press(screen.getByLabelText("Crear"));
    expect(screen).toHavePathname("/weekly-goals/new");
    await fireEvent.changeText(screen.getByLabelText("Nombre"), name);
  }

  async function save() {
    await fireEvent.press(screen.getByLabelText("Guardar"));
    await waitFor(() => expect(screen).toHavePathname("/"));
  }

  async function hold(id: string) {
    await fireEvent(await screen.findByTestId(`goal-${id}`), "longPress");
  }

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

  /** The names of the goals in the achieved group, after the gap between the groups. */
  function achievedNames() {
    const items = screen.getAllByTestId(/^goal-|^week-goals-gap$/);
    const gap = items.findIndex((i) => i.props.testID === "week-goals-gap");
    return items.slice(gap + 1).map((i) => i.props.accessibilityLabel);
  }

  test("saving a goal schedules its progress digests (RF-49)", async () => {
    await renderWeek();
    await screen.findByText("Todavía no tienes objetivos semanales.");

    await openNewGoal("Correr");
    await save();

    await waitFor(() =>
      expect(mockScheduled.get("progress.2026-11-12.20:00")).toMatchObject({
        title: "Te queda 1 objetivo",
        body: "Correr",
      }),
    );
  });

  test("recording a goal updates what its progress digest says (RF-49)", async () => {
    await addHours();
    await renderWeek();

    await fireEvent.press(await screen.findByTestId("goal-projects"));

    await waitFor(() =>
      expect(mockScheduled.get("progress.2026-11-12.20:00")).toMatchObject({
        body: "Proyectos 1 de 5 h",
      }),
    );
  });

  test("achieving the last goal cancels this week's progress digests (RF-49)", async () => {
    await addHours(1);
    await renderWeek();

    await fireEvent.press(await screen.findByTestId("goal-projects"));

    await waitFor(() =>
      expect(mockScheduled.has("progress.2026-11-19.20:00")).toBe(true),
    );
    expect(mockScheduled.has("progress.2026-11-12.20:00")).toBe(false);
    expect(mockScheduled.has("progress.2026-11-15.11:00")).toBe(false);
  });

  test("creates a recurring goal from the menu of the week, and a tap marks it", async () => {
    await renderWeek();
    await screen.findByText("Todavía no tienes objetivos semanales.");
    expect(
      screen.getByText("Desliza desde abajo para crear uno."),
    ).toBeTruthy();

    await openNewGoal("Correr");
    expect(screen.getByText("Se repite cada semana")).toBeTruthy();
    await save();

    expect(await screen.findByText("Correr")).toBeTruthy();
    const [goal] = await listWeeklyGoals(db);
    expect(goal).toMatchObject({
      name: "Correr",
      recurring: true,
      firstWeek: THIS_WEEK,
    });

    await fireEvent.press(screen.getByTestId(`goal-${goal.id}`));

    await waitFor(() =>
      expect(screen.getByTestId(`goal-${goal.id}`)).toBeChecked(),
    );
    expect(await listWeeklyGoalEntries(db, THIS_WEEK)).toEqual([
      expect.objectContaining({ weeklyGoalId: goal.id, value: 1 }),
    ]);
  });

  test("a one-off goal says its week and does not appear in the next one", async () => {
    await renderWeek();
    await screen.findByText("Todavía no tienes objetivos semanales.");

    await openNewGoal("Declarar la renta");
    await fireEvent(
      screen.getByLabelText("Repetir cada semana"),
      "valueChange",
      false,
    );
    expect(screen.getByText("Solo la semana del 9–15 nov")).toBeTruthy();
    await save();

    expect(await screen.findByText("Declarar la renta")).toBeTruthy();
    expect(await listWeeklyGoals(db)).toEqual([
      expect.objectContaining({ recurring: false, firstWeek: THIS_WEEK }),
    ]);

    await chooseDay("18 de noviembre de 2026");
    expect(
      await screen.findByText("Esa semana no hay objetivos."),
    ).toBeTruthy();
  });

  test("a goal created from a past week starts in this one, and the screen goes there (RF-42)", async () => {
    await renderWeek();
    await screen.findByText("Todavía no tienes objetivos semanales.");
    await chooseDay("4 de noviembre de 2026");
    await screen.findByText("2–8 nov");

    await openNewGoal("Correr");
    await save();

    expect(await screen.findByText("Esta semana")).toBeTruthy();
    expect(await screen.findByText("Correr")).toBeTruthy();
    expect(await listWeeklyGoals(db)).toEqual([
      expect.objectContaining({ firstWeek: THIS_WEEK }),
    ]);
  });

  test("a goal created from a future week starts that week, and the form says so", async () => {
    await renderWeek();
    await screen.findByText("Todavía no tienes objetivos semanales.");
    await chooseDay("18 de noviembre de 2026");
    await screen.findByText("16–22 nov");

    await openNewGoal("Correr");
    expect(
      screen.getByText("Se repite cada semana desde la del 16–22 nov"),
    ).toBeTruthy();
    await save();

    expect(screen.getByText("16–22 nov")).toBeTruthy();
    expect(await screen.findByText("Correr")).toBeTruthy();
    expect(await listWeeklyGoals(db)).toEqual([
      expect.objectContaining({ firstWeek: NEXT_WEEK }),
    ]);
  });

  test("rejects a goal with an amount and no target, and shows why", async () => {
    await renderWeek();
    await screen.findByText("Todavía no tienes objetivos semanales.");

    await openNewGoal("Proyectos");
    await fireEvent.press(screen.getByText("Cantidad"));
    await fireEvent.press(screen.getByLabelText("Guardar"));

    expect(
      await screen.findByText("La meta debe ser un número mayor que 0."),
    ).toBeTruthy();
    expect(screen).toHavePathname("/weekly-goals/new");
    expect(await listWeeklyGoals(db)).toEqual([]);
  });

  test("cancelling a goal with changes asks first (RF-52)", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    await renderWeek();
    await screen.findByText("Todavía no tienes objetivos semanales.");
    await openNewGoal("Proyectos");

    await fireEvent.press(screen.getByLabelText("Cancelar"));

    expect(alert.mock.lastCall?.[0]).toBe("¿Descartar los cambios?");
    expect(screen).toHavePathname("/weekly-goals/new");

    await pressAlertButton(alert, "Descartar");

    expect(screen).toHavePathname("/");
    expect(await listWeeklyGoals(db)).toEqual([]);
  });

  test("a tap adds the increment, and the goal moves to the achieved group after a pause", async () => {
    await addHours(2);
    await renderWeek();

    await fireEvent.press(await screen.findByTestId("goal-projects"));
    await screen.findByText("1 / 2 h");
    await fireEvent.press(screen.getByTestId("goal-projects"));
    await screen.findByText("2 / 2 h");
    expect(achievedNames()).toEqual([]);

    await waitForTheMove();

    await waitFor(() => expect(achievedNames()).toEqual(["Proyectos"]));
  });

  test("the options subtract the increment and write the exact total", async () => {
    const prompt = jest.spyOn(Alert, "prompt").mockImplementation(() => {});
    await addHours();
    await renderWeek();
    await fireEvent.press(await screen.findByTestId("goal-projects"));
    await fireEvent.press(screen.getByTestId("goal-projects"));
    await screen.findByText("2 / 5 h");

    await hold("projects");
    await fireEvent.press(screen.getByLabelText("Restar 1 h"));
    expect(await screen.findAllByText("1 / 5 h")).toHaveLength(2);

    await fireEvent.press(screen.getByLabelText("Escribir la cantidad"));
    await pressAlertButton(prompt, "Guardar", "3,5");

    expect(await screen.findByText("3,5 / 5 h")).toBeTruthy();
    expect(await listWeeklyGoalEntries(db, THIS_WEEK)).toEqual([
      expect.objectContaining({ weeklyGoalId: "projects", value: 3.5 }),
    ]);
  });

  test("a future week records nothing and its options cannot correct", async () => {
    await addHours();
    await renderWeek();
    await chooseDay("18 de noviembre de 2026");

    await fireEvent.press(await screen.findByTestId("goal-projects"));
    await hold("projects");

    expect(screen.queryByLabelText("Restar 1 h")).toBeNull();
    expect(screen.queryByLabelText("Escribir la cantidad")).toBeNull();
    expect(screen.getByLabelText("Editar")).toBeTruthy();
    await waitFor(async () =>
      expect(await listWeeklyGoalEntries(db, NEXT_WEEK)).toEqual([]),
    );
  });

  test("a one-off goal of a past week can only be deleted", async () => {
    await addGoal("old", "Mudanza", { recurring: false });
    await renderWeek();
    await chooseDay("4 de noviembre de 2026");

    await hold("old");

    expect(screen.queryByLabelText("Editar")).toBeNull();
    expect(screen.queryByLabelText("Archivar")).toBeNull();
    expect(screen.getByLabelText("Eliminar")).toBeTruthy();
  });

  test("editing from a past week says when it applies, and that week keeps its target (RF-43)", async () => {
    await addHours();
    await renderWeek();
    await chooseDay("4 de noviembre de 2026");
    await screen.findByText("2–8 nov");

    await hold("projects");
    await fireEvent.press(screen.getByLabelText("Editar"));
    await screen.findByDisplayValue("Proyectos");
    expect(
      screen.getByText("Los cambios se aplican desde esta semana"),
    ).toBeTruthy();
    expect(screen.queryByLabelText("Repetir cada semana")).toBeNull();
    await fireEvent.changeText(
      screen.getByLabelText("Nombre"),
      "Mis proyectos",
    );
    await fireEvent.changeText(screen.getByLabelText("Meta"), "10");
    await save();

    // The name changes in the whole history, and the target only from this week.
    expect(await screen.findByText("Mis proyectos")).toBeTruthy();
    expect(await screen.findByText("0 / 5 h")).toBeTruthy();
    await fireEvent.press(screen.getByText("2–8 nov"));
    expect(await screen.findByText("0 / 10 h")).toBeTruthy();
    expect(await listWeeklyGoalVersions(db)).toEqual([
      expect.objectContaining({ effectiveFrom: LAST_WEEK, target: 5 }),
      expect.objectContaining({ effectiveFrom: THIS_WEEK, target: 10 }),
    ]);
  });

  test("archiving asks first, and the goal leaves this week but stays in the past ones", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    await addGoal("run", "Correr");
    await renderWeek();

    await hold("run");
    await fireEvent.press(screen.getByLabelText("Archivar"));
    expect(alert.mock.lastCall?.[0]).toBe("¿Archivar «Correr»?");
    expect(screen.getByText("Correr")).toBeTruthy();
    await pressAlertButton(alert, "Archivar");

    expect(
      await screen.findByText("Esta semana no hay objetivos."),
    ).toBeTruthy();
    expect(await listWeeklyGoals(db)).toEqual([
      expect.objectContaining({ archivedWeek: THIS_WEEK }),
    ]);

    await chooseDay("4 de noviembre de 2026");
    expect(await screen.findByText("Correr")).toBeTruthy();
  });

  test("deleting asks first, and the goal disappears from every week", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    await addGoal("run", "Correr");
    await renderWeek();

    await hold("run");
    await fireEvent.press(screen.getByLabelText("Eliminar"));
    expect(alert.mock.lastCall?.[0]).toBe("¿Eliminar «Correr»?");
    await pressAlertButton(alert, "Eliminar");

    expect(
      await screen.findByText("Todavía no tienes objetivos semanales."),
    ).toBeTruthy();
    expect(await listWeeklyGoals(db)).toEqual([]);
  });

  test("a change that arrives from another device appears on the page", async () => {
    await renderWeek();
    await screen.findByText("Todavía no tienes objetivos semanales.");

    await addGoal("run", "Correr");
    await act(async () => {
      mockSync.listeners.forEach((listener) => listener());
    });

    expect(await screen.findByText("Correr")).toBeTruthy();
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

  async function createFromMenu(name: string) {
    await openMenu();
    await fireEvent.press(screen.getByLabelText("Crear"));
    await fireEvent.changeText(screen.getByLabelText("Nombre"), name);
  }

  test("a habit created from a future day starts that day, and the form says so (RF-06)", async () => {
    await renderApp();
    await chooseDay("14 de noviembre de 2026");

    await createFromMenu("Correr");
    expect(screen.getByText("Empieza el 14 de noviembre de 2026")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Guardar"));

    await waitFor(() => expect(screen).toHavePathname("/"));
    expect(screen.getByText("Sábado, 14 nov")).toBeTruthy();
    expect(await screen.findByText("Correr")).toBeTruthy();
    expect(await listHabits(db)).toEqual([
      expect.objectContaining({ name: "Correr", createdOn: "2026-11-14" }),
    ]);
    expect(await listHabitVersions(db)).toEqual([
      expect.objectContaining({ effectiveFrom: "2026-11-14" }),
    ]);

    // It is not due before that day.
    await chooseDay("13 de noviembre de 2026");
    expect(await screen.findByText("Viernes, 13 nov")).toBeTruthy();
    expect(screen.queryByText("Correr")).toBeNull();
  });

  test("a habit created from a past day starts today, and the screen goes there to show it (RF-06)", async () => {
    await renderApp();
    await chooseDay("10 de noviembre de 2026");

    await createFromMenu("Correr");
    expect(screen.queryByText(/^Empieza el/)).toBeNull();
    await fireEvent.press(screen.getByLabelText("Guardar"));

    await waitFor(() => expect(screen).toHavePathname("/"));
    expect(await screen.findByText("Hoy")).toBeTruthy();
    expect(await screen.findByText("Correr")).toBeTruthy();
    expect(await listHabits(db)).toEqual([
      expect.objectContaining({ name: "Correr", createdOn: TODAY }),
    ]);
  });

  test("the changes to a habit that has not started apply from the day it starts (RF-09)", async () => {
    const start = localDate("2026-11-14");
    await addHabit(
      db,
      habit("water", {
        name: "Beber agua",
        type: "quantitative",
        createdOn: start,
      }),
      version("water", {
        effectiveFrom: start,
        target: 2,
        unit: "L",
        increment: 0.25,
      }),
    );
    await renderApp();
    await chooseDay("16 de noviembre de 2026");

    await fireEvent(await screen.findByTestId("habit-water"), "longPress");
    await fireEvent.press(screen.getByLabelText("Editar"));
    expect(
      await screen.findByText(
        "Los cambios se aplican desde el 14 de noviembre de 2026",
      ),
    ).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText("Meta"), "3");
    await fireEvent.press(screen.getByLabelText("Guardar"));

    await waitFor(() => expect(screen).toHavePathname("/"));
    expect(await listHabitVersions(db)).toEqual([
      version("water", {
        effectiveFrom: start,
        target: 3,
        unit: "L",
        increment: 0.25,
      }),
    ]);
  });

  test("the form of a habit that has not started, opened from the day it starts, does not say when the changes apply", async () => {
    const start = localDate("2026-11-14");
    await addHabit(
      db,
      habit("walk", { name: "Pasear", createdOn: start }),
      version("walk", { effectiveFrom: start }),
    );
    await renderApp();
    await chooseDay("14 de noviembre de 2026");

    await fireEvent(await screen.findByTestId("habit-walk"), "longPress");
    await fireEvent.press(screen.getByLabelText("Editar"));

    expect(await screen.findByDisplayValue("Pasear")).toBeTruthy();
    expect(screen.queryByText(/^Los cambios se aplican/)).toBeNull();
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

describe("sign-in", () => {
  beforeEach(() => {
    mockSession = null;
  });

  test("without a session only the sign-in screen is shown (RF-01)", async () => {
    await renderApp();

    expect(
      await screen.findByText(
        "Inicia sesión para guardar tus hábitos en tu cuenta.",
      ),
    ).toBeTruthy();
    expect(screen).toHavePathname("/sign-in");
    expect(screen.queryByText("Todavía no tienes hábitos.")).toBeNull();
  });

  test("a link to a screen of the account leads to the sign-in too", async () => {
    await renderApp("/settings");

    expect(screen).toHavePathname("/sign-in");
  });

  test("signs in with Apple with a nonce: its hash to Apple, the value to Supabase", async () => {
    mockAppleSignIn.mockResolvedValue({ identityToken: "apple-token" });
    await renderApp();

    await fireEvent.press(await screen.findByTestId("sign-in-apple"));

    await waitFor(() => expect(mockAuth.signInWithIdToken).toHaveBeenCalled());
    const sent = mockAuth.signInWithIdToken.mock.lastCall?.[0];
    expect(sent).toEqual({
      provider: "apple",
      token: "apple-token",
      nonce: expect.any(String),
    });
    expect(mockAppleSignIn).toHaveBeenCalledWith(
      expect.objectContaining({ nonce: `sha256(${sent.nonce})` }),
    );
    expect(screen.queryByText(/No se ha podido iniciar sesión/)).toBeNull();
  });

  test("signs in with Google, without nonce (ADR-0017)", async () => {
    mockGoogle.signIn.mockResolvedValue({
      type: "success",
      data: { idToken: "google-token" },
    });
    await renderApp();

    await fireEvent.press(await screen.findByTestId("sign-in-google"));

    await waitFor(() =>
      expect(mockAuth.signInWithIdToken).toHaveBeenCalledWith({
        provider: "google",
        token: "google-token",
        nonce: undefined,
      }),
    );
    expect(mockGoogle.configure).toHaveBeenCalledWith({
      webClientId: "web.apps.googleusercontent.com",
      iosClientId: "ios.apps.googleusercontent.com",
    });
  });

  test("a cancelled sign-in says nothing; a failed one asks to check the connection", async () => {
    mockAppleSignIn.mockRejectedValue({ code: "ERR_REQUEST_CANCELED" });
    mockGoogle.signIn.mockResolvedValue({ type: "cancelled", data: null });
    await renderApp();

    await fireEvent.press(await screen.findByTestId("sign-in-apple"));
    await waitFor(() => expect(screen.queryByTestId("signing-in")).toBeNull());
    await fireEvent.press(screen.getByTestId("sign-in-google"));
    await waitFor(() => expect(screen.queryByTestId("signing-in")).toBeNull());
    expect(screen.queryByText(/No se ha podido iniciar sesión/)).toBeNull();
    expect(mockAuth.signInWithIdToken).not.toHaveBeenCalled();

    mockAppleSignIn.mockResolvedValue({ identityToken: "apple-token" });
    mockAuth.signInWithIdToken.mockResolvedValue({
      data: {},
      error: { message: "Network request failed" },
    });
    await fireEvent.press(screen.getByTestId("sign-in-apple"));

    expect(
      await screen.findByText(
        "No se ha podido iniciar sesión. Comprueba que tienes conexión e inténtalo de nuevo.",
      ),
    ).toBeTruthy();
  });

  test("an error of Apple or Google is a failed sign-in too", async () => {
    mockGoogle.signIn.mockRejectedValue(new Error("No connection."));
    await renderApp();

    await fireEvent.press(await screen.findByTestId("sign-in-google"));

    expect(
      await screen.findByText(/No se ha podido iniciar sesión/),
    ).toBeTruthy();
  });
});

describe("state of the copy (RF-53)", () => {
  // The clock of these tests is at 10:00 of the current day.
  const at = (time: string) => new Date(`${TODAY}T${time}:00`).getTime();
  const daysAgo = (days: number) => at("10:00") - days * 24 * 60 * 60 * 1000;

  test("the settings say when it was last copied", async () => {
    mockSyncRecord = { lastCopiedAt: at("09:55"), failingSince: null };

    await renderApp("/settings");

    expect(await screen.findByTestId("sync-status")).toHaveTextContent(
      "Copiado en tu cuenta hace 5 min",
    );
  });

  test("the settings say nothing before the first copy", async () => {
    await renderApp("/settings");
    await screen.findByLabelText("Cerrar sesión");

    expect(screen.queryByTestId("sync-status")).toBeNull();
  });

  test("the settings say when there are changes to copy", async () => {
    await addBoolean("walk", "Pasear");

    await renderApp("/settings");

    expect(await screen.findByTestId("sync-status")).toHaveTextContent(
      "Hay cambios pendientes de copiar en tu cuenta",
    );
  });

  test("the main screen warns of changes stuck for days", async () => {
    await addBoolean("walk", "Pasear");
    mockSyncRecord = { lastCopiedAt: null, failingSince: daysAgo(3) };

    await renderApp();

    expect(await screen.findByTestId("sync-warning")).toHaveTextContent(
      "Sin copiar en tu cuenta desde hace 3 días. Comprueba la conexión.",
    );
  });

  test("the main screen says nothing while they are only pending", async () => {
    await addBoolean("walk", "Pasear");
    mockSyncRecord = { lastCopiedAt: null, failingSince: daysAgo(2) };

    await renderApp();
    await screen.findByText("Pasear");

    expect(screen.queryByTestId("sync-warning")).toBeNull();
  });

  test("signing out forgets it", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    await renderApp("/settings");
    await fireEvent.press(await screen.findByLabelText("Cerrar sesión"));
    await waitFor(() => expect(alert).toHaveBeenCalled());

    const buttons = alert.mock.lastCall?.[2] as AlertButton[];
    await act(async () => {
      buttons.find((b) => b.text === "Cerrar sesión")?.onPress?.();
    });

    await waitFor(() => expect(mockClearSyncRecord).toHaveBeenCalled());
  });

  test("a tap that cannot be saved says so", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    await addBoolean("walk", "Pasear");
    await renderApp();
    await screen.findByText("Pasear");
    jest.spyOn(db, "run").mockRejectedValueOnce(new Error("disk full"));

    await fireEvent.press(screen.getByTestId("habit-walk"));

    await waitFor(() =>
      expect(alert).toHaveBeenCalledWith(
        "No se ha podido guardar",
        "Tu último cambio no se ha guardado. Inténtalo de nuevo.",
      ),
    );
    expect(warn).toHaveBeenCalledWith(
      "A change could not be saved.",
      new Error("disk full"),
    );
  });
});

describe("settings", () => {
  /** Presses a button of the last native alert, as iOS would. */
  async function pressAlertButton(alert: jest.SpyInstance, label: string) {
    const buttons = alert.mock.lastCall?.[2] as AlertButton[];
    await act(async () => {
      await buttons.find((b) => b.text === label)?.onPress?.();
    });
  }

  async function markEverythingSynced() {
    for (const table of ["habits", "habit_versions", "entries", "reminders"]) {
      await markSynced(db, table);
    }
  }

  test("the menu opens them, with the account of the session (RF-32)", async () => {
    await renderApp();
    await screen.findByText("Todavía no tienes hábitos.");
    await openMenu();

    await fireEvent.press(screen.getByLabelText("Ajustes"));

    expect(screen).toHavePathname("/settings");
    expect(await screen.findByText("Sesión iniciada con Apple")).toBeTruthy();
    expect(screen.getByText("persona@example.com")).toBeTruthy();
  });

  test("shows the version of the app, the one in app.json (RF-54)", async () => {
    await renderApp("/settings");

    expect(
      await screen.findByText(`Versión ${appJson.expo.version}`),
    ).toBeTruthy();
  });

  test("signing out removes the data and the notifications of the device (RF-03)", async () => {
    const alert = jest.spyOn(Alert, "alert");
    await addBoolean("walk", "Pasear", "08:30");
    await markEverythingSynced();
    mockScheduled.set("reminder", {});
    await renderApp("/settings");

    await fireEvent.press(await screen.findByLabelText("Cerrar sesión"));
    await waitFor(() =>
      expect(alert).toHaveBeenCalledWith(
        "Cerrar sesión",
        "Tus datos se borrarán de este iPhone, pero seguirán en tu cuenta.",
        expect.any(Array),
      ),
    );

    await pressAlertButton(alert, "Cancelar");
    expect(await listHabits(db)).toHaveLength(1);
    expect(mockAuth.signOut).not.toHaveBeenCalled();

    await pressAlertButton(alert, "Cerrar sesión");

    await waitFor(() =>
      expect(mockAuth.signOut).toHaveBeenCalledWith({ scope: "local" }),
    );
    expect(await listHabits(db)).toEqual([]);
    expect(await listReminders(db)).toEqual([]);
    expect(mockScheduled.size).toBe(0);
    // Google was not used: there is nothing to forget.
    expect(mockGoogle.signOut).not.toHaveBeenCalled();
  });

  test("signing out uploads the last changes first, and then there is nothing to lose (RF-03)", async () => {
    const alert = jest.spyOn(Alert, "alert");
    await addBoolean("walk", "Pasear");
    mockSync.syncNow.mockImplementation(markEverythingSynced);
    await renderApp("/settings");

    await fireEvent.press(await screen.findByLabelText("Cerrar sesión"));

    await waitFor(() =>
      expect(alert).toHaveBeenCalledWith(
        "Cerrar sesión",
        "Tus datos se borrarán de este iPhone, pero seguirán en tu cuenta.",
        expect.any(Array),
      ),
    );
    expect(mockSync.syncNow).toHaveBeenCalledWith(db);
  });

  test("warns that the changes not uploaded yet will be lost (RF-03)", async () => {
    const alert = jest.spyOn(Alert, "alert");
    await addBoolean("walk", "Pasear");
    await renderApp("/settings");

    await fireEvent.press(await screen.findByLabelText("Cerrar sesión"));

    await waitFor(() =>
      expect(alert).toHaveBeenCalledWith(
        "Cerrar sesión",
        expect.stringContaining("Si cierras la sesión ahora, se perderán."),
        expect.any(Array),
      ),
    );
  });

  test("with Google, signing out also forgets the Google account on the device", async () => {
    const alert = jest.spyOn(Alert, "alert");
    mockSession = session("google", "persona@gmail.com");
    mockGoogle.hasPreviousSignIn.mockReturnValue(true);
    await renderApp("/settings");
    expect(await screen.findByText("Sesión iniciada con Google")).toBeTruthy();

    await fireEvent.press(screen.getByLabelText("Cerrar sesión"));
    await waitFor(() => expect(alert).toHaveBeenCalled());
    await pressAlertButton(alert, "Cerrar sesión");

    await waitFor(() => expect(mockAuth.signOut).toHaveBeenCalled());
    expect(mockGoogle.signOut).toHaveBeenCalled();
  });

  test("if signing out fails, it says so and the session stays open", async () => {
    const alert = jest.spyOn(Alert, "alert");
    mockAuth.signOut.mockRejectedValue(new Error("Keychain failure."));
    await renderApp("/settings");

    await fireEvent.press(await screen.findByLabelText("Cerrar sesión"));
    await waitFor(() => expect(alert).toHaveBeenCalled());
    await pressAlertButton(alert, "Cerrar sesión");

    await waitFor(() =>
      expect(alert).toHaveBeenLastCalledWith(
        "Cerrar sesión",
        "No se ha podido cerrar la sesión. Inténtalo de nuevo.",
      ),
    );
    expect(screen).toHavePathname("/settings");
  });

  describe("deleting the account (RF-04)", () => {
    const WARNING =
      "Se borrarán para siempre todos tus hábitos y su historial, en tu cuenta y en este iPhone. No se puede deshacer.";
    const ERROR =
      "No se ha podido eliminar la cuenta. Comprueba la conexión e inténtalo de nuevo.";

    async function confirmDeletion(alert: jest.SpyInstance) {
      await fireEvent.press(await screen.findByLabelText("Eliminar cuenta"));
      await pressAlertButton(alert, "Eliminar cuenta");
    }

    test("with Google, deletes the account and then everything on the device", async () => {
      const alert = jest.spyOn(Alert, "alert");
      mockSession = session("google", "persona@gmail.com");
      mockGoogle.hasPreviousSignIn.mockReturnValue(true);
      await addBoolean("walk", "Pasear", "08:30");
      mockScheduled.set("reminder", {});
      await renderApp("/settings");

      await fireEvent.press(await screen.findByLabelText("Eliminar cuenta"));
      expect(alert).toHaveBeenCalledWith(
        "Eliminar cuenta",
        WARNING,
        expect.any(Array),
      );
      await pressAlertButton(alert, "Cancelar");
      expect(mockFunctions.invoke).not.toHaveBeenCalled();

      await confirmDeletion(alert);

      await waitFor(() =>
        expect(mockAuth.signOut).toHaveBeenCalledWith({ scope: "local" }),
      );
      expect(mockFunctions.invoke).toHaveBeenCalledWith("delete-account", {
        body: { appleAuthorizationCode: undefined },
      });
      expect(mockAppleSignIn).not.toHaveBeenCalled();
      expect(await listHabits(db)).toEqual([]);
      expect(await listReminders(db)).toEqual([]);
      expect(mockScheduled.size).toBe(0);
      expect(mockGoogle.revokeAccess).toHaveBeenCalled();
    });

    test("with Apple, asks Apple for a new authorization, which the function revokes", async () => {
      const alert = jest.spyOn(Alert, "alert");
      mockAppleSignIn.mockResolvedValue({ authorizationCode: "code" });
      await renderApp("/settings");

      await fireEvent.press(await screen.findByLabelText("Eliminar cuenta"));
      expect(alert).toHaveBeenCalledWith(
        "Eliminar cuenta",
        `${WARNING} Para terminar, confírmalo con Apple.`,
        expect.any(Array),
      );
      await pressAlertButton(alert, "Eliminar cuenta");

      await waitFor(() => expect(mockAuth.signOut).toHaveBeenCalled());
      expect(mockAppleSignIn).toHaveBeenCalledWith({ requestedScopes: [] });
      expect(mockFunctions.invoke).toHaveBeenCalledWith("delete-account", {
        body: { appleAuthorizationCode: "code" },
      });
      // Google was not used: there is nothing to disconnect.
      expect(mockGoogle.revokeAccess).not.toHaveBeenCalled();
    });

    test("an account of Google linked to Apple asks Apple too", async () => {
      const alert = jest.spyOn(Alert, "alert");
      mockSession = session("google", "persona@gmail.com", ["google", "apple"]);
      mockAppleSignIn.mockResolvedValue({ authorizationCode: "code" });
      await renderApp("/settings");

      await confirmDeletion(alert);

      await waitFor(() =>
        expect(mockFunctions.invoke).toHaveBeenCalledWith("delete-account", {
          body: { appleAuthorizationCode: "code" },
        }),
      );
    });

    test("if the sign-in with Apple is cancelled, nothing changes", async () => {
      const alert = jest.spyOn(Alert, "alert");
      mockAppleSignIn.mockRejectedValue({ code: "ERR_REQUEST_CANCELED" });
      await addBoolean("walk", "Pasear");
      await renderApp("/settings");

      await confirmDeletion(alert);

      await waitFor(() => expect(mockAppleSignIn).toHaveBeenCalled());
      expect(mockFunctions.invoke).not.toHaveBeenCalled();
      expect(alert).toHaveBeenCalledTimes(1);
      expect(await listHabits(db)).toHaveLength(1);
    });

    test.each([
      ["Apple fails", { appleFails: true, error: null }],
      [
        "the function cannot be reached",
        { appleFails: false, error: new Error("Offline.") },
      ],
      [
        "the function answers with an error",
        {
          appleFails: false,
          error: new FunctionsHttpError({
            json: async () => ({ error: "apple_unavailable" }),
          }),
        },
      ],
      [
        "the answer of the function cannot be read",
        {
          appleFails: false,
          error: new FunctionsHttpError({
            json: async () => {
              throw new Error("Not JSON.");
            },
          }),
        },
      ],
    ])(
      "if %s, it says so and nothing changes",
      async (_case, { appleFails, error }) => {
        const alert = jest.spyOn(Alert, "alert");
        if (appleFails)
          mockAppleSignIn.mockRejectedValue(new Error("Failure."));
        else mockAppleSignIn.mockResolvedValue({ authorizationCode: "code" });
        mockFunctions.invoke.mockResolvedValue({ data: null, error });
        await addBoolean("walk", "Pasear");
        await renderApp("/settings");

        await confirmDeletion(alert);

        await waitFor(() =>
          expect(alert).toHaveBeenLastCalledWith("Eliminar cuenta", ERROR),
        );
        expect(await listHabits(db)).toHaveLength(1);
        expect(mockAuth.signOut).not.toHaveBeenCalled();
        expect(screen).toHavePathname("/settings");
      },
    );

    test("if Apple gives no authorization code, it says so", async () => {
      const alert = jest.spyOn(Alert, "alert");
      mockAppleSignIn.mockResolvedValue({ authorizationCode: null });
      await renderApp("/settings");

      await confirmDeletion(alert);

      await waitFor(() =>
        expect(alert).toHaveBeenLastCalledWith("Eliminar cuenta", ERROR),
      );
      expect(mockFunctions.invoke).not.toHaveBeenCalled();
    });

    test("with another Apple ID than the account's, it says so", async () => {
      const alert = jest.spyOn(Alert, "alert");
      mockAppleSignIn.mockResolvedValue({ authorizationCode: "code" });
      mockFunctions.invoke.mockResolvedValue({
        data: null,
        error: new FunctionsHttpError({
          json: async () => ({ error: "apple_account_mismatch" }),
        }),
      });
      await renderApp("/settings");

      await confirmDeletion(alert);

      await waitFor(() =>
        expect(alert).toHaveBeenLastCalledWith(
          "Eliminar cuenta",
          "Lo has confirmado con un Apple ID distinto del de tu cuenta. Inténtalo de nuevo con el mismo.",
        ),
      );
      expect(mockAuth.signOut).not.toHaveBeenCalled();
    });

    test("once the account is deleted, the device forgets it even if a step fails", async () => {
      const alert = jest.spyOn(Alert, "alert");
      mockSession = session("google", "persona@gmail.com");
      mockGoogle.hasPreviousSignIn.mockReturnValue(true);
      mockGoogle.revokeAccess.mockRejectedValue(new Error("Offline."));
      await addBoolean("walk", "Pasear");
      await renderApp("/settings");

      await confirmDeletion(alert);

      await waitFor(() =>
        expect(mockAuth.signOut).toHaveBeenCalledWith({ scope: "local" }),
      );
      expect(await listHabits(db)).toEqual([]);
    });

    test("if signing out fails at the end, it says so", async () => {
      const alert = jest.spyOn(Alert, "alert");
      mockSession = session("google", "persona@gmail.com");
      mockAuth.signOut.mockRejectedValue(new Error("Keychain failure."));
      await renderApp("/settings");

      await confirmDeletion(alert);

      await waitFor(() =>
        expect(alert).toHaveBeenLastCalledWith("Eliminar cuenta", ERROR),
      );
    });
  });
});

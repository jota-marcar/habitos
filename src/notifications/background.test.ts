import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";

import type { Database } from "@/data/database";
import { syncNow } from "@/sync/app-sync";

import { refreshRemindersInBackground } from "./background";
import { refreshReminders } from "./reminders";

jest.mock("expo-background-task", () => ({
  BackgroundTaskResult: { Success: 1, Failed: 2 },
  registerTaskAsync: jest.fn(),
}));
jest.mock("expo-task-manager", () => ({
  defineTask: jest.fn(),
  isTaskRegisteredAsync: jest.fn(),
}));
jest.mock("@/sync/app-sync", () => ({ syncNow: jest.fn() }));
jest.mock("./reminders", () => ({ refreshReminders: jest.fn() }));

const db = {} as Database;

// The registration is not awaited by its caller: this lets it finish.
const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Defines the task and returns what iOS would run. */
function definedTask(openDatabase: () => Promise<Database> = async () => db) {
  refreshRemindersInBackground(openDatabase);
  const [[name, task]] = jest.mocked(TaskManager.defineTask).mock.calls;
  expect(name).toBe("refresh-reminders");
  return task as unknown as () => Promise<number>;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(TaskManager.isTaskRegisteredAsync).mockResolvedValue(false);
  jest.mocked(BackgroundTask.registerTaskAsync).mockResolvedValue();
  jest.mocked(refreshReminders).mockResolvedValue();
  jest.mocked(syncNow).mockResolvedValue();
});

test("the task refreshes, syncs and refreshes again", async () => {
  const task = definedTask();

  expect(await task()).toBe(BackgroundTask.BackgroundTaskResult.Success);

  expect(refreshReminders).toHaveBeenCalledTimes(2);
  expect(refreshReminders).toHaveBeenCalledWith(db);
  expect(syncNow).toHaveBeenCalledWith(db);
});

test("the task reports a failure if the database does not open", async () => {
  const task = definedTask(() => Promise.reject(new Error("no database")));

  expect(await task()).toBe(BackgroundTask.BackgroundTaskResult.Failed);

  expect(refreshReminders).not.toHaveBeenCalled();
});

test("registers the task with iOS, twice a day at most", async () => {
  definedTask();
  await settled();

  expect(BackgroundTask.registerTaskAsync).toHaveBeenCalledWith(
    "refresh-reminders",
    { minimumInterval: 720 },
  );
});

test("does not register a task that is already registered", async () => {
  jest.mocked(TaskManager.isTaskRegisteredAsync).mockResolvedValue(true);

  definedTask();
  await settled();

  expect(BackgroundTask.registerTaskAsync).not.toHaveBeenCalled();
});

test("a failed registration only leaves a warning", async () => {
  const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
  jest
    .mocked(BackgroundTask.registerTaskAsync)
    .mockRejectedValue(new Error("denied"));

  definedTask();
  await settled();

  expect(warn).toHaveBeenCalledWith(
    "The background refresh could not be registered.",
    expect.any(Error),
  );
  warn.mockRestore();
});

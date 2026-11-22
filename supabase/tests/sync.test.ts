/**
 * @jest-environment node
 */
// The synchronization from end to end: two devices, each on its own SQLite database, against a
// real Supabase (ADR-0015, ADR-0018). It checks what the tests with the account in memory
// cannot: the filters of PostgREST, the format of the times of the server, the upsert under
// Row Level Security and the unique keys of the schema.
// It needs the local Supabase with its API, so it only runs in the CI (`npm run test:schema`),
// never with `npm test`.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { listEntries, saveEntry } from "@/data/entries-repository";
import {
  addHabit,
  deleteHabit,
  listHabits,
  saveHabit,
} from "@/data/habits-repository";
import { listReminders } from "@/data/reminders-repository";
import {
  habit,
  openMigratedDatabase,
  version,
  weeklyGoal,
  weeklyGoalVersion,
} from "@/data/testing/fixtures";
import type { TestDatabase } from "@/data/testing/node-database";
import {
  addWeeklyGoal,
  listWeeklyGoalEntries,
  listWeeklyGoals,
  saveWeeklyGoalEntry,
} from "@/data/weekly-goals-repository";
import { localDate } from "@/domain/dates";
import { localTime } from "@/domain/times";
import { supabaseRemote, RemoteError } from "@/sync/supabase-remote";
import { synchronize } from "@/sync/synchronize";

// Written by `supabase status -o env` in the CI.
const API_URL = process.env.API_URL ?? "http://127.0.0.1:54321";
const KEY = process.env.ANON_KEY ?? process.env.PUBLISHABLE_KEY;
const PASSWORD = "a-password-for-the-tests";

const DAY = localDate("2026-11-12");
const NEXT_DAY = localDate("2026-11-13");

const id = () => globalThis.crypto.randomUUID();

function newClient(): SupabaseClient {
  if (KEY === undefined) {
    throw new Error(
      "ANON_KEY or PUBLISHABLE_KEY must have the key of the API.",
    );
  }
  return createClient(API_URL, KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

interface Device {
  db: TestDatabase;
  client: SupabaseClient;
  userId: string;
}

/** A new account, signed in on a new device. */
async function newAccount(): Promise<{ email: string; device: Device }> {
  const email = `${id()}@example.com`;
  const client = newClient();
  const { data, error } = await client.auth.signUp({
    email,
    password: PASSWORD,
  });
  if (error !== null || data.user === null) throw error;
  return {
    email,
    device: { db: await openMigratedDatabase(), client, userId: data.user.id },
  };
}

/** Another device signed in to the account of `email`. */
async function signIn(email: string): Promise<Device> {
  const client = newClient();
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password: PASSWORD,
  });
  if (error !== null) throw error;
  return { db: await openMigratedDatabase(), client, userId: data.user.id };
}

function sync(device: Device, pageSize?: number) {
  return synchronize(
    device.db,
    supabaseRemote(device.client),
    device.userId,
    pageSize,
  );
}

/** A habit with a row in every synchronized table. */
async function addFullHabit(db: TestDatabase, name: string): Promise<string> {
  const habitId = id();
  await addHabit(db, habit(habitId, { name }), version(habitId, { id: id() }), [
    { id: id(), habitId, time: localTime("08:00") },
  ]);
  await saveEntry(db, { id: id(), habitId, date: DAY, value: 1 });
  return habitId;
}

async function habitNames(db: TestDatabase): Promise<string[]> {
  return (await listHabits(db)).map((h) => h.name).sort();
}

async function values(db: TestDatabase, day = DAY): Promise<number[]> {
  return (await listEntries(db, day, day)).map((entry) => entry.value);
}

let phone: Device;
let tablet: Device;

beforeEach(async () => {
  const account = await newAccount();
  phone = account.device;
  tablet = await signIn(account.email);
});

afterEach(() => {
  phone?.db.close();
  tablet?.db.close();
});

test("a weekly goal and its total reach another device", async () => {
  const goalId = id();
  const week = localDate("2026-11-16");
  const goal = weeklyGoal(goalId, { recurring: false, name: "Run" });
  await addWeeklyGoal(phone.db, goal, weeklyGoalVersion(goalId, { id: id() }));
  await saveWeeklyGoalEntry(phone.db, {
    id: id(),
    weeklyGoalId: goalId,
    week,
    value: 2,
  });

  await sync(phone);
  await sync(tablet);

  expect(await listWeeklyGoals(tablet.db)).toEqual([goal]);
  expect(await listWeeklyGoalEntries(tablet.db, week)).toMatchObject([
    { weeklyGoalId: goalId, value: 2 },
  ]);
});

test("the data of a device reach another device of the account (RF-05, RF-38)", async () => {
  await addFullHabit(phone.db, "Water");
  await addFullHabit(tablet.db, "Read");

  await sync(phone);
  await sync(tablet);
  await sync(phone);

  expect(await habitNames(phone.db)).toEqual(["Read", "Water"]);
  expect(await habitNames(tablet.db)).toEqual(["Read", "Water"]);
  expect(await values(tablet.db)).toEqual([1, 1]);
  expect(await listReminders(tablet.db)).toHaveLength(2);
  expect(await sync(phone)).toEqual({ changed: false });
});

test("changes and deletions reach the other device", async () => {
  const water = await addFullHabit(phone.db, "Water");
  const read = await addFullHabit(phone.db, "Read");
  await sync(phone);
  await sync(tablet);

  await saveHabit(tablet.db, habit(water, { name: "Drink water" }));
  await deleteHabit(tablet.db, read);
  await sync(tablet);
  await sync(phone);

  expect(await habitNames(phone.db)).toEqual(["Drink water"]);
  expect(await values(phone.db)).toEqual([1]);
});

test("downloads in pages", async () => {
  for (const name of ["A", "B", "C", "D", "E"]) {
    await addFullHabit(phone.db, name);
  }
  await sync(phone, 2);

  await sync(tablet, 2);

  expect(await habitNames(tablet.db)).toEqual(["A", "B", "C", "D", "E"]);
  expect(await listReminders(tablet.db)).toHaveLength(5);
});

test("an entry of the same day on both devices is joined", async () => {
  const water = await addFullHabit(phone.db, "Water");
  await sync(phone);
  await sync(tablet);
  await saveEntry(phone.db, {
    id: id(),
    habitId: water,
    date: NEXT_DAY,
    value: 1,
  });
  await saveEntry(tablet.db, {
    id: id(),
    habitId: water,
    date: NEXT_DAY,
    value: 2,
  });

  await sync(phone);
  await sync(tablet);
  await sync(phone);

  expect(await values(phone.db, NEXT_DAY)).toEqual([2]);
  expect(await values(tablet.db, NEXT_DAY)).toEqual([2]);
});

test("the account rejects a second live row with the same natural key", async () => {
  const water = await addFullHabit(phone.db, "Water");
  await sync(phone);
  const remote = supabaseRemote(tablet.client);

  const clash = remote.push("entries", [
    { id: id(), habit_id: water, date: DAY, value: 2, deleted: false },
  ]);

  await expect(clash).rejects.toBeInstanceOf(RemoteError);
  await expect(clash).rejects.toMatchObject({ code: "23505" });
});

test("another account sees nothing", async () => {
  await addFullHabit(phone.db, "Water");
  await sync(phone);
  const stranger = (await newAccount()).device;

  try {
    expect(await sync(stranger)).toEqual({ changed: false });
    expect(await habitNames(stranger.db)).toEqual([]);
  } finally {
    stranger.db.close();
  }
});

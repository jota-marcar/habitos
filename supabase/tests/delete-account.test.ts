/**
 * @jest-environment node
 */
// The Edge Function `delete-account` from end to end, served by the local Supabase (RF-04,
// ADR-0019): it checks what the tests of its handler cannot, which are the user of a real
// token, the deletion with the secret key and the cascade over every table of the account.
// Accounts with Apple are not covered: they need a real authorization code of Apple.
// It needs the local Supabase, so it only runs in the CI (`npm run test:schema`).

import {
  createClient,
  FunctionsHttpError,
  type SupabaseClient,
} from "@supabase/supabase-js";

import { addHabit } from "@/data/habits-repository";
import { saveEntry } from "@/data/entries-repository";
import { saveTask } from "@/data/tasks-repository";
import {
  habit,
  openMigratedDatabase,
  task,
  version,
} from "@/data/testing/fixtures";
import { localDate } from "@/domain/dates";
import { localTime } from "@/domain/times";
import { supabaseRemote } from "@/sync/supabase-remote";
import { synchronize } from "@/sync/synchronize";

// Written by `supabase status -o env` in the CI.
const API_URL = process.env.API_URL ?? "http://127.0.0.1:54321";
const KEY = process.env.ANON_KEY ?? process.env.PUBLISHABLE_KEY;
const SECRET_KEY = process.env.SERVICE_ROLE_KEY ?? process.env.SECRET_KEY;
const PASSWORD = "a-password-for-the-tests";

const ACCOUNT_TABLES = [
  "habits",
  "habit_versions",
  "entries",
  "reminders",
  "tasks",
];

// The first request starts the function, which downloads its dependencies.
jest.setTimeout(60_000);

const id = () => globalThis.crypto.randomUUID();

function client(key: string | undefined): SupabaseClient {
  if (key === undefined) {
    throw new Error("The keys of the local API are missing.");
  }
  return createClient(API_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

interface Account {
  email: string;
  userId: string;
  client: SupabaseClient;
}

/** A new account, with a habit in every table of the account, uploaded by a device. */
async function accountWithData(): Promise<Account> {
  const email = `${id()}@example.com`;
  const account = client(KEY);
  const { data, error } = await account.auth.signUp({
    email,
    password: PASSWORD,
  });
  if (error !== null || data.user === null) throw error;
  const db = await openMigratedDatabase();
  try {
    const habitId = id();
    await addHabit(db, habit(habitId), version(habitId, { id: id() }), [
      { id: id(), habitId, time: localTime("08:00") },
    ]);
    await saveEntry(db, {
      id: id(),
      habitId,
      date: localDate("2026-11-12"),
      value: 1,
    });
    await saveTask(db, task(id()));
    await synchronize(db, supabaseRemote(account), data.user.id);
  } finally {
    db.close();
  }
  return { email, userId: data.user.id, client: account };
}

/** The rows of each table of the account, read with the secret key, past Row Level Security. */
async function rowsOf(userId: string): Promise<Record<string, number>> {
  const admin = client(SECRET_KEY);
  const rows: Record<string, number> = {};
  for (const table of ACCOUNT_TABLES) {
    const { count, error } = await admin
      .from(table)
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId);
    if (error !== null) throw error;
    rows[table] = count ?? 0;
  }
  return rows;
}

const ONE_ROW_EACH = {
  habits: 1,
  habit_versions: 1,
  entries: 1,
  reminders: 1,
  tasks: 1,
};
const NO_ROWS = {
  habits: 0,
  habit_versions: 0,
  entries: 0,
  reminders: 0,
  tasks: 0,
};

async function deleteAccount(account: SupabaseClient) {
  const { data, error } = await account.functions.invoke("delete-account", {
    body: {},
  });
  if (error instanceof FunctionsHttpError) {
    const response = error.context as Response;
    return { status: response.status, body: await response.json() };
  }
  if (error !== null) throw error;
  return { status: 200, body: data };
}

test("deletes the user of the session and every row of the account, and nothing else", async () => {
  const account = await accountWithData();
  const other = await accountWithData();
  expect(await rowsOf(account.userId)).toEqual(ONE_ROW_EACH);

  expect(await deleteAccount(account.client)).toEqual({
    status: 200,
    body: { deleted: true },
  });

  expect(await rowsOf(account.userId)).toEqual(NO_ROWS);
  const { error } = await client(KEY).auth.signInWithPassword({
    email: account.email,
    password: PASSWORD,
  });
  expect(error).not.toBeNull();
  expect(await rowsOf(other.userId)).toEqual(ONE_ROW_EACH);
});

test("the token of a deleted user does not serve again", async () => {
  const account = await accountWithData();
  await deleteAccount(account.client);

  expect(await deleteAccount(account.client)).toEqual({
    status: 401,
    body: { error: "unauthorized" },
  });
});

test("without a session, it deletes nothing", async () => {
  expect(await deleteAccount(client(KEY))).toEqual({
    status: 401,
    body: { error: "unauthorized" },
  });
});

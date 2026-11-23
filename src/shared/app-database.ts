// The local database of the app (ADR-0010). It is opened once and prepared before it is used.
// The screens and the buttons of the reminders share this connection, also when iOS starts the
// app in the background only for them.

import { openDatabaseAsync } from "expo-sqlite";

import type { Database } from "@/data/database";
import { fromExpoSQLite, prepareDatabase } from "@/data/expo-database";

const DATABASE_NAME = "habits.db";

let opening: Promise<Database> | null = null;

/** The database of the app, opened and prepared the first time it is asked for. */
export function openAppDatabase(): Promise<Database> {
  if (opening === null) {
    const open = async () => {
      const db = fromExpoSQLite(await openDatabaseAsync(DATABASE_NAME));
      await prepareDatabase(db);
      return db;
    };
    opening = open();
    // A failed opening is tried again the next time.
    opening.catch(() => {
      opening = null;
    });
  }
  return opening;
}

// Gives the screens the local database (ADR-0010). It is opened once and prepared before
// anything is rendered; screens only see the Database interface. The buttons of the reminders
// use the same connection, also when iOS starts the app in the background only for them.

import { openDatabaseAsync } from "expo-sqlite";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

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

/** The database the screens use. Tests provide one on the SQLite built into Node. */
export const DatabaseContext = createContext<Database | null>(null);

export function DatabaseProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<Database | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let left = false;
    openAppDatabase().then(
      (opened) => !left && setDb(opened),
      (failure: unknown) => !left && setError(failure ?? "failed"),
    );
    return () => {
      left = true;
    };
  }, []);

  // An app without its database cannot work: the error reaches the error screen.
  if (error !== null) throw error;
  if (db === null) return null;
  return <DatabaseContext value={db}>{children}</DatabaseContext>;
}

export function useDatabase(): Database {
  const db = useContext(DatabaseContext);
  if (db === null) {
    throw new Error("useDatabase must be used inside a DatabaseProvider.");
  }
  return db;
}

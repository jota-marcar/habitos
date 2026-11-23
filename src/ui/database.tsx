// Gives the screens the local database (ADR-0010), prepared before anything is rendered.
// Screens only see the Database interface.

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import type { Database } from "@/data/database";
import { openAppDatabase } from "@/shared/app-database";

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

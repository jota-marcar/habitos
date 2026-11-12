// Gives the screens the local database (ADR-0010). The provider opens it with expo-sqlite and
// prepares it before rendering anything; screens only see the Database interface.

import { SQLiteProvider, useSQLiteContext } from "expo-sqlite";
import { createContext, useContext, useMemo, type ReactNode } from "react";

import type { Database } from "@/data/database";
import { fromExpoSQLite, prepareDatabase } from "@/data/expo-database";

const DATABASE_NAME = "habits.db";

/** The database the screens use. Tests provide one on the SQLite built into Node. */
export const DatabaseContext = createContext<Database | null>(null);

function ExpoDatabaseProvider({ children }: { children: ReactNode }) {
  const expoDb = useSQLiteContext();
  const db = useMemo(() => fromExpoSQLite(expoDb), [expoDb]);
  return <DatabaseContext value={db}>{children}</DatabaseContext>;
}

export function DatabaseProvider({ children }: { children: ReactNode }) {
  return (
    <SQLiteProvider
      databaseName={DATABASE_NAME}
      onInit={(db) => prepareDatabase(fromExpoSQLite(db))}
    >
      <ExpoDatabaseProvider>{children}</ExpoDatabaseProvider>
    </SQLiteProvider>
  );
}

export function useDatabase(): Database {
  const db = useContext(DatabaseContext);
  if (db === null) {
    throw new Error("useDatabase must be used inside a DatabaseProvider.");
  }
  return db;
}

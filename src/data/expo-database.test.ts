import {
  fromExpoSQLite,
  prepareDatabase,
  type ExpoSQLiteDatabase,
} from "./expo-database";
import { MIGRATIONS, schemaVersion } from "./migrations";
import { openTestDatabase } from "./testing/node-database";

function fakeExpoDatabase() {
  return {
    execAsync: jest.fn(async () => {}),
    runAsync: jest.fn(async () => ({ changes: 1, lastInsertRowId: 1 })),
    getAllAsync: jest.fn(async () => [{ id: "a" }]),
    getFirstAsync: jest.fn(async () => ({ id: "a" })),
    withTransactionAsync: jest.fn(async (task: () => Promise<void>) => {
      await task();
    }),
  };
}

describe("fromExpoSQLite", () => {
  test("passes each operation to expo-sqlite with its parameters", async () => {
    const expo = fakeExpoDatabase();
    const db = fromExpoSQLite(expo as unknown as ExpoSQLiteDatabase);

    await db.execute("CREATE TABLE t (id TEXT)");
    await db.run("INSERT INTO t VALUES (?)", ["a"]);
    const all = await db.all("SELECT id FROM t WHERE id = ?", ["a"]);
    const first = await db.first("SELECT id FROM t");

    expect(expo.execAsync).toHaveBeenCalledWith("CREATE TABLE t (id TEXT)");
    expect(expo.runAsync).toHaveBeenCalledWith("INSERT INTO t VALUES (?)", [
      "a",
    ]);
    expect(expo.getAllAsync).toHaveBeenCalledWith(
      "SELECT id FROM t WHERE id = ?",
      ["a"],
    );
    expect(expo.getFirstAsync).toHaveBeenCalledWith("SELECT id FROM t", []);
    expect(all).toEqual([{ id: "a" }]);
    expect(first).toEqual({ id: "a" });
  });

  test("runs a statement without parameters", async () => {
    const expo = fakeExpoDatabase();
    const db = fromExpoSQLite(expo as unknown as ExpoSQLiteDatabase);

    await db.run("DELETE FROM t");

    expect(expo.runAsync).toHaveBeenCalledWith("DELETE FROM t", []);
  });

  test("runs the task inside an expo-sqlite transaction", async () => {
    const expo = fakeExpoDatabase();
    const db = fromExpoSQLite(expo as unknown as ExpoSQLiteDatabase);
    const task = jest.fn(async () => {});

    await db.transaction(task);

    expect(expo.withTransactionAsync).toHaveBeenCalledWith(task);
    expect(task).toHaveBeenCalled();
  });
});

describe("prepareDatabase", () => {
  test("enforces the foreign keys and migrates the schema", async () => {
    const db = openTestDatabase();
    await db.execute("PRAGMA foreign_keys = OFF");

    await prepareDatabase(db);

    const [pragma] = await db.all<{ foreign_keys: number }>(
      "PRAGMA foreign_keys",
    );
    expect(pragma.foreign_keys).toBe(1);
    expect(await schemaVersion(db)).toBe(MIGRATIONS.length);
    db.close();
  });
});

import { MIGRATIONS, migrate, schemaVersion } from "./migrations";
import { openTestDatabase, type TestDatabase } from "./testing/node-database";

let db: TestDatabase;

beforeEach(() => {
  db = openTestDatabase();
});

afterEach(() => {
  db.close();
});

async function tables(): Promise<string[]> {
  const rows = await db.all<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
  );
  return rows.map((row) => row.name);
}

describe("schemaVersion", () => {
  test("a new database is at version 0", async () => {
    expect(await schemaVersion(db)).toBe(0);
  });
});

describe("migrate", () => {
  test("creates the tables of the model on a new database", async () => {
    await migrate(db);

    expect(await tables()).toEqual([
      "entries",
      "habit_versions",
      "habits",
      "reminders",
    ]);
    expect(await schemaVersion(db)).toBe(MIGRATIONS.length);
  });

  test("does nothing on a database that is already up to date", async () => {
    await migrate(db);
    await db.run(
      "INSERT INTO habits (id, name, type, created_on) VALUES ('h', 'Read', 'boolean', '2026-11-01')",
    );

    await migrate(db);

    expect(await db.all("SELECT id FROM habits")).toEqual([{ id: "h" }]);
    expect(await schemaVersion(db)).toBe(MIGRATIONS.length);
  });

  test("applies only the migrations that are missing, in order", async () => {
    const first = "CREATE TABLE a (x INTEGER); INSERT INTO a VALUES (1);";
    const second =
      "ALTER TABLE a ADD COLUMN y INTEGER; UPDATE a SET y = x + 1;";
    await migrate(db, [first]);

    await migrate(db, [first, second]);

    expect(await db.all("SELECT x, y FROM a")).toEqual([{ x: 1, y: 2 }]);
    expect(await schemaVersion(db)).toBe(2);
  });

  test("a failed migration changes nothing and keeps the previous version", async () => {
    const first = "CREATE TABLE a (x INTEGER);";
    const broken =
      "CREATE TABLE b (x INTEGER); INSERT INTO missing VALUES (1);";
    await migrate(db, [first]);

    await expect(migrate(db, [first, broken])).rejects.toThrow();

    expect(await tables()).toEqual(["a"]);
    expect(await schemaVersion(db)).toBe(1);
  });

  test("refuses a database created by a newer version of the app", async () => {
    await db.execute("PRAGMA user_version = 99");

    await expect(migrate(db)).rejects.toThrow("newer than this app");
  });
});

describe("schema", () => {
  beforeEach(async () => {
    await migrate(db);
    await db.run(
      "INSERT INTO habits (id, name, type, created_on) VALUES ('h', 'Read', 'boolean', '2026-11-01')",
    );
  });

  test("a new row is pending synchronization, not deleted and without server date", async () => {
    expect(
      await db.first("SELECT updated_at, deleted, pending_sync FROM habits"),
    ).toEqual({ updated_at: null, deleted: 0, pending_sync: 1 });
  });

  test.each([
    [
      "a habit of an unknown type",
      "INSERT INTO habits (id, name, type, created_on) VALUES ('x', 'X', 'weekly', '2026-11-01')",
    ],
    [
      "a version with no scheduled days",
      "INSERT INTO habit_versions (id, habit_id, effective_from, scheduled_days) VALUES ('v', 'h', '2026-11-01', 0)",
    ],
    [
      "a negative entry",
      "INSERT INTO entries (id, habit_id, date, value) VALUES ('e', 'h', '2026-11-01', -1)",
    ],
    [
      "a row of a habit that does not exist",
      "INSERT INTO reminders (id, habit_id, time) VALUES ('r', 'missing', '08:00')",
    ],
    [
      "a value of the wrong type",
      "INSERT INTO entries (id, habit_id, date, value) VALUES ('e', 'h', '2026-11-01', 'many')",
    ],
  ])("rejects %s", async (_case, sql) => {
    await expect(db.run(sql)).rejects.toThrow();
  });

  test("rejects two live rows with the same natural key, but not after deleting one", async () => {
    const insert = (id: string) =>
      db.run(
        "INSERT INTO reminders (id, habit_id, time) VALUES (?, 'h', '08:00')",
        [id],
      );
    await insert("r1");

    await expect(insert("r2")).rejects.toThrow();

    await db.run("UPDATE reminders SET deleted = 1 WHERE id = 'r1'");
    await expect(insert("r2")).resolves.toBeUndefined();
  });
});

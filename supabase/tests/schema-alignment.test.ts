// The schema exists twice, on the device (src/data/migrations.ts) and in the cloud
// (supabase/migrations), and both must have the same columns (ADR-0004, ADR-0015).
// It needs the local Supabase database and psql, so it only runs in the CI
// (`npm run test:schema`), never with `npm test`.

import { execFileSync } from "node:child_process";

import { migrate } from "@/data/migrations";
import { openTestDatabase } from "@/data/testing/node-database";

const DATABASE_URL =
  process.env.SUPABASE_DB_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

/** Columns that exist on one side only, on purpose. */
const ONLY_ON_DEVICE = ["pending_sync"];
const ONLY_IN_CLOUD = ["user_id"];

/** Columns that are optional on the device and required in the cloud, on purpose. */
const NULLABLE_ONLY_ON_DEVICE = [
  // Assigned by the server: null until the row has been uploaded.
  "updated_at",
];

/** For each table, its columns and whether each one accepts null. */
type Schema = Record<string, Record<string, boolean>>;

async function deviceSchema(): Promise<Schema> {
  const db = openTestDatabase();
  try {
    await migrate(db);
    const tables = await db.all<{ name: string }>(
      "SELECT name FROM sqlite_schema WHERE type = 'table'",
    );
    const schema: Schema = {};
    for (const { name } of tables) {
      const columns = await db.all<{ name: string; notnull: number }>(
        `PRAGMA table_info(${name})`,
      );
      schema[name] = Object.fromEntries(
        columns
          .filter((column) => !ONLY_ON_DEVICE.includes(column.name))
          .map((column) => [
            column.name,
            column.notnull === 0 &&
              !NULLABLE_ONLY_ON_DEVICE.includes(column.name),
          ]),
      );
    }
    return schema;
  } finally {
    db.close();
  }
}

function cloudSchema(): Schema {
  const output = execFileSync(
    "psql",
    [
      DATABASE_URL,
      "--no-psqlrc",
      "--tuples-only",
      "--no-align",
      "--field-separator=,",
      "--command",
      "SELECT table_name, column_name, is_nullable FROM information_schema.columns " +
        "WHERE table_schema = 'public'",
    ],
    { encoding: "utf8" },
  );
  const schema: Schema = {};
  for (const line of output.split("\n").filter(Boolean)) {
    const [table, column, nullable] = line.trim().split(",");
    if (ONLY_IN_CLOUD.includes(column)) continue;
    schema[table] ??= {};
    schema[table][column] = nullable === "YES";
  }
  return schema;
}

test("the cloud has the same tables and columns as the device", async () => {
  expect(cloudSchema()).toEqual(await deviceSchema());
});

import type { Database } from "./database";
import { openTestDatabase, type TestDatabase } from "./testing/node-database";

let db: TestDatabase;

const values = async (from: Database = db) =>
  (await from.all<{ v: string }>("SELECT v FROM t ORDER BY v")).map((r) => r.v);

/** A promise that the test resolves by hand, to hold a transaction open. */
function gate() {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { open, opened };
}

beforeEach(async () => {
  db = openTestDatabase();
  await db.execute("CREATE TABLE t (v TEXT NOT NULL UNIQUE)");
});

afterEach(() => {
  db.close();
});

describe("serializedDatabase", () => {
  test("a write sent during a transaction that fails is not lost with it", async () => {
    const { open, opened } = gate();

    const failed = db.transaction(async (tx) => {
      await tx.run("INSERT INTO t VALUES ('in transaction')");
      await opened;
      throw new Error("rolled back");
    });
    const write = db.run("INSERT INTO t VALUES ('tap')");
    open();

    await expect(failed).rejects.toThrow("rolled back");
    await write;
    expect(await values()).toEqual(["tap"]);
  });

  test("two transactions at once run one after the other", async () => {
    const log: string[] = [];
    const { open, opened } = gate();

    const first = db.transaction(async (tx) => {
      log.push("first starts");
      await tx.run("INSERT INTO t VALUES ('a')");
      await opened;
      log.push("first ends");
    });
    const second = db.transaction(async (tx) => {
      log.push("second starts");
      await tx.run("INSERT INTO t VALUES ('b')");
    });
    open();
    await Promise.all([first, second]);

    expect(log).toEqual(["first starts", "first ends", "second starts"]);
    expect(await values()).toEqual(["a", "b"]);
  });

  test("a read waits for the transaction, and sees only what it kept", async () => {
    const { open, opened } = gate();

    const failed = db.transaction(async (tx) => {
      await tx.run("INSERT INTO t VALUES ('uncommitted')");
      await opened;
      throw new Error("rolled back");
    });
    const all = values();
    const first = db.first<{ v: string }>("SELECT v FROM t");
    open();

    await expect(failed).rejects.toThrow();
    expect(await all).toEqual([]);
    expect(await first).toBeNull();
  });

  test("an operation that fails does not stop the next ones", async () => {
    const failed = db.execute("NOT SQL");
    const next = db.run("INSERT INTO t VALUES ('a')");

    await expect(failed).rejects.toThrow();
    await next;
    expect(await values()).toEqual(["a"]);
  });

  test("inside a transaction, every operation is part of it", async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.execute("INSERT INTO t VALUES ('a')");
        await tx.run("INSERT INTO t VALUES ('b')");
        expect(await values(tx)).toEqual(["a", "b"]);
        expect(await tx.first("SELECT v FROM t")).toEqual({ v: "a" });
        throw new Error("rolled back");
      }),
    ).rejects.toThrow("rolled back");

    expect(await values()).toEqual([]);
  });

  test("a transaction inside a transaction joins it", async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.transaction(async (inner) => {
          await inner.run("INSERT INTO t VALUES ('a')");
        });
        throw new Error("rolled back");
      }),
    ).rejects.toThrow("rolled back");

    expect(await values()).toEqual([]);
  });
});

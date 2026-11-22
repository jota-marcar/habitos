// One connection, one thing at a time. A transaction of expo-sqlite is not isolated from the
// rest of the app: a statement sent while it is open becomes part of it, and is lost if it
// rolls back, and a second transaction fails. So every operation waits for its turn here.

import type { Database, SqlValue } from "./database";

/** The operations of a connection, which by themselves keep no order between their callers. */
export interface Connection extends Omit<Database, "transaction"> {
  transaction(task: () => Promise<void>): Promise<void>;
}

/** The Database of `connection`, running its operations one after another. */
export function serializedDatabase(connection: Connection): Database {
  let tail: Promise<unknown> = Promise.resolve();

  const inTurn = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = tail.then(operation);
    // An operation that fails is reported to its caller and does not stop the next ones.
    tail = result.catch(() => undefined);
    return result;
  };

  // What a transaction uses: it already has the turn, so waiting for it would never end.
  const inTransaction: Database = {
    execute: (sql) => connection.execute(sql),
    run: (sql, params) => connection.run(sql, params),
    all: <Row>(sql: string, params?: readonly SqlValue[]) =>
      connection.all<Row>(sql, params),
    first: <Row>(sql: string, params?: readonly SqlValue[]) =>
      connection.first<Row>(sql, params),
    transaction: (task) => task(inTransaction),
  };

  return {
    execute: (sql) => inTurn(() => connection.execute(sql)),
    run: (sql, params) => inTurn(() => connection.run(sql, params)),
    all: <Row>(sql: string, params?: readonly SqlValue[]) =>
      inTurn(() => connection.all<Row>(sql, params)),
    first: <Row>(sql: string, params?: readonly SqlValue[]) =>
      inTurn(() => connection.first<Row>(sql, params)),
    transaction: (task) =>
      inTurn(() => connection.transaction(() => task(inTransaction))),
  };
}

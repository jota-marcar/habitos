// The part of the SQLite module built into Node that the tests use.
// It is declared here instead of adding the Node types to the project, which would let the
// app code use APIs that do not exist on the device.

declare module "node:sqlite" {
  type Value = string | number | bigint | Uint8Array | null;

  interface Statement {
    run(...params: Value[]): unknown;
    all(...params: Value[]): Record<string, Value>[];
  }

  export class DatabaseSync {
    constructor(path: string);
    exec(sql: string): void;
    prepare(sql: string): Statement;
    close(): void;
  }
}

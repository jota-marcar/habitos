// The part of the child process module of Node that the schema tests use.
// It is declared here instead of adding the Node types to the project, which would let the
// app code use APIs that do not exist on the device (same as src/data/testing/node-sqlite.d.ts).

declare module "node:child_process" {
  export function execFileSync(
    file: string,
    args: readonly string[],
    options: { encoding: "utf8" },
  ): string;
}

/**
 * @jest-environment node
 */
// What Jest really selects, asked to Jest itself: the patterns of jest.config.js depend on the
// operating system and on the folder of the checkout, so reading the config would prove nothing.
// In JavaScript, like the config: the project has no types for the modules of Node.
/* global __dirname */

import { beforeAll, expect, jest, test } from "@jest/globals";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
// Ignored by Git, so an interrupted run leaves nothing to commit.
const IGNORED_FOLDER = path.join(ROOT, ".expo");

jest.setTimeout(60_000);

let listedTests = [];
let testOutsideRoots = "";

beforeAll(() => {
  // A test outside src and supabase, like those of a worktree nested in this checkout. It is
  // created here because the CI has no nested worktrees to prove anything with.
  fs.mkdirSync(IGNORED_FOLDER, { recursive: true });
  const folder = fs.mkdtempSync(path.join(IGNORED_FOLDER, "jest-config-"));
  testOutsideRoots = path.join(folder, "src", "nested.test.js");
  fs.mkdirSync(path.dirname(testOutsideRoots));
  fs.writeFileSync(testOutsideRoots, "");

  try {
    const output = execFileSync(
      process.execPath,
      [require.resolve("jest/bin/jest"), "--listTests", "--json"],
      { cwd: ROOT, encoding: "utf8" },
    );
    listedTests = JSON.parse(output);
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
});

test("leaves out the tests outside src and supabase, like a nested worktree", () => {
  expect(listedTests).not.toContain(testOutsideRoots);
});

test("only lists tests of this checkout", () => {
  const roots = ["src", "supabase"].map(
    (folder) => path.join(ROOT, folder) + path.sep,
  );

  expect(
    listedTests.filter((file) => !roots.some((root) => file.startsWith(root))),
  ).toEqual([]);
});

test("leaves out the tests that need the local Supabase", () => {
  const supabaseTests = `${path.sep}supabase${path.sep}tests${path.sep}`;

  expect(listedTests.filter((file) => file.includes(supabaseTests))).toEqual(
    [],
  );
});

test("keeps the tests of the Edge Functions", () => {
  const functions = path.join(ROOT, "supabase", "functions") + path.sep;

  expect(listedTests.some((file) => file.startsWith(functions))).toBe(true);
});

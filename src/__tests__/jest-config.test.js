/**
 * @jest-environment node
 */
// What Jest really selects, asked to Jest itself: the patterns of jest.config.js depend on the
// operating system and on the folder of the checkout, so reading the config would prove nothing.
// In JavaScript, like the config: the project has no types for the modules of Node.
/* global __dirname */

import { beforeAll, expect, jest, test } from "@jest/globals";
import { execFileSync } from "node:child_process";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");

jest.setTimeout(60_000);

let listedTests = [];

beforeAll(() => {
  const output = execFileSync(
    process.execPath,
    [require.resolve("jest/bin/jest"), "--listTests", "--json"],
    { cwd: ROOT, encoding: "utf8" },
  );
  listedTests = JSON.parse(output);
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

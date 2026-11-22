/**
 * @jest-environment node
 */
// The hook that keeps commits and pushes away from main, run for real on a throwaway repository.
// In JavaScript, like the hook: the project has no types for the modules of Node.
/* global __dirname */

import {
  afterAll,
  beforeAll,
  describe,
  expect,
  jest,
  test,
} from "@jest/globals";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const HOOK = path.resolve(__dirname, "../../.claude/hooks/protect-main.mjs");
const BLOCKED = 2;
const ALLOWED = 0;

jest.setTimeout(30_000);

let repo;

const git = (...args) =>
  execFileSync("git", args, { cwd: repo, stdio: "pipe" });

function exitCodeOf(command) {
  return spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ tool_input: { command }, cwd: repo }),
    encoding: "utf8",
  }).status;
}

beforeAll(() => {
  repo = mkdtempSync(path.join(tmpdir(), "protect-main-"));
  git("init", "--quiet", "--initial-branch=main");
  git("config", "user.email", "test@example.test");
  git("config", "user.name", "Test");
  writeFileSync(path.join(repo, "file.txt"), "base\n");
  git("add", ".");
  git("commit", "--quiet", "-m", "base");
  git("branch", "feat/work");
});

afterAll(() => rmSync(repo, { recursive: true, force: true }));

describe("on main", () => {
  beforeAll(() => git("switch", "--quiet", "main"));

  test.each([
    "git commit -m change",
    "git push",
    "git push origin",
    "git push origin main",
    "git push -u origin main",
    "git push origin HEAD",
    "git push -u origin HEAD",
    "git push --force origin +main",
    "git push origin HEAD:main",
    "git push origin HEAD:refs/heads/main",
    "git push origin :main",
    "git status && git push origin HEAD",
  ])("blocks %s", (command) => {
    expect(exitCodeOf(command)).toBe(BLOCKED);
  });

  test.each([
    "git status",
    "git log --oneline",
    "git push origin feat/work",
    "git push origin main:feat/copy",
  ])("allows %s", (command) => {
    expect(exitCodeOf(command)).toBe(ALLOWED);
  });
});

describe("on another branch", () => {
  beforeAll(() => git("switch", "--quiet", "feat/work"));

  test.each([
    "git commit -m change",
    "git push",
    "git push origin HEAD",
    "git push -u origin HEAD",
    "git push -u origin feat/work",
    "git push --force-with-lease origin feat/work",
  ])("allows %s", (command) => {
    expect(exitCodeOf(command)).toBe(ALLOWED);
  });

  test.each([
    "git push origin main",
    "git push origin HEAD:main",
    "git push origin feat/work:refs/heads/main",
    "git push --all origin",
    "git push --mirror origin",
  ])("blocks %s", (command) => {
    expect(exitCodeOf(command)).toBe(BLOCKED);
  });
});

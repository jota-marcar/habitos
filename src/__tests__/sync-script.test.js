/**
 * @jest-environment node
 */
// The script of /sync, run for real on throwaway repositories, with a stub that answers for
// GitHub: what it deletes after a squash merge.
// In JavaScript, like the script: the project has no types for the modules of Node.
/* global __dirname */

import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const SCRIPT = path.resolve(__dirname, "../../.claude/skills/sync/sync.mjs");
const BRANCH = "fix/work";

jest.setTimeout(60_000);

// Lists the Pull Requests kept in pull-requests.json, as `gh pr list` does.
const GH_STUB = `
const { readFileSync } = require("node:fs");
const path = require("node:path");
const prs = JSON.parse(readFileSync(path.join(__dirname, "pull-requests.json"), "utf8"));
const args = process.argv.slice(2);
const head = args.indexOf("--head");
if (head !== -1) {
  const pr = prs[args[head + 1]];
  console.log(JSON.stringify(pr ? [pr] : []));
} else {
  for (const pr of Object.values(prs)) {
    if (pr.state === "MERGED") console.log(pr.headRefOid);
  }
}
`;

let root;
let clone;

const git = (...args) =>
  execFileSync("git", args, {
    cwd: clone,
    encoding: "utf8",
    stdio: "pipe",
  }).trim();

function commit(file, text, message) {
  writeFileSync(path.join(clone, file), text);
  git("add", ".");
  git("commit", "--quiet", "-m", message);
}

function setPullRequest(state, headRefOid) {
  writeFileSync(
    path.join(root, "pull-requests.json"),
    JSON.stringify({ [BRANCH]: { state, headRefOid } }),
  );
}

function runSync() {
  const result = spawnSync(process.execPath, [SCRIPT], {
    cwd: clone,
    encoding: "utf8",
    env: { ...process.env, SYNC_GH_STUB: path.join(root, "gh-stub.cjs") },
  });
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
  return result.stdout;
}

const localBranches = () =>
  git("branch", "--format=%(refname:short)").split("\n");

/** Pushes a branch with one commit and merges it with a squash, as GitHub does. */
function mergeBranchWithSquash() {
  git("switch", "--quiet", "-c", BRANCH);
  commit("work.txt", "work\n", "the work of the Pull Request");
  git("push", "--quiet", "origin", BRANCH);
  const tip = git("rev-parse", "HEAD");

  git("switch", "--quiet", "main");
  git("merge", "--quiet", "--squash", BRANCH);
  git("commit", "--quiet", "-m", "fix: the work (#1)");
  git("push", "--quiet", "origin", "main");
  git("push", "--quiet", "origin", "--delete", BRANCH);
  // The local main goes back: it is /sync that brings it up to date.
  git("reset", "--quiet", "--hard", "HEAD~1");
  git("switch", "--quiet", BRANCH);
  return tip;
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "sync-script-"));
  clone = path.join(root, "clone");
  writeFileSync(path.join(root, "gh-stub.cjs"), GH_STUB);
  writeFileSync(path.join(root, "pull-requests.json"), "{}");
  execFileSync("git", [
    "init",
    "--quiet",
    "--bare",
    "--initial-branch=main",
    path.join(root, "origin.git"),
  ]);
  execFileSync(
    "git",
    ["clone", "--quiet", path.join(root, "origin.git"), clone],
    { stdio: "pipe" },
  );
  git("config", "user.email", "test@example.test");
  git("config", "user.name", "Test");
  git("config", "core.autocrlf", "false");
  git("switch", "--quiet", "-C", "main");
  commit("file.txt", "base\n", "base");
  git("push", "--quiet", "-u", "origin", "main");
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

test("deletes a merged branch with nothing else in it", () => {
  setPullRequest("MERGED", mergeBranchWithSquash());

  const output = runSync();

  expect(output).toContain(`Deleted branches: ${BRANCH}`);
  expect(localBranches()).toEqual(["main"]);
});

test("keeps a merged branch with commits that never reached its Pull Request", () => {
  setPullRequest("MERGED", mergeBranchWithSquash());
  commit("later.txt", "later\n", "work after the merge");
  const unpushed = git("rev-parse", "HEAD");

  const output = runSync();

  expect(output).toContain("Deleted branches: none");
  expect(output).toContain("commits that are not in its Pull Request");
  expect(git("rev-parse", BRANCH)).toBe(unpushed);
});

test("keeps a branch whose Pull Request is still open", () => {
  git("switch", "--quiet", "-c", BRANCH);
  commit("work.txt", "work\n", "the work");
  git("push", "--quiet", "origin", BRANCH);
  setPullRequest("OPEN", git("rev-parse", "HEAD"));

  const output = runSync();

  expect(output).toContain(`${BRANCH} (its Pull Request is OPEN)`);
  expect(localBranches()).toContain(BRANCH);
});

test("keeps a branch without a Pull Request", () => {
  git("switch", "--quiet", "-c", BRANCH);
  commit("work.txt", "work\n", "the work");

  const output = runSync();

  expect(output).toContain(`${BRANCH} (no Pull Request found)`);
  expect(localBranches()).toContain(BRANCH);
});

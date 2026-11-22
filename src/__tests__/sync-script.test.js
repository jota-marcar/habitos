/**
 * @jest-environment node
 */
// The script of /sync, run for real on throwaway repositories, with a stub that answers for
// GitHub: what it deletes after a squash merge.
// In JavaScript, like the script: the project has no types for the modules of Node.
/* global __dirname */

import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";
import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
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

const gitIn = (cwd, ...args) =>
  execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: "pipe",
  }).trim();

const git = (...args) => gitIn(clone, ...args);

function commit(file, text, message, cwd = clone) {
  writeFileSync(path.join(cwd, file), text);
  gitIn(cwd, "add", ".");
  gitIn(cwd, "commit", "--quiet", "-m", message);
}

function setPullRequest(state, headRefOid) {
  writeFileSync(
    path.join(root, "pull-requests.json"),
    JSON.stringify({ [BRANCH]: { state, headRefOid } }),
  );
}

const spawnSyncScript = (cwd) =>
  spawnSync(process.execPath, [SCRIPT], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, SYNC_GH_STUB: path.join(root, "gh-stub.cjs") },
  });

function runSync(cwd = clone) {
  const result = spawnSyncScript(cwd);
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
  return result.stdout;
}

const localBranches = () =>
  git("branch", "--format=%(refname:short)").split("\n");

/** Opens a new branch in its own worktree, next to the clone. */
function addWorktree(name, branch, startPoint = "main") {
  const directory = path.join(root, name);
  git("worktree", "add", "--quiet", "-b", branch, directory, startPoint);
  return directory;
}

/** Puts a new commit in origin/main and leaves the local main behind it. */
function advanceOriginMain() {
  commit("remote.txt", "remote\n", "feat: merged on GitHub (#2)");
  git("push", "--quiet", "origin", "main");
  const tip = git("rev-parse", "HEAD");
  git("reset", "--quiet", "--hard", "HEAD~1");
  return tip;
}

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

test("stops, changing nothing, if the local main has commits that are not in origin", () => {
  commit("local.txt", "local\n", "a commit that never reached origin");
  const localTip = git("rev-parse", "main");

  const result = spawnSyncScript(clone);

  expect(result.status).toBe(1);
  expect(result.stdout).toContain("BLOCKER");
  expect(git("rev-parse", "main")).toBe(localTip);
});

test("from a worktree, updates main where it is open and follows it if the branch has no commits", () => {
  const worktree = addWorktree("tree", "claude/tree");
  const tip = advanceOriginMain();

  const output = runSync(worktree);

  expect(output).toContain("main updated with:");
  expect(git("rev-parse", "main")).toBe(tip);
  expect(git("status", "--porcelain")).toBe("");
  expect(existsSync(path.join(clone, "remote.txt"))).toBe(true);
  expect(gitIn(worktree, "rev-parse", "--abbrev-ref", "HEAD")).toBe(
    "claude/tree",
  );
  expect(gitIn(worktree, "rev-parse", "HEAD")).toBe(tip);
});

test("from a worktree, leaves its branch where it is if it has commits of its own", () => {
  const worktree = addWorktree("tree", "claude/tree");
  commit("own.txt", "own\n", "work of the worktree", worktree);
  const ownTip = gitIn(worktree, "rev-parse", "HEAD");
  const tip = advanceOriginMain();

  const output = runSync(worktree);

  expect(output).toContain("claude/tree has commits of its own");
  expect(git("rev-parse", "main")).toBe(tip);
  expect(gitIn(worktree, "rev-parse", "HEAD")).toBe(ownTip);
});

test("from a worktree, updates main without opening it if no checkout holds it", () => {
  const worktree = addWorktree("tree", "claude/tree");
  const tip = advanceOriginMain();
  git("switch", "--quiet", "-c", "fix/primary");

  runSync(worktree);

  expect(git("rev-parse", "main")).toBe(tip);
  expect(git("rev-parse", "--abbrev-ref", "HEAD")).toBe("fix/primary");
  expect(gitIn(worktree, "rev-parse", "--abbrev-ref", "HEAD")).toBe(
    "claude/tree",
  );
});

test("from a worktree, stops and changes nothing if the checkout of main has uncommitted changes", () => {
  const worktree = addWorktree("tree", "claude/tree");
  const oldMain = git("rev-parse", "main");
  advanceOriginMain();
  writeFileSync(path.join(clone, "file.txt"), "work in progress\n");

  const result = spawnSyncScript(worktree);

  expect(result.status).toBe(1);
  expect(result.stdout).toContain("BLOCKER");
  expect(result.stdout).toContain("uncommitted changes");
  expect(result.stdout).toContain("file.txt");
  expect(git("rev-parse", "main")).toBe(oldMain);
  expect(gitIn(worktree, "rev-parse", "HEAD")).toBe(oldMain);
  expect(readFileSync(path.join(clone, "file.txt"), "utf8")).toBe(
    "work in progress\n",
  );
});

test("never rebases or deletes a branch open in another worktree", () => {
  const mergedTip = mergeBranchWithSquash();
  setPullRequest("MERGED", mergedTip);
  git("switch", "--quiet", "main");
  const mergedTree = path.join(root, "merged-tree");
  git("worktree", "add", "--quiet", mergedTree, BRANCH);
  const stackedTree = addWorktree("stacked-tree", "fix/stacked", mergedTip);
  commit("stacked.txt", "stacked\n", "work on top", stackedTree);
  const stackedTip = gitIn(stackedTree, "rev-parse", "HEAD");
  const worktree = addWorktree("tree", "claude/tree");

  const output = runSync(worktree);

  expect(output).toContain(`${BRANCH} (open in another worktree)`);
  expect(output).toContain("fix/stacked (open in another worktree)");
  expect(git("rev-parse", BRANCH)).toBe(mergedTip);
  expect(git("rev-parse", "fix/stacked")).toBe(stackedTip);
});

test("does not touch a branch that is in the middle of a rebase in another worktree", () => {
  git("branch", "fix/conflict");
  const rebasing = addWorktree("rebasing-tree", "fix/rebasing");
  commit("file.txt", "one side\n", "one side", rebasing);
  const rebasingTip = gitIn(rebasing, "rev-parse", "HEAD");
  const conflict = addWorktree("conflict-tree", "fix/other", "fix/conflict");
  commit("file.txt", "other side\n", "other side", conflict);
  spawnSync("git", ["rebase", "fix/other"], { cwd: rebasing, stdio: "pipe" });
  const worktree = addWorktree("tree", "claude/tree");

  const output = runSync(worktree);

  expect(output).toContain("fix/rebasing (open in another worktree)");
  expect(git("rev-parse", "fix/rebasing")).toBe(rebasingTip);
  expect(gitIn(rebasing, "status")).toContain("rebase in progress");
});

test("does not replay a branch stacked on one that is open in another worktree", () => {
  const mergedTip = mergeBranchWithSquash();
  setPullRequest("MERGED", mergedTip);
  git("switch", "--quiet", "main");
  const lowerTree = addWorktree("lower-tree", "fix/lower", mergedTip);
  commit("lower.txt", "lower\n", "the branch below", lowerTree);
  git("branch", "fix/upper", "fix/lower");
  const upperTree = path.join(root, "upper-tree");
  git("worktree", "add", "--quiet", upperTree, "fix/upper");
  commit("upper.txt", "upper\n", "the branch above", upperTree);
  const upperTip = gitIn(upperTree, "rev-parse", "HEAD");
  git("worktree", "remove", upperTree);
  const worktree = addWorktree("tree", "claude/tree");

  const output = runSync(worktree);

  expect(output).toContain("fix/upper: stacked on fix/lower");
  expect(git("rev-parse", "fix/upper")).toBe(upperTip);
  expect(gitIn(worktree, "rev-parse", "--abbrev-ref", "HEAD")).toBe(
    "claude/tree",
  );
});

test("from a worktree, restacks a free branch and goes back to its own", () => {
  const mergedTip = mergeBranchWithSquash();
  setPullRequest("MERGED", mergedTip);
  git("switch", "--quiet", "main");
  git("branch", "fix/stacked", mergedTip);
  const stackedTree = path.join(root, "stacked-tree");
  git("worktree", "add", "--quiet", stackedTree, "fix/stacked");
  commit("stacked.txt", "stacked\n", "work on top", stackedTree);
  git("worktree", "remove", stackedTree);
  const worktree = addWorktree("tree", "claude/tree");

  runSync(worktree);

  expect(git("rev-parse", "fix/stacked~1")).toBe(
    git("rev-parse", "origin/main"),
  );
  expect(gitIn(worktree, "rev-parse", "--abbrev-ref", "HEAD")).toBe(
    "claude/tree",
  );
});

test("from a worktree, deletes a merged branch that no worktree holds", () => {
  setPullRequest("MERGED", mergeBranchWithSquash());
  git("switch", "--quiet", "main");
  const worktree = addWorktree("tree", "claude/tree");

  const output = runSync(worktree);

  expect(output).toContain(`Deleted branches: ${BRANCH}`);
  expect(output).toContain("claude/tree (open in this worktree)");
  expect(localBranches()).not.toContain(BRANCH);
});

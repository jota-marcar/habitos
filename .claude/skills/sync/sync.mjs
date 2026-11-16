#!/usr/bin/env node
// Brings the local repository up to date after a Pull Request has been merged:
// updates main, moves the branches stacked on a merged Pull Request onto main
// and deletes the local branches whose Pull Request is merged.
// Usage: node .claude/skills/sync/sync.mjs
// Exits with code 1, changing nothing, if there are uncommitted changes.

import { execFileSync, execSync } from "node:child_process";
import { existsSync } from "node:fs";

const BASE = "main";
const GH_WINDOWS = "C:/Program Files/GitHub CLI/gh.exe";

function run(command, args) {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function attempt(fn) {
  try {
    return fn();
  } catch {
    return null;
  }
}

const git = (...args) => run("git", args);

function ghPath() {
  if (attempt(() => run("gh", ["--version"])) !== null) return "gh";
  return existsSync(GH_WINDOWS) ? GH_WINDOWS : null;
}

const uncommitted = git("status", "--porcelain");
if (uncommitted) {
  console.log(
    "BLOCKER: there are uncommitted changes. Commit or discard them first:",
  );
  console.log(uncommitted);
  process.exit(1);
}

const startedOn = git("rev-parse", "--abbrev-ref", "HEAD");
git("fetch", "--quiet", "--prune", "origin");

if (startedOn !== BASE) git("switch", "--quiet", BASE);
const before = git("rev-parse", "HEAD");
git("pull", "--quiet", "--ff-only", "origin", BASE);
const after = git("rev-parse", "HEAD");

console.log(`Branch: ${BASE} (was on ${startedOn})`);
if (before === after) {
  console.log(`${BASE} was already up to date.`);
} else {
  console.log(`${BASE} updated with:`);
  console.log(git("log", "--format=  - %s", `${before}..${after}`));
}

// A squash merge leaves no trace in git that the branch was merged, so GitHub is asked.
const gh = ghPath();
const branches = git("branch", "--format=%(refname:short)")
  .split("\n")
  .filter((branch) => branch && branch !== BASE);

const prState = (branch) =>
  gh
    ? attempt(() =>
        run(gh, [
          "pr",
          "list",
          "--head",
          branch,
          "--state",
          "all",
          "--json",
          "state",
          "--jq",
          ".[0].state",
        ]),
      )
    : null;

const isAncestor = (commit, branch) =>
  attempt(() => git("merge-base", "--is-ancestor", commit, branch)) !== null;
const countCommits = (range) => Number(git("rev-list", "--count", range));

// Restack. A branch created on top of another one carries that branch's
// commits. After a squash merge, main holds the same code in a different
// commit, so `git merge origin/main` conflicts. Replaying only the branch's own
// commits (`git rebase --onto`) does not. The tips of the merged Pull Requests
// come from GitHub, so it works even if those local branches are already gone.
const restacked = [];
const restackProblems = [];
const mergedTips = gh
  ? (
      attempt(() =>
        run(gh, [
          "pr",
          "list",
          "--state",
          "merged",
          "--base",
          BASE,
          "--limit",
          "50",
          "--json",
          "headRefOid",
          "--jq",
          ".[].headRefOid",
        ]),
      ) ?? ""
    )
      .split("\n")
      .filter(Boolean)
  : [];

// Old base -> new base. A branch stacked on a restacked branch follows it.
const moves = new Map(mergedTips.map((tip) => [tip, `origin/${BASE}`]));
// Stacked branches have more history than the branch below them, so sorting by
// history length restacks the lower branch first.
const candidates = branches
  .filter((branch) => prState(branch) !== "MERGED")
  .sort((a, b) => countCommits(a) - countCommits(b));

for (const branch of candidates) {
  const oldTip = git("rev-parse", branch);
  const bases = [...moves.keys()].filter(
    (base) => base !== oldTip && isAncestor(base, branch),
  );
  if (bases.length === 0) continue;
  // The closest base is the one with the most history behind it.
  const oldBase = bases.reduce((a, b) =>
    countCommits(b) > countCommits(a) ? b : a,
  );
  const newBase = moves.get(oldBase);

  if (
    attempt(() => git("rebase", "--onto", newBase, oldBase, branch)) === null
  ) {
    attempt(() => git("rebase", "--abort"));
    restackProblems.push(
      `${branch}: conflicts while replaying its commits, left untouched`,
    );
    continue;
  }
  moves.set(oldTip, git("rev-parse", branch));

  let verifyError = null;
  try {
    execSync("npm run verify", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    verifyError = `${error.stdout ?? ""}\n${error.stderr ?? ""}`
      .split("\n")
      .filter((line) => /error|fail|✖/i.test(line))
      .slice(0, 5)
      .join(" | ");
  }
  const remoteTip = attempt(() => git("rev-parse", `origin/${branch}`));
  const ownCommits = countCommits(`origin/${BASE}..${branch}`);
  if (verifyError !== null) {
    restackProblems.push(
      `${branch}: rebased, but npm run verify fails (${verifyError}); not pushed`,
    );
  } else if (remoteTip && remoteTip !== oldTip) {
    restackProblems.push(
      `${branch}: rebased, but it differed from origin/${branch} before; not pushed`,
    );
  } else if (remoteTip) {
    git(
      "push",
      "--quiet",
      `--force-with-lease=refs/heads/${branch}:${remoteTip}`,
      "origin",
      branch,
    );
    restacked.push(`${branch} (${ownCommits} own commit(s), pushed)`);
  } else {
    restacked.push(`${branch} (${ownCommits} own commit(s), no remote branch)`);
  }
}
if (git("rev-parse", "--abbrev-ref", "HEAD") !== BASE) {
  git("switch", "--quiet", BASE);
}

const deleted = [];
const kept = [];
for (const branch of branches) {
  const state = prState(branch);
  const pushed = attempt(() => git("rev-parse", `origin/${branch}`)) !== null;

  if (state === "MERGED" && !pushed) {
    git("branch", "-D", branch);
    deleted.push(branch);
  } else {
    const reason =
      state === "MERGED"
        ? "merged, but the remote branch still exists"
        : state
          ? `its Pull Request is ${state}`
          : "no Pull Request found";
    kept.push(`${branch} (${reason})`);
  }
}

console.log(
  `\nRestacked branches: ${restacked.length ? restacked.join(", ") : "none"}`,
);
if (restackProblems.length) {
  console.log(`RESTACK PROBLEMS: ${restackProblems.join("; ")}`);
}
console.log(
  `Deleted branches: ${deleted.length ? deleted.join(", ") : "none"}`,
);
console.log(`Kept branches: ${kept.length ? kept.join(", ") : "none"}`);
if (!gh) console.log("WARNING: GitHub CLI (gh) not found; no branch deleted.");

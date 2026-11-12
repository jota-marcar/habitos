#!/usr/bin/env node
// Brings the local repository up to date after a Pull Request has been merged:
// updates main and deletes the local branches whose Pull Request is merged.
// Usage: node .claude/skills/sync/sync.mjs
// Exits with code 1, changing nothing, if there are uncommitted changes.

import { execFileSync } from "node:child_process";
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

const deleted = [];
const kept = [];
for (const branch of branches) {
  const state = gh
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
  `\nDeleted branches: ${deleted.length ? deleted.join(", ") : "none"}`,
);
console.log(`Kept branches: ${kept.length ? kept.join(", ") : "none"}`);
if (!gh) console.log("WARNING: GitHub CLI (gh) not found; no branch deleted.");

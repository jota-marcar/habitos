#!/usr/bin/env node
// Gathers the state of the current branch to prepare a Pull Request to main.
// Usage: node .claude/skills/pr/context.mjs
// Prints a report and exits with code 1 if there is any blocker.

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

const BASE = "main";
const TYPES = [
  "feat",
  "fix",
  "refactor",
  "docs",
  "test",
  "style",
  "chore",
  "ci",
];
const GH_WINDOWS = "C:/Program Files/GitHub CLI/gh.exe";

function git(...args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

function attempt(fn) {
  try {
    return fn();
  } catch {
    return null;
  }
}

function ghPath() {
  if (
    attempt(() => execFileSync("gh", ["--version"], { stdio: "ignore" })) !==
    null
  )
    return "gh";
  return existsSync(GH_WINDOWS) ? GH_WINDOWS : null;
}

const blockers = [];
const warnings = [];

attempt(() => git("fetch", "--quiet", "origin", BASE));

const branch = git("rev-parse", "--abbrev-ref", "HEAD");
const branchType = branch.split("/")[0];
if (branch === BASE)
  blockers.push(
    `You are on ${BASE}. Create a <type>/<description> branch first.`,
  );
else if (!/^[a-z]+\/[a-z0-9-]+$/.test(branch) || !TYPES.includes(branchType)) {
  warnings.push(
    `Branch "${branch}" does not follow <type>/<description> with types ${TYPES.join(", ")}.`,
  );
}

const uncommitted = git("status", "--porcelain");
if (uncommitted)
  blockers.push("There are uncommitted changes:\n" + uncommitted);

const commits = git("log", "--format=%s", `origin/${BASE}..HEAD`)
  .split("\n")
  .filter(Boolean);
if (commits.length === 0)
  blockers.push(`The branch has no new commits compared to origin/${BASE}.`);

const behind = Number(git("rev-list", "--count", `HEAD..origin/${BASE}`));
if (behind > 0) {
  warnings.push(
    `The branch is ${behind} commit(s) behind origin/${BASE}. Update it before opening the PR.`,
  );
}

const upstream = attempt(() =>
  git("rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"),
);
const gh = ghPath();
if (!gh) blockers.push("GitHub CLI (gh) not found.");
const existingPr = gh
  ? attempt(() =>
      execFileSync(
        gh,
        [
          "pr",
          "view",
          branch,
          "--json",
          "url,state",
          "--jq",
          '.url + " (" + .state + ")"',
        ],
        {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
        },
      ).trim(),
    )
  : null;
if (existingPr)
  warnings.push(`A PR already exists for this branch: ${existingPr}`);

const stat = git("diff", "--stat", `origin/${BASE}...HEAD`);

console.log(`Branch: ${branch} (type: ${branchType})`);
console.log(`Base: origin/${BASE}`);
console.log(`Remote branch: ${upstream ?? "not pushed yet"}`);
console.log(`GitHub CLI: ${gh ?? "not found"}`);
console.log(`\nCommits (${commits.length}):`);
for (const c of commits) console.log(`  - ${c}`);
console.log(`\nFiles:\n${stat || "  (no changes)"}`);
if (warnings.length)
  console.log(`\nWARNINGS:\n${warnings.map((w) => `  - ${w}`).join("\n")}`);
if (blockers.length) {
  console.log(`\nBLOCKERS:\n${blockers.map((b) => `  - ${b}`).join("\n")}`);
  process.exit(1);
}

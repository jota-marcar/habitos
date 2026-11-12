#!/usr/bin/env node
// Waits for the CI checks of the Pull Request of the current branch and prints the result.
// Usage: node .claude/skills/pr/checks.mjs
// Exits with code 1 if a check fails or the checks never appear.

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const GH_WINDOWS = "C:/Program Files/GitHub CLI/gh.exe";
const POLL_SECONDS = 15;
// GitHub takes a few seconds to register the checks after a push.
const ATTEMPTS_TO_APPEAR = 8;
// A whole CI run takes about two minutes; this is only a guard against waiting forever.
const ATTEMPTS_TO_FINISH = 60;

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

const gh = ghPath();
if (!gh) {
  console.log("BLOCKER: GitHub CLI (gh) not found.");
  process.exit(1);
}

function view(fields) {
  const output = attempt(() =>
    execFileSync(gh, ["pr", "view", "--json", fields], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }),
  );
  return output === null ? null : JSON.parse(output);
}

const pr = view("number,url");
if (pr === null) {
  console.log("BLOCKER: the current branch has no Pull Request.");
  process.exit(1);
}

let checks = [];
let missing = 0;
for (let i = 0; i < ATTEMPTS_TO_FINISH; i++) {
  checks = view("statusCheckRollup")?.statusCheckRollup ?? [];
  if (checks.length === 0) {
    missing++;
    if (missing >= ATTEMPTS_TO_APPEAR) break;
  } else if (checks.every((check) => check.status === "COMPLETED")) {
    break;
  }
  await sleep(POLL_SECONDS * 1000);
}

console.log(`Pull Request: ${pr.url}`);
if (checks.length === 0) {
  console.log("BLOCKER: no checks were reported for this Pull Request.");
  process.exit(1);
}

for (const check of checks) {
  const result = check.status === "COMPLETED" ? check.conclusion : check.status;
  console.log(`  ${check.name}: ${result}`);
}

const state = view("mergeable,mergeStateStatus");
console.log(`Mergeable: ${state.mergeable} (${state.mergeStateStatus})`);

const failed = checks.some(
  (check) =>
    check.status !== "COMPLETED" ||
    !["SUCCESS", "SKIPPED", "NEUTRAL"].includes(check.conclusion),
);
if (failed) process.exit(1);

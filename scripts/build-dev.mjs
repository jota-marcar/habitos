#!/usr/bin/env node
// Starts a development build for the iPhone on EAS, with two guards:
// - before: refuses to build with uncommitted changes, so that what is built is what is in git;
// - after: warns if EAS CLI has rewritten app.json, which it does with values that must not
//   be committed (ADR-0008).
// Usage: npm run build:dev            builds
//        npm run build:dev -- --check only runs the guards

import { execFileSync, spawnSync } from "node:child_process";

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

const checkOnly = process.argv.includes("--check");

const uncommitted = git("status", "--porcelain");
if (uncommitted) {
  console.error("There are uncommitted changes. Commit or discard them first:");
  console.error(uncommitted);
  process.exit(1);
}

console.log(`Branch: ${git("rev-parse", "--abbrev-ref", "HEAD")}`);
console.log(`Commit: ${git("log", "-1", "--format=%h %s")}`);

if (checkOnly) {
  console.log("Ready to build.");
  process.exit(0);
}

// The shell is needed on Windows, where eas is a .cmd file.
const build = spawnSync("eas build --profile development --platform ios", {
  stdio: "inherit",
  shell: true,
});

if (git("status", "--porcelain", "app.json")) {
  console.warn(
    "\nWARNING: EAS CLI has changed app.json. Review it with `git diff app.json` and run `npm test` before committing anything.",
  );
}

process.exit(build.status ?? 1);

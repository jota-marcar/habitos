#!/usr/bin/env node
// Starts an iOS build on EAS for one variant (ADR-0008), with guards:
// - before: refuses to build with uncommitted changes, so that what is built is what is in git;
//   a production build must also come from main, up to date with GitHub, because it goes to
//   TestFlight;
// - after: warns if EAS CLI has rewritten app.json, which it does with values that must not
//   be committed.
// The production build is sent to TestFlight when it finishes (`--auto-submit`), with the
// production submit profile of eas.json. See docs/testflight.md.
// Usage: npm run build:dev             development build
//        npm run build:prod            production build, sent to TestFlight
//        add `-- --check`              only runs the guards

import { execFileSync, spawnSync } from "node:child_process";

const PROFILES = {
  development: { fromMain: false, extraArgs: "" },
  production: { fromMain: true, extraArgs: " --auto-submit" },
};

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function fail(...lines) {
  for (const line of lines) console.error(line);
  process.exit(1);
}

const profileName = process.argv[2];
const profile = PROFILES[profileName];
if (profile === undefined) {
  fail(
    `Unknown build profile "${profileName}": expected ${Object.keys(PROFILES).join(" or ")}.`,
  );
}
const checkOnly = process.argv.includes("--check");

const uncommitted = git("status", "--porcelain");
if (uncommitted) {
  fail(
    "There are uncommitted changes. Commit or discard them first:",
    uncommitted,
  );
}

const branch = git("rev-parse", "--abbrev-ref", "HEAD");
if (profile.fromMain) {
  if (branch !== "main") {
    fail(
      `A ${profileName} build must come from main, and this is ${branch}. Merge the PR and run /sync first.`,
    );
  }
  git("fetch", "--quiet", "origin", "main");
  if (git("rev-parse", "HEAD") !== git("rev-parse", "origin/main")) {
    fail(
      "main is not the same as origin/main. Bring it up to date (/sync) and push nothing to main.",
    );
  }
}

console.log(`Profile: ${profileName}`);
console.log(`Branch: ${branch}`);
console.log(`Commit: ${git("log", "-1", "--format=%h %s")}`);

if (checkOnly) {
  console.log("Ready to build.");
  process.exit(0);
}

// The shell is needed on Windows, where eas is a .cmd file.
const build = spawnSync(
  `eas build --profile ${profileName} --platform ios${profile.extraArgs}`,
  { stdio: "inherit", shell: true },
);

if (git("status", "--porcelain", "app.json")) {
  console.warn(
    "\nWARNING: EAS CLI has changed app.json. Review it with `git diff app.json` and run `npm test` before committing anything.",
  );
}

process.exit(build.status ?? 1);

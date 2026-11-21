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

import { spawnSync } from "node:child_process";

import {
  fail,
  printSource,
  requireCommitted,
  requireMainUpToDate,
  warnIfAppJsonChanged,
} from "./release-guards.mjs";

const PROFILES = {
  development: { fromMain: false, extraArgs: "" },
  production: { fromMain: true, extraArgs: " --auto-submit" },
};

const profileName = process.argv[2];
const profile = PROFILES[profileName];
if (profile === undefined) {
  fail(
    `Unknown build profile "${profileName}": expected ${Object.keys(PROFILES).join(" or ")}.`,
  );
}
const checkOnly = process.argv.includes("--check");

requireCommitted();
if (profile.fromMain) requireMainUpToDate(`A ${profileName} build`);
printSource(profileName);

if (checkOnly) {
  console.log("Ready to build.");
  process.exit(0);
}

// The shell is needed on Windows, where eas is a .cmd file.
const build = spawnSync(
  `eas build --profile ${profileName} --platform ios${profile.extraArgs}`,
  { stdio: "inherit", shell: true },
);

warnIfAppJsonChanged();

process.exit(build.status ?? 1);

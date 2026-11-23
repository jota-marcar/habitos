#!/usr/bin/env node
// Publishes an over-the-air update of the JavaScript with EAS Update for one variant (ADR-0020):
// - development: to Hábitos Dev, from any branch, to test on the iPhone the exact bundle that
//   will be released, before anyone else gets it;
// - production: to Hábitos in TestFlight, from main up to date with GitHub, with a version that
//   has not been released yet (ADR-0024), and only after confirming that it was tested in
//   Hábitos Dev. Once published, its version is tagged.
// Keeps the variants apart (ADR-0008):
// - APP_VARIANT is set here, because the `env` of the build profiles in eas.json only applies to
//   builds, and without it the config would be the development one;
// - the variables come only from the EAS environment of the variant (`--environment`): .env.local
//   is not read (EXPO_NO_DOTENV), because it holds the development values and would fill in any
//   variable missing from the production environment.
// An update only reaches the builds of its channel whose native code it matches (fingerprint):
// a native change needs a new build (npm run build:dev / build:prod).
// Usage: npm run update:dev             update for Hábitos Dev
//        npm run update:prod            update for Hábitos (TestFlight), asks first
//        add `-- --check`               only runs the guards

import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";

import {
  fail,
  git,
  printSource,
  requireCommitted,
  requireCompatibleBuild,
  requireMainUpToDate,
  requireUnreleasedVersion,
  tagRelease,
  warnIfAppJsonChanged,
} from "./release-guards.mjs";

const VARIANTS = {
  development: {
    fromMain: false,
    askTested: false,
    next: [
      "To test it: open Hábitos Dev on the iPhone and, in the development launcher, open the",
      'last update of the "development" branch (Extensions, signed in to the Expo account).',
      "When it works, merge the PR and run `npm run update:prod` from main.",
    ],
  },
  production: {
    fromMain: true,
    askTested: true,
    next: [
      "Hábitos downloads it the next time it is opened and runs it the time after.",
      "If it fails, read docs/despliegue.md before anything else: an update that adds a local",
      "migration must not be rolled back, because the app would stop opening. Publish a fix.",
    ],
  },
};

const variantName = process.argv[2];
const variant = VARIANTS[variantName];
if (variant === undefined) {
  fail(
    `Unknown variant "${variantName}": expected ${Object.keys(VARIANTS).join(" or ")}.`,
  );
}
const checkOnly = process.argv.includes("--check");

requireCommitted();
if (variant.fromMain) {
  requireMainUpToDate(`A ${variantName} update`);
  requireUnreleasedVersion(`A ${variantName} update`);
}
printSource(variantName);
requireCompatibleBuild(variantName);
warnIfAppJsonChanged();

if (checkOnly) {
  console.log("Ready to publish.");
  process.exit(0);
}

if (variant.askTested) {
  if (!process.stdin.isTTY) {
    fail("A production update asks for confirmation: run it in a terminal.");
  }
  const prompt = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  console.log(
    "\nIt reaches every tester. If it needs a database migration, apply it to production first (docs/testflight.md).",
  );
  const answer = await prompt.question(
    "Has this version been tested as an update in Hábitos Dev? [y/N] ",
  );
  prompt.close();
  if (answer.trim().toLowerCase() !== "y") {
    fail("Not published. Test it first with `npm run update:dev`.");
  }
}

// The message goes through the shell, which is needed on Windows, where eas is a .cmd file:
// it loses the characters that the shell would interpret inside double quotes.
const message = git("log", "-1", "--format=%s").replace(/["%`$\\]/g, "");
const publish = spawnSync(
  `eas update --channel ${variantName} --environment ${variantName} --platform ios --message "${message}" --non-interactive`,
  {
    stdio: "inherit",
    shell: true,
    env: { ...process.env, APP_VARIANT: variantName, EXPO_NO_DOTENV: "1" },
  },
);

warnIfAppJsonChanged();

if (publish.status === 0) {
  if (variant.fromMain) tagRelease("over-the-air update");
  console.log("");
  for (const line of variant.next) console.log(line);
}

process.exit(publish.status ?? 1);

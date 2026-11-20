// Guards shared by the scripts that release the app to the iPhone: builds (build.mjs) and
// over-the-air updates (update.mjs). What is released must be what is in git and, for
// production, what is in main on GitHub.

import { execFileSync } from "node:child_process";

export function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

export function fail(...lines) {
  for (const line of lines) console.error(line);
  process.exit(1);
}

/** Refuses to release with uncommitted changes, so that what is released is what is in git. */
export function requireCommitted() {
  const uncommitted = git("status", "--porcelain");
  if (uncommitted) {
    fail(
      "There are uncommitted changes. Commit or discard them first:",
      uncommitted,
    );
  }
}

/** Production comes from main, exactly as it is on GitHub. */
export function requireMainUpToDate(what) {
  const branch = git("rev-parse", "--abbrev-ref", "HEAD");
  if (branch !== "main") {
    fail(
      `${what} must come from main, and this is ${branch}. Merge the PR and run /sync first.`,
    );
  }
  git("fetch", "--quiet", "origin", "main");
  if (git("rev-parse", "HEAD") !== git("rev-parse", "origin/main")) {
    fail(
      "main is not the same as origin/main. Bring it up to date (/sync) and push nothing to main.",
    );
  }
}

export function printSource(profileName) {
  console.log(`Profile: ${profileName}`);
  console.log(`Branch: ${git("rev-parse", "--abbrev-ref", "HEAD")}`);
  console.log(`Commit: ${git("log", "-1", "--format=%h %s")}`);
}

/** EAS CLI rewrites app.json with values that must not be committed. */
export function warnIfAppJsonChanged() {
  if (git("status", "--porcelain", "app.json")) {
    console.warn(
      "\nWARNING: EAS CLI has changed app.json. Review it with `git diff app.json` and run `npm test` before committing anything.",
    );
  }
}

// Guards shared by the scripts that release the app to the iPhone: builds (build.mjs) and
// over-the-air updates (update.mjs). What is released must be what is in git and, for
// production, what is in main on GitHub.

import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

export function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

export function fail(...lines) {
  for (const line of lines) console.error(line);
  process.exit(1);
}

/** The version of the app: app.json is the only place that decides it (ADR-0024). */
export function appVersion() {
  return JSON.parse(readFileSync("app.json", "utf8")).expo.version;
}

/** Every production release has a new version: one with a tag was already released. */
export function requireUnreleasedVersion(what) {
  const tag = `v${appVersion()}`;
  git("fetch", "--quiet", "--tags", "origin");
  if (git("tag", "--list", tag)) {
    fail(
      `${what} needs a new version: ${tag} has already been released.`,
      "Run `node scripts/bump-version.mjs` in a branch, merge its PR and try again.",
    );
  }
}

/** Marks in git what has just been released. The release is done even if this fails. */
export function tagRelease(what) {
  const tag = `v${appVersion()}`;
  try {
    git("tag", "-a", tag, "-m", `${tag}: ${what}`);
    git("push", "--quiet", "origin", `refs/tags/${tag}`);
    console.log(`\nTagged ${tag}.`);
  } catch {
    const create = git("tag", "--list", tag)
      ? ""
      : `\n  git tag -a ${tag} -m "${tag}: ${what}"`;
    console.warn(
      `\nWARNING: ${tag} was released, but its tag could not be created or pushed. Run:${create}`,
      `\n  git push origin refs/tags/${tag}`,
    );
  }
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

/** Runs a read-only EAS command for a variant and returns its JSON output. */
function easJson(variant, command) {
  // Through the shell, because on Windows eas is a .cmd file.
  const { status, stdout } = spawnSync(
    `eas ${command} --json --non-interactive`,
    {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      shell: true,
      stdio: ["ignore", "pipe", "inherit"],
      env: { ...process.env, APP_VARIANT: variant, EXPO_NO_DOTENV: "1" },
    },
  );
  if (status !== 0) {
    fail(`Could not check the native code with EAS: eas ${command} failed.`);
  }
  // EAS can print a notice about the environment before the JSON.
  return JSON.parse(stdout.slice(stdout.search(/^[[{]/m)));
}

/**
 * An update only reaches the builds with its same fingerprint, and EAS publishes it with success
 * even if there is none. The fingerprint depends on the variables of the EAS environment, so it
 * has to be computed with them: without them it differs from the build's (ADR-0020).
 */
export function requireCompatibleBuild(variant) {
  const [build] = easJson(
    variant,
    `build:list --platform ios --channel ${variant} --status finished --limit 1`,
  );
  if (build === undefined) {
    fail(`There is no finished build on the ${variant} channel to update.`);
  }
  const { fingerprint1, fingerprint2 } = easJson(
    variant,
    `fingerprint:compare --build-id ${build.id} --environment ${variant}`,
  );
  if (fingerprint1.hash !== fingerprint2.hash) {
    fail(
      `The native code has changed since the last ${variant} build (${build.appVersion} (${build.appBuildVersion})): this update would reach nobody.`,
      `See the difference with \`eas fingerprint:compare --build-id ${build.id} --environment ${variant}\`.`,
      "It needs a new build (docs/despliegue.md).",
    );
  }
  console.log(
    `Native code: matches the build ${build.appVersion} (${build.appBuildVersion}).`,
  );
}

export function printSource(profileName) {
  console.log(`Profile: ${profileName}`);
  console.log(`Version: ${appVersion()}`);
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

#!/usr/bin/env node
// Prepares the next version of the app, in a branch (ADR-0024). It works out the level from the
// Conventional Commits since the last release, and writes it to app.json, which decides it, and
// to package.json and package-lock.json, which follow it.
// It is not an npm script on purpose: the scripts of package.json are part of the fingerprint.
// Usage: node scripts/bump-version.mjs                from the commits since the last release
//        node scripts/bump-version.mjs patch          forces a level: major, minor or patch
//        add `--check`                                only prints the result

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

import { appVersion, fail, git } from "./release-guards.mjs";

const LEVELS = ["major", "minor", "patch"];

const parts = (version) => version.split("+")[0].split(".").map(Number);

function compare(a, b) {
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i++) {
    if (x[i] !== y[i]) return x[i] - y[i];
  }
  return 0;
}

function bumped(version, level) {
  const [major, minor, patch] = parts(version);
  if (level === "major") return `${major + 1}.0.0`;
  if (level === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

// A breaking change before 1.0.0 only goes up a minor version, as semantic versioning allows.
function levelOf(subjects, version) {
  if (subjects.some((subject) => /^\w+(\(.+\))?!:/.test(subject))) {
    return parts(version)[0] === 0 ? "minor" : "major";
  }
  return subjects.some((subject) => /^feat(\(.+\))?:/.test(subject))
    ? "minor"
    : "patch";
}

function lastReleaseTag() {
  try {
    return execFileSync(
      "git",
      ["describe", "--tags", "--abbrev=0", "--match", "v*"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
  } catch {
    return null;
  }
}

/** Replaces the first `times` version fields of a file, keeping the rest of it as it is. */
function writeVersion(file, from, to, times) {
  let text = readFileSync(file, "utf8");
  for (let i = 0; i < times; i++) {
    text = text.replace(`"version": "${from}"`, `"version": "${to}"`);
  }
  writeFileSync(file, text);
}

const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
const forced = args.find((arg) => !arg.startsWith("--"));
if (forced !== undefined && !LEVELS.includes(forced)) {
  fail(`Unknown level "${forced}": expected ${LEVELS.join(", ")}.`);
}

const tag = lastReleaseTag();
const released = tag === null ? "0.0.0" : tag.slice(1);
const range = tag === null ? "HEAD" : `${tag}..HEAD`;
const subjects = git("log", "--format=%s", range).split("\n").filter(Boolean);
if (subjects.length === 0 && forced === undefined) {
  fail(`Nothing to release since ${tag}. To force it, name a level: patch.`);
}

const current = appVersion();
const next = bumped(released, forced ?? levelOf(subjects, released));

console.log(`Last release: ${tag ?? "none"}`);
console.log(`Commits since then: ${subjects.length}`);
if (compare(current, next) >= 0) {
  console.log(`Version ${current} is already prepared.`);
  process.exit(0);
}
console.log(`Next version: ${next}`);
if (checkOnly) process.exit(0);

writeVersion("app.json", current, next, 1);
writeVersion("package.json", current, next, 1);
// The lockfile repeats it, at its top and in its root package.
writeVersion("package-lock.json", current, next, 2);
console.log("Updated app.json, package.json and package-lock.json.");

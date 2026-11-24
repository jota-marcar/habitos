/**
 * @jest-environment node
 */
// The versions of the releases (ADR-0024): the scripts run for real on throwaway repositories,
// with a stub in place of EAS CLI.
// In JavaScript, like the scripts: the project has no types for the modules of Node.
/* global __dirname */

import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const SCRIPTS = path.resolve(__dirname, "../../scripts");

jest.setTimeout(60_000);

let root;
let clone;
let stubs;

const git = (...args) =>
  execFileSync("git", args, {
    cwd: clone,
    encoding: "utf8",
    stdio: "pipe",
  }).trim();

function commit(message) {
  writeFileSync(path.join(clone, "work.txt"), message);
  git("add", ".");
  git("commit", "--quiet", "-m", message);
}

function runScript(script, ...args) {
  return runScriptWithEnv({}, script, ...args);
}

/** Runs a script with some variables changed: undefined removes one. */
function runScriptWithEnv(env, script, ...args) {
  const result = spawnSync(
    process.execPath,
    [path.join(SCRIPTS, script), ...args],
    {
      cwd: clone,
      encoding: "utf8",
      env: {
        ...process.env,
        SENTRY_AUTH_TOKEN: "sntrys_test",
        ...env,
        PATH: `${stubs}${path.delimiter}${process.env.PATH}`,
      },
    },
  );
  return { ...result, output: `${result.stdout}${result.stderr}` };
}

const versionIn = (file) =>
  JSON.parse(readFileSync(path.join(clone, file), "utf8"));

/** EAS CLI, which ends with `code`. */
function stubEas(code) {
  writeFileSync(path.join(stubs, "eas.cmd"), `@exit /b ${code}\r\n`);
  writeFileSync(path.join(stubs, "eas"), `#!/bin/sh\nexit ${code}\n`);
  chmodSync(path.join(stubs, "eas"), 0o755);
}

/** EAS CLI answering the native-code check, with a notice before its JSON like the real one. */
function stubEasCheck(buildHash, localHash, listOutput) {
  const list =
    listOutput ??
    `Notice\n${JSON.stringify([{ id: "b", appVersion: "0.1.0", appBuildVersion: "2" }], null, 2)}`;
  const compare = JSON.stringify(
    { fingerprint1: { hash: buildHash }, fingerprint2: { hash: localHash } },
    null,
    2,
  );
  const stub = path.join(stubs, "eas-stub.js");
  writeFileSync(
    stub,
    `console.log(process.argv[2] === "build:list" ? ${JSON.stringify(list)} : ${JSON.stringify(`Notice\n${compare}`)});\n`,
  );
  writeFileSync(
    path.join(stubs, "eas.cmd"),
    `@"${process.execPath}" "${stub}" %*\r\n`,
  );
  writeFileSync(
    path.join(stubs, "eas"),
    `#!/bin/sh\nexec "${process.execPath}" "${stub}" "$@"\n`,
  );
  chmodSync(path.join(stubs, "eas"), 0o755);
}

function setVersion(version) {
  writeFileSync(
    path.join(clone, "app.json"),
    `${JSON.stringify({ expo: { version } }, null, 2)}\n`,
  );
  writeFileSync(
    path.join(clone, "package.json"),
    `${JSON.stringify({ name: "app", version }, null, 2)}\n`,
  );
  writeFileSync(
    path.join(clone, "package-lock.json"),
    `${JSON.stringify(
      {
        name: "app",
        version,
        packages: {
          "": { name: "app", version },
          "node_modules/other": { version },
          // For another platform: npm never installs it here.
          "node_modules/other-darwin": { version, optional: true },
          // Needed by a development tool, but only on another platform.
          "node_modules/other-elsewhere": {
            version,
            devOptional: true,
            os: [process.platform === "linux" ? "darwin" : "linux"],
          },
        },
      },
      null,
      2,
    )}\n`,
  );
  installDependencies({ "node_modules/other": { version } });
}

/** What npm records in node_modules after an install. */
function installDependencies(packages) {
  mkdirSync(path.join(clone, "node_modules"), { recursive: true });
  writeFileSync(
    path.join(clone, "node_modules", ".package-lock.json"),
    JSON.stringify({ name: "app", packages }),
  );
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "release-version-"));
  clone = path.join(root, "clone");
  stubs = path.join(root, "stubs");
  mkdirSync(stubs);
  execFileSync("git", [
    "init",
    "--quiet",
    "--bare",
    "--initial-branch=main",
    path.join(root, "origin.git"),
  ]);
  execFileSync(
    "git",
    ["clone", "--quiet", path.join(root, "origin.git"), clone],
    { stdio: "pipe" },
  );
  git("config", "user.email", "test@example.test");
  git("config", "user.name", "Test");
  git("config", "core.autocrlf", "false");
  git("switch", "--quiet", "-C", "main");
  writeFileSync(path.join(clone, ".gitignore"), "node_modules/\n");
  setVersion("0.1.0");
  commit("chore: first version");
  git("tag", "-a", "v0.1.0", "-m", "v0.1.0");
  git("push", "--quiet", "origin", "main", "refs/tags/v0.1.0");
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

test.each([
  ["fix: a fix", "0.1.1"],
  ["docs: some docs", "0.1.1"],
  ["feat: something new", "0.2.0"],
  ["feat!: a breaking change before 1.0.0", "0.2.0"],
])("after %s the next version is %s", (message, next) => {
  commit(message);

  const result = runScript("bump-version.mjs");

  expect(result.status).toBe(0);
  expect(versionIn("app.json").expo.version).toBe(next);
  expect(versionIn("package.json").version).toBe(next);
  const lock = versionIn("package-lock.json");
  expect(lock.version).toBe(next);
  expect(lock.packages[""].version).toBe(next);
  // The same number in a dependency is not the version of the app.
  expect(lock.packages["node_modules/other"].version).toBe("0.1.0");
});

test("a breaking change after 1.0.0 goes up a major version", () => {
  setVersion("1.2.3");
  commit("chore: stable");
  git("tag", "-a", "v1.2.3", "-m", "v1.2.3");
  commit("fix!: breaking");

  runScript("bump-version.mjs");

  expect(versionIn("app.json").expo.version).toBe("2.0.0");
});

test("counts from a tag with a build number", () => {
  commit("fix: second build");
  git("tag", "-a", "v0.1.0+2", "-m", "v0.1.0+2");
  commit("feat: something new");

  runScript("bump-version.mjs");

  expect(versionIn("app.json").expo.version).toBe("0.2.0");
});

test("a version already prepared is left alone", () => {
  commit("feat: something new");
  runScript("bump-version.mjs");
  git("add", ".");
  git("commit", "--quiet", "-m", "chore: prepares the version");
  commit("feat: something else");

  const result = runScript("bump-version.mjs");

  expect(result.output).toContain("Version 0.2.0 is already prepared");
  expect(versionIn("app.json").expo.version).toBe("0.2.0");
});

test("with nothing new it stops, unless a level is named", () => {
  expect(runScript("bump-version.mjs").status).toBe(1);
  expect(versionIn("app.json").expo.version).toBe("0.1.0");

  expect(runScript("bump-version.mjs", "patch").status).toBe(0);
  expect(versionIn("app.json").expo.version).toBe("0.1.1");
});

test("stops if the files disagree, without touching a dependency", () => {
  const lockFile = path.join(clone, "package-lock.json");
  const before = readFileSync(lockFile, "utf8").replace(
    '"version": "0.1.0"',
    '"version": "0.0.9"',
  );
  writeFileSync(lockFile, before);
  commit("feat: something new");

  const result = runScript("bump-version.mjs");

  expect(result.status).toBe(1);
  expect(readFileSync(lockFile, "utf8")).toBe(before);
});

test("--check changes nothing", () => {
  commit("feat: something new");

  const result = runScript("bump-version.mjs", "--check");

  expect(result.output).toContain("Next version: 0.2.0");
  expect(versionIn("app.json").expo.version).toBe("0.1.0");
});

test.each([
  ["build.mjs", "production"],
  ["update.mjs", "production"],
])("%s refuses to release a version again", (script, variant) => {
  const result = runScript(script, variant, "--check");

  expect(result.status).toBe(1);
  expect(result.output).toContain("v0.1.0 has already been released");
});

test.each([
  ["build.mjs", "Ready to build."],
  ["update.mjs", "Ready to publish."],
])("%s accepts a new version", (script, ready) => {
  setVersion("0.2.0");
  commit("chore: prepares the version");
  git("push", "--quiet", "origin", "main");
  stubEasCheck("same", "same");

  const result = runScript(script, "production", "--check");

  expect(result.status).toBe(0);
  expect(result.output).toContain("Version: 0.2.0");
  expect(result.output).toContain(ready);
});

test.each([
  ["its native code differs", ["build", "local"], "would reach nobody"],
  ["there is no build", ["same", "same", "[]"], "no finished build"],
  ["EAS does not answer JSON", ["same", "same", "Oops"], "did not return JSON"],
])("update.mjs refuses to publish when %s", (_name, answer, message) => {
  setVersion("0.2.0");
  commit("chore: prepares the version");
  git("push", "--quiet", "origin", "main");
  stubEasCheck(...answer);

  const result = runScript("update.mjs", "production", "--check");

  expect(result.status).toBe(1);
  expect(result.output).toContain(message);
});

// EAS CLI reads the Expo config with the plugins of node_modules, and fails without saying why.
test.each([
  ["build.mjs", "missing", {}],
  ["update.mjs", "missing", {}],
  ["build.mjs", "older", { "node_modules/other": { version: "0.0.9" } }],
  ["update.mjs", "older", { "node_modules/other": { version: "0.0.9" } }],
])(
  "%s refuses to release with a dependency %s in node_modules",
  (script, _state, installed) => {
    installDependencies(installed);
    stubEasCheck("same", "same");

    const result = runScript(script, "development", "--check");

    expect(result.status).toBe(1);
    expect(result.output).toContain(
      "node_modules does not match package-lock.json (other)",
    );
    expect(result.output).toContain("Run `npm ci`");
  },
);

test("update.mjs does not upload the source maps without the dependencies installed", () => {
  installDependencies({});

  const result = runScript("update.mjs", "development", "--upload-sourcemaps");

  expect(result.status).toBe(1);
  expect(result.output).toContain("Run `npm ci`");
});

// ADR-0026: an update without its source maps would leave its errors unreadable in Sentry.
test("update.mjs refuses to publish without the token of Sentry", () => {
  setVersion("0.2.0");
  commit("chore: prepares the version");
  git("push", "--quiet", "origin", "main");
  stubEasCheck("same", "same");

  const result = runScriptWithEnv(
    { SENTRY_AUTH_TOKEN: undefined },
    "update.mjs",
    "production",
    "--check",
  );

  expect(result.status).toBe(1);
  expect(result.output).toContain("SENTRY_AUTH_TOKEN is missing");
});

test("update.mjs does not upload the source maps alone without the token of Sentry", () => {
  const result = runScriptWithEnv(
    { SENTRY_AUTH_TOKEN: undefined },
    "update.mjs",
    "development",
    "--upload-sourcemaps",
  );

  expect(result.status).toBe(1);
  expect(result.output).toContain("SENTRY_AUTH_TOKEN is missing");
});

test("a production build that goes well tags its version on GitHub", () => {
  setVersion("0.2.0");
  commit("chore: prepares the version");
  git("push", "--quiet", "origin", "main");
  stubEas(0);

  const result = runScript("build.mjs", "production");

  expect(result.status).toBe(0);
  expect(git("ls-remote", "--tags", "origin", "v0.2.0")).toContain("v0.2.0");
});

test("a production build that fails leaves no tag, to try again", () => {
  setVersion("0.2.0");
  commit("chore: prepares the version");
  git("push", "--quiet", "origin", "main");
  stubEas(1);

  const result = runScript("build.mjs", "production");

  expect(result.status).toBe(1);
  expect(git("tag", "--list", "v0.2.0")).toBe("");
});

test("a development build needs no new version and leaves no tag", () => {
  stubEas(0);

  const result = runScript("build.mjs", "development");

  expect(result.status).toBe(0);
  expect(git("tag", "--list")).toBe("v0.1.0");
});

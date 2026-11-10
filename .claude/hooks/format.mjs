#!/usr/bin/env node
// PostToolUse hook (Edit and Write): formats the edited file with Prettier and fixes it with ESLint.
// If lint errors remain that cannot be fixed automatically, it returns them to the agent.
// Exit code 2 = warn the agent; the stderr message is shown to it. The edit has already happened.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const FORMATTABLE = /\.(js|cjs|mjs|jsx|ts|tsx|json|yml|yaml)$/;
const LINTABLE = /\.(js|cjs|mjs|jsx|ts|tsx)$/;

function readInput() {
  try {
    return JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return null;
  }
}

// Runs the tool with the same Node, bypassing the .cmd shims in node_modules/.bin (Windows).
function run(root, script, args) {
  return spawnSync(process.execPath, [path.join(root, script), ...args], {
    cwd: root,
    encoding: "utf8",
  });
}

const input = readInput();
const file = input?.tool_input?.file_path;
if (typeof file !== "string") process.exit(0);

const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
const absolute = path.resolve(root, file);
const relative = path.relative(root, absolute);
// Only files inside the project that still exist.
if (
  relative.startsWith("..") ||
  path.isAbsolute(relative) ||
  !existsSync(absolute)
) {
  process.exit(0);
}

const prettier = "node_modules/prettier/bin/prettier.cjs";
const eslint = "node_modules/eslint/bin/eslint.js";
// Nothing to do without installed dependencies.
if (!existsSync(path.join(root, prettier))) process.exit(0);

if (FORMATTABLE.test(relative)) {
  // Honors .prettierignore (Markdown, for example, is left out).
  run(root, prettier, ["--write", "--log-level", "warn", relative]);
}

if (LINTABLE.test(relative) && existsSync(path.join(root, eslint))) {
  const lint = run(root, eslint, ["--fix", "--no-warn-ignored", relative]);
  if (lint.status !== 0) {
    process.stderr.write(
      `ESLint found problems in ${relative} that it could not fix automatically:\n` +
        `${lint.stdout || lint.stderr}\nFix them before continuing.\n`,
    );
    process.exit(2);
  }
}

process.exit(0);

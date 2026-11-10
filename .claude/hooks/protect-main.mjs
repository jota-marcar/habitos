#!/usr/bin/env node
// PreToolUse hook (Bash and PowerShell): blocks `git commit` on main and `git push` to main.
// GitHub already rejects it on the server; this hook warns the agent before it gets that far.
// Exit code 2 = block; the stderr message is returned to the agent.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const PROTECTED_BRANCH = "main";

function readInput() {
  try {
    return JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return null;
  }
}

function currentBranch(cwd) {
  try {
    return execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

// Splits a compound command (a && b; c | d) into simple commands.
function segments(command) {
  return command.split(/&&|\|\||[;|\n]/).map((s) => s.trim());
}

// Returns the git subcommand ("commit", "push"…) and its arguments, or null.
function gitSubcommand(segment) {
  const tokens = segment.split(/\s+/).filter(Boolean);
  const i = tokens.findIndex((t) => /(^|[\\/])git(\.exe)?$/.test(t));
  if (i === -1) return null;
  // Skips global options such as `-C path` or `-c key=value`.
  let j = i + 1;
  while (j < tokens.length && tokens[j].startsWith("-")) {
    j += tokens[j] === "-C" || tokens[j] === "-c" ? 2 : 1;
  }
  if (j >= tokens.length) return null;
  return { name: tokens[j], args: tokens.slice(j + 1) };
}

function pushesToProtectedBranch(args) {
  const refspec = new RegExp(`(^|[:+])${PROTECTED_BRANCH}$`);
  return args.some((a) => !a.startsWith("-") && refspec.test(a));
}

function block(reason) {
  process.stderr.write(
    `${reason}\nPer CONTRIBUTING.md, changes reach ${PROTECTED_BRANCH} only through a Pull Request. ` +
      `Create a <type>/<description> branch from an up-to-date ${PROTECTED_BRANCH} and work there.\n`,
  );
  process.exit(2);
}

const input = readInput();
const command = input?.tool_input?.command;
if (typeof command !== "string" || !/\bgit\b/.test(command)) process.exit(0);

const cwd = input.cwd || process.cwd();

for (const segment of segments(command)) {
  const git = gitSubcommand(segment);
  if (!git) continue;

  if (git.name === "commit" && currentBranch(cwd) === PROTECTED_BRANCH) {
    block(`Blocked: no direct commits on ${PROTECTED_BRANCH}.`);
  }

  if (git.name === "push") {
    const noRefspec = git.args.filter((a) => !a.startsWith("-")).length <= 1;
    if (
      pushesToProtectedBranch(git.args) ||
      (noRefspec && currentBranch(cwd) === PROTECTED_BRANCH)
    ) {
      block(`Blocked: no direct pushes to ${PROTECTED_BRANCH}.`);
    }
  }
}

process.exit(0);

#!/usr/bin/env node
// Brings the local repository up to date after a Pull Request has been merged:
// updates main, moves the branches stacked on a merged Pull Request onto main
// and deletes the local branches whose Pull Request is merged.
// It also works from a git worktree: main is updated where it is checked out,
// and a branch open in another worktree is never rebased or deleted.
// Usage: node .claude/skills/sync/sync.mjs
// Exits with code 1, changing nothing, if there are uncommitted changes here or
// in the checkout of main.

import { execFileSync, execSync } from "node:child_process";
import { existsSync } from "node:fs";

const BASE = "main";
const GH_WINDOWS = "C:/Program Files/GitHub CLI/gh.exe";
// A Node script that answers for GitHub in the tests (src/__tests__/sync-script.test.js).
const GH_STUB = process.env.SYNC_GH_STUB;

function run(command, args) {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function attempt(fn) {
  try {
    return fn();
  } catch {
    return null;
  }
}

const git = (...args) => run("git", args);

function ghPath() {
  if (attempt(() => run("gh", ["--version"])) !== null) return "gh";
  return existsSync(GH_WINDOWS) ? GH_WINDOWS : null;
}

function stop(message, details) {
  console.log(`BLOCKER: ${message}`);
  if (details) console.log(details);
  process.exit(1);
}

const isAncestor = (commit, branch) =>
  attempt(() => git("merge-base", "--is-ancestor", commit, branch)) !== null;

// git knows every branch a worktree holds, even one in the middle of a rebase or
// a bisect, and refuses to force-update it. Otherwise, forcing a branch onto
// itself changes nothing.
const isInUse = (branch) =>
  attempt(() => git("branch", "--force", "--no-track", branch, branch)) ===
  null;

const uncommitted = git("status", "--porcelain");
if (uncommitted) {
  stop(
    "there are uncommitted changes. Commit or discard them first:",
    uncommitted,
  );
}

const startedOn = git("rev-parse", "--abbrev-ref", "HEAD");
const startCommit = git("rev-parse", "HEAD");

// One block per worktree. The first one is always the primary checkout.
const worktrees = git("worktree", "list", "--porcelain")
  .split("\n\n")
  .map((block) => {
    const lines = block.split("\n");
    return {
      path: lines
        .find((line) => line.startsWith("worktree "))
        ?.slice("worktree ".length),
      branch:
        lines
          .find((line) => line.startsWith("branch refs/heads/"))
          ?.slice("branch refs/heads/".length) ?? null,
    };
  });
const mainCheckout = worktrees.find((tree) => tree.branch === BASE);

if (startedOn !== BASE && mainCheckout) {
  const pending = attempt(() =>
    git(
      "--no-optional-locks",
      "-C",
      mainCheckout.path,
      "status",
      "--porcelain",
    ),
  );
  if (pending === null) {
    stop(
      `${BASE} is checked out at ${mainCheckout.path}, which cannot be read. Nothing was changed.`,
    );
  }
  if (pending) {
    stop(
      `the checkout of ${BASE} at ${mainCheckout.path} has uncommitted changes. Nothing was changed. Commit or discard them there first:`,
      pending,
    );
  }
} else if (startedOn !== BASE && isInUse(BASE)) {
  stop(
    `${BASE} is in the middle of a rebase or a bisect in another worktree, or does not exist locally. Nothing was changed.`,
  );
}

git("fetch", "--quiet", "--prune", "origin");

const before = git("rev-parse", `refs/heads/${BASE}`);
if (!isAncestor(before, `origin/${BASE}`)) {
  stop(
    `${BASE} has commits that are not in origin/${BASE}. Nothing was changed.`,
  );
}

// Only the primary checkout moves to main, and only if main is free. A linked
// worktree belongs to its own branch and stays on it.
const switchesToMain =
  startedOn !== BASE && !mainCheckout && worktrees[0].branch === startedOn;
const home = switchesToMain ? BASE : startedOn;
if (switchesToMain) git("switch", "--quiet", BASE);

const mainPath = switchesToMain ? worktrees[0].path : mainCheckout?.path;
if (mainPath) {
  git("-C", mainPath, "merge", "--quiet", "--ff-only", `origin/${BASE}`);
} else {
  // Not checked out anywhere: the ref moves without touching any working tree.
  git(
    "fetch",
    "--quiet",
    ".",
    `refs/remotes/origin/${BASE}:refs/heads/${BASE}`,
  );
}
const after = git("rev-parse", `refs/heads/${BASE}`);

console.log(
  home === startedOn
    ? `Branch: ${home}`
    : `Branch: ${home} (was on ${startedOn})`,
);
if (before === after) {
  console.log(`${BASE} was already up to date.`);
} else {
  console.log(`${BASE} updated with:`);
  console.log(git("log", "--format=  - %s", `${before}..${after}`));
  if (home !== BASE && mainPath) {
    console.log(`${BASE} is open at ${mainPath} and was updated there.`);
  }
}

// The branch of this worktree follows main while it has no commits of its own.
if (home !== BASE && home !== "HEAD") {
  if (!isAncestor(home, `origin/${BASE}`)) {
    console.log(`${home} has commits of its own: not fast-forwarded.`);
  } else if (git("rev-parse", home) !== after) {
    git("merge", "--quiet", "--ff-only", `origin/${BASE}`);
    console.log(`${home} had no commits of its own: moved to ${BASE}.`);
  }
}

// A squash merge leaves no trace in git that the branch was merged, so GitHub is asked.
const gh = GH_STUB ?? ghPath();
const runGh = (args) =>
  GH_STUB ? run(process.execPath, [GH_STUB, ...args]) : run(gh, args);
const branches = git("for-each-ref", "--format=%(refname:short)", "refs/heads")
  .split("\n")
  .filter((branch) => branch && branch !== BASE);
const openElsewhere = new Set(
  branches.filter((branch) => branch !== home && isInUse(branch)),
);

// The latest Pull Request of a branch, with its state and the commit it ended on.
const pullRequest = (branch) => {
  if (!gh) return null;
  const output = attempt(() =>
    runGh([
      "pr",
      "list",
      "--head",
      branch,
      "--state",
      "all",
      "--json",
      "state,headRefOid",
    ]),
  );
  return output === null ? null : (JSON.parse(output)[0] ?? null);
};

const countCommits = (range) => Number(git("rev-list", "--count", range));

// Whether every commit of the branch is in its Pull Request, so deleting it loses nothing.
const isInPullRequest = (branch, pr) => {
  const tip = git("rev-parse", branch);
  return tip === pr.headRefOid || isAncestor(tip, pr.headRefOid);
};

// Restack. A branch created on top of another one carries that branch's
// commits. After a squash merge, main holds the same code in a different
// commit, so `git merge origin/main` conflicts. Replaying only the branch's own
// commits (`git rebase --onto`) does not. The tips of the merged Pull Requests
// come from GitHub, so it works even if those local branches are already gone.
const restacked = [];
const restackProblems = [];
const mergedTips = gh
  ? (
      attempt(() =>
        runGh([
          "pr",
          "list",
          "--state",
          "merged",
          "--base",
          BASE,
          "--limit",
          "50",
          "--json",
          "headRefOid",
          "--jq",
          ".[].headRefOid",
        ]),
      ) ?? ""
    )
      .split("\n")
      .filter(Boolean)
  : [];

// Old base -> new base. A branch stacked on a restacked branch follows it.
const moves = new Map(mergedTips.map((tip) => [tip, `origin/${BASE}`]));
// Stacked branches have more history than the branch below them, so sorting by
// history length restacks the lower branch first.
const candidates = branches
  .filter(
    (branch) =>
      !openElsewhere.has(branch) && pullRequest(branch)?.state !== "MERGED",
  )
  .sort((a, b) => countCommits(a) - countCommits(b));

for (const branch of candidates) {
  const oldTip = git("rev-parse", branch);
  const bases = [...moves.keys()].filter(
    (base) => base !== oldTip && isAncestor(base, branch),
  );
  if (bases.length === 0) continue;
  // The closest base is the one with the most history behind it.
  const oldBase = bases.reduce((a, b) =>
    countCommits(b) > countCommits(a) ? b : a,
  );
  const newBase = moves.get(oldBase);

  // Replaying it would copy the commits of the branch below, which cannot move.
  const heldBelow = [...openElsewhere].find(
    (open) =>
      git("rev-parse", open) !== oldBase &&
      isAncestor(oldBase, open) &&
      isAncestor(open, branch),
  );
  if (heldBelow) {
    restackProblems.push(
      `${branch}: stacked on ${heldBelow}, which is open in another worktree; left untouched`,
    );
    continue;
  }

  if (
    attempt(() => git("rebase", "--onto", newBase, oldBase, branch)) === null
  ) {
    attempt(() => git("rebase", "--abort"));
    restackProblems.push(
      `${branch}: conflicts while replaying its commits, left untouched`,
    );
    continue;
  }
  moves.set(oldTip, git("rev-parse", branch));

  let verifyError = null;
  try {
    execSync("npm run verify", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    verifyError = `${error.stdout ?? ""}\n${error.stderr ?? ""}`
      .split("\n")
      .filter((line) => /error|fail|✖/i.test(line))
      .slice(0, 5)
      .join(" | ");
  }
  const remoteTip = attempt(() => git("rev-parse", `origin/${branch}`));
  const ownCommits = countCommits(`origin/${BASE}..${branch}`);
  if (verifyError !== null) {
    restackProblems.push(
      `${branch}: rebased, but npm run verify fails (${verifyError}); not pushed`,
    );
  } else if (remoteTip && remoteTip !== oldTip) {
    restackProblems.push(
      `${branch}: rebased, but it differed from origin/${branch} before; not pushed`,
    );
  } else if (remoteTip) {
    git(
      "push",
      "--quiet",
      `--force-with-lease=refs/heads/${branch}:${remoteTip}`,
      "origin",
      branch,
    );
    restacked.push(`${branch} (${ownCommits} own commit(s), pushed)`);
  } else {
    restacked.push(`${branch} (${ownCommits} own commit(s), no remote branch)`);
  }
}
// Rebasing a branch checks it out here, so this worktree goes back to its own.
if (git("rev-parse", "--abbrev-ref", "HEAD") !== home) {
  if (home === "HEAD") git("switch", "--quiet", "--detach", startCommit);
  else git("switch", "--quiet", home);
}

const deleted = [];
const kept = [];
for (const branch of branches) {
  if (openElsewhere.has(branch) || branch === home) {
    const where = branch === home ? "this" : "another";
    kept.push(`${branch} (open in ${where} worktree)`);
    continue;
  }
  const pr = pullRequest(branch);
  const merged = pr?.state === "MERGED";
  const pushed = attempt(() => git("rev-parse", `origin/${branch}`)) !== null;
  const safe = merged && isInPullRequest(branch, pr);

  if (safe && !pushed) {
    git("branch", "-D", branch);
    deleted.push(branch);
  } else {
    const reason = !merged
      ? pr
        ? `its Pull Request is ${pr.state}`
        : "no Pull Request found"
      : safe
        ? "merged, but the remote branch still exists"
        : "merged, but it has commits that are not in its Pull Request";
    kept.push(`${branch} (${reason})`);
  }
}

console.log(
  `\nRestacked branches: ${restacked.length ? restacked.join(", ") : "none"}`,
);
if (restackProblems.length) {
  console.log(`RESTACK PROBLEMS: ${restackProblems.join("; ")}`);
}
console.log(
  `Deleted branches: ${deleted.length ? deleted.join(", ") : "none"}`,
);
console.log(`Kept branches: ${kept.length ? kept.join(", ") : "none"}`);
if (!gh) console.log("WARNING: GitHub CLI (gh) not found; no branch deleted.");

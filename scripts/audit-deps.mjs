#!/usr/bin/env node
// Dependency audit: runs `npm audit` and compares its advisories with the accepted ones
// in scripts/accepted-advisories.json. npm cannot ignore specific advisories; this can,
// but the reason and a review date must be written down.
//
// Fails (exit code 1) if:
// - an advisory shows up that is not accepted,
// - an accepted advisory no longer shows up (it must be removed from the list),
// - the review date of an accepted advisory has passed.

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const acceptedFile = path.join(root, "scripts", "accepted-advisories.json");

function runAudit() {
  // Under `npm run`, npm_execpath points to npm-cli.js: this avoids npm.cmd on Windows.
  const npm = process.env.npm_execpath;
  const result = npm
    ? spawnSync(process.execPath, [npm, "audit", "--json"], {
        cwd: root,
        encoding: "utf8",
      })
    : spawnSync("npm audit --json", {
        cwd: root,
        encoding: "utf8",
        shell: true,
      });
  try {
    return JSON.parse(result.stdout);
  } catch {
    console.error("Could not run npm audit (is there a connection?).");
    console.error(result.stderr);
    process.exit(1);
  }
}

// Groups the advisories by GHSA identifier.
function currentAdvisories(report) {
  if (report.error) {
    console.error(
      `npm audit failed: ${report.error.summary ?? JSON.stringify(report.error)}`,
    );
    process.exit(1);
  }
  const advisories = new Map();
  for (const vulnerability of Object.values(report.vulnerabilities ?? {})) {
    for (const source of vulnerability.via) {
      if (typeof source === "string") continue;
      const id = source.url.split("/").pop();
      const advisory = advisories.get(id) ?? {
        id,
        package: source.name,
        severity: source.severity,
        title: source.title,
        url: source.url,
      };
      advisories.set(id, advisory);
    }
  }
  return advisories;
}

const accepted = new Map(
  JSON.parse(readFileSync(acceptedFile, "utf8")).advisories.map((a) => [
    a.id,
    a,
  ]),
);
const current = currentAdvisories(runAudit());
const today = new Date().toISOString().slice(0, 10);

const added = [...current.values()].filter((a) => !accepted.has(a.id));
const stale = [...accepted.values()].filter((a) => !current.has(a.id));
const overdue = [...accepted.values()].filter(
  (a) => current.has(a.id) && a.reviewBy < today,
);
const valid = [...accepted.values()].filter(
  (a) => current.has(a.id) && a.reviewBy >= today,
);

for (const a of valid) {
  console.log(
    `Accepted: ${a.id} (${a.package}, ${a.severity}), review by ${a.reviewBy}.`,
  );
}
for (const a of added) {
  console.error(
    `NEW: ${a.id} in ${a.package} (${a.severity}): ${a.title}\n  ${a.url}`,
  );
}
for (const a of stale) {
  console.error(
    `NO LONGER REPORTED: ${a.id} (${a.package}). Remove it from the accepted list.`,
  );
}
for (const a of overdue) {
  console.error(
    `REVIEW OVERDUE: ${a.id} (${a.package}) was due for review by ${a.reviewBy}.`,
  );
}

if (added.length || stale.length || overdue.length) {
  console.error(
    `\nThe audit fails. Accepted advisories are in scripts/accepted-advisories.json.`,
  );
  process.exit(1);
}
console.log(
  `\nAudit passed: ${valid.length} accepted advisory(ies), none new.`,
);

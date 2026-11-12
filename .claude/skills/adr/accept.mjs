#!/usr/bin/env node
// Marks one or more ADRs as accepted, in their files and in the index.
// Usage: node .claude/skills/adr/accept.mjs 8 9
// Exits with code 1, changing nothing, if any of them is not in the "Propuesto" state.

import { readFileSync, readdirSync, writeFileSync } from "node:fs";

const DIRECTORY = "docs/adr";
const INDEX = `${DIRECTORY}/README.md`;
const PROPOSED = "- **Estado:** Propuesto";
const ACCEPTED = "- **Estado:** Aceptado";

const numbers = process.argv
  .slice(2)
  .map((argument) => String(Number(argument)).padStart(4, "0"));
if (numbers.length === 0 || numbers.includes("0NaN")) {
  console.error("Usage: node .claude/skills/adr/accept.mjs <number> [...]");
  process.exit(1);
}

const files = readdirSync(DIRECTORY);
let index = readFileSync(INDEX, "utf8");
const changes = [];
const problems = [];

for (const number of numbers) {
  const file = files.find((name) => name.startsWith(`${number}-`));
  if (!file) {
    problems.push(`ADR-${number} does not exist.`);
    continue;
  }

  const path = `${DIRECTORY}/${file}`;
  const text = readFileSync(path, "utf8");
  const row = index
    .split("\n")
    .find((line) => line.startsWith(`| [${number}](`));

  if (!text.includes(PROPOSED)) {
    problems.push(`ADR-${number} is not in the "Propuesto" state.`);
  } else if (!row || !row.endsWith("| Propuesto |")) {
    problems.push(`ADR-${number} is not "Propuesto" in ${INDEX}.`);
  } else {
    changes.push({ path, text: text.replace(PROPOSED, ACCEPTED) });
    index = index.replace(row, row.replace(/\| Propuesto \|$/, "| Aceptado |"));
  }
}

if (problems.length > 0) {
  for (const problem of problems) console.error(problem);
  process.exit(1);
}

for (const change of changes) {
  writeFileSync(change.path, change.text);
  console.log(`Accepted: ${change.path}`);
}
writeFileSync(INDEX, index);
console.log(`Updated: ${INDEX}`);

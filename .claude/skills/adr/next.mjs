#!/usr/bin/env node
// Computes the number and file name of the next ADR.
// Usage: node .claude/skills/adr/next.mjs "Decision title"
// Prints: number, file path and today's date.

import { readdirSync } from "node:fs";

const DIRECTORY = "docs/adr";

const title = process.argv.slice(2).join(" ").trim();
if (!title) {
  console.error(
    'Missing title. Usage: node .claude/skills/adr/next.mjs "Decision title"',
  );
  process.exit(1);
}

const numbers = readdirSync(DIRECTORY)
  .map((f) => /^(\d{4})-.+\.md$/.exec(f)?.[1])
  .filter(Boolean)
  .map(Number);
const number = String((numbers.length ? Math.max(...numbers) : 0) + 1).padStart(
  4,
  "0",
);

// ADR titles are written in Spanish: strip the accents to build the slug.
const slug = title
  .normalize("NFD")
  .replace(/[̀-ͯ]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "");

const today = new Date();
const date = [today.getFullYear(), today.getMonth() + 1, today.getDate()]
  .map((n, i) => String(n).padStart(i === 0 ? 4 : 2, "0"))
  .join("-");

console.log(`Number: ${number}`);
console.log(`File: ${DIRECTORY}/${number}-${slug}.md`);
console.log(`Date: ${date}`);

// Where GitHub CLI is: on the PATH or, on Windows, in its default folder, which the shells of
// Claude Code do not always have on the PATH. Shared by the scripts of the skills.

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

const GH_WINDOWS = "C:/Program Files/GitHub CLI/gh.exe";

/** The command to run GitHub CLI, or null if it is not installed. */
export function ghPath() {
  try {
    execFileSync("gh", ["--version"], { stdio: "ignore" });
    return "gh";
  } catch {
    return existsSync(GH_WINDOWS) ? GH_WINDOWS : null;
  }
}

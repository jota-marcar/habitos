// Whether node_modules holds what package-lock.json asks for. A checkout keeps the node_modules
// of its last install: when a merge adds or changes a dependency, nothing installs it, and the
// tools that read node_modules fail far from the cause. EAS CLI, for one, reads the Expo config
// on the PC before a build, and stops with a bare "expo config exited with non-zero code" when a
// config plugin is not installed.
// npm writes what it installed to node_modules/.package-lock.json, so both lists are compared.
// Shared by the release scripts (release-guards.mjs) and /sync, which installs them.
// No dependencies of its own: it has to work precisely when node_modules is wrong.

import { readFileSync } from "node:fs";
import path from "node:path";

const NODE_MODULES = "node_modules/";

function packagesIn(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8")).packages ?? {};
  } catch {
    return null;
  }
}

/** Whether an `os` or `cpu` list of package-lock.json, like ["darwin"] or ["!win32"], allows `value`. */
function allows(list, value) {
  if (!Array.isArray(list)) return true;
  if (list.includes(`!${value}`)) return false;
  const wanted = list.filter((item) => !item.startsWith("!"));
  return wanted.length === 0 || wanted.includes(value);
}

/** npm leaves out the optional packages it cannot install and those for other platforms. */
const mayBeAbsent = (entry) =>
  entry.optional === true ||
  !allows(entry.os, process.platform) ||
  !allows(entry.cpu, process.arch);

/**
 * The packages of package-lock.json in `directory` that node_modules lacks or holds in another
 * version, according to what npm recorded at the last install: a folder changed by hand after
 * it goes unnoticed. Empty when there is no package-lock.json.
 */
export function outdatedDependencies(directory = ".") {
  const wanted = packagesIn(path.join(directory, "package-lock.json"));
  if (wanted === null) return [];
  const installed =
    packagesIn(path.join(directory, NODE_MODULES, ".package-lock.json")) ?? {};
  return Object.entries(wanted)
    .filter(
      ([location, entry]) =>
        location !== "" &&
        !(mayBeAbsent(entry) && !(location in installed)) &&
        installed[location]?.version !== entry.version,
    )
    .map(([location]) =>
      location.slice(location.lastIndexOf(NODE_MODULES) + NODE_MODULES.length),
    );
}

/** A short list for a message: the first few names and how many more. */
export function describeDependencies(names) {
  const shown = names.slice(0, 3).join(", ");
  return names.length > 3 ? `${shown} and ${names.length - 3} more` : shown;
}

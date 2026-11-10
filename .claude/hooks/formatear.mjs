#!/usr/bin/env node
// Hook PostToolUse (Edit y Write): formatea con Prettier y corrige con ESLint el fichero editado.
// Si quedan errores de lint que no se corrigen solos, los devuelve al agente para que los arregle.
// Salida 2 = avisar al agente; el mensaje de stderr se le muestra. El cambio ya está hecho.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const FORMATEABLES = /\.(js|cjs|mjs|jsx|ts|tsx|json|yml|yaml)$/;
const LINTEABLES = /\.(js|cjs|mjs|jsx|ts|tsx)$/;

function leerEntrada() {
  try {
    return JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return null;
  }
}

// Ejecuta la herramienta con el mismo Node, sin pasar por los .cmd de node_modules/.bin (Windows).
function ejecutar(raiz, script, args) {
  return spawnSync(process.execPath, [path.join(raiz, script), ...args], {
    cwd: raiz,
    encoding: "utf8",
  });
}

const entrada = leerEntrada();
const fichero = entrada?.tool_input?.file_path;
if (typeof fichero !== "string") process.exit(0);

const raiz = process.env.CLAUDE_PROJECT_DIR || entrada.cwd || process.cwd();
const absoluto = path.resolve(raiz, fichero);
const relativo = path.relative(raiz, absoluto);
// Solo ficheros del proyecto y que sigan existiendo.
if (
  relativo.startsWith("..") ||
  path.isAbsolute(relativo) ||
  !existsSync(absoluto)
) {
  process.exit(0);
}

const prettier = "node_modules/prettier/bin/prettier.cjs";
const eslint = "node_modules/eslint/bin/eslint.js";
// Sin dependencias instaladas no hay nada que hacer.
if (!existsSync(path.join(raiz, prettier))) process.exit(0);

if (FORMATEABLES.test(relativo)) {
  // Respeta .prettierignore (por ejemplo, el Markdown queda fuera).
  ejecutar(raiz, prettier, ["--write", "--log-level", "warn", relativo]);
}

if (LINTEABLES.test(relativo) && existsSync(path.join(raiz, eslint))) {
  const lint = ejecutar(raiz, eslint, ["--fix", "--no-warn-ignored", relativo]);
  if (lint.status !== 0) {
    process.stderr.write(
      `ESLint encuentra problemas en ${relativo} que no ha podido corregir solo:\n` +
        `${lint.stdout || lint.stderr}\nCorrígelos antes de seguir.\n`,
    );
    process.exit(2);
  }
}

process.exit(0);

#!/usr/bin/env node

/**
 * Onion Support · Router activation-path token hardening
 *
 * USO (desde la raíz del repo):
 *   node ONIONSUPPORT_APPLY_ROUTER_ACTIVATION_HARDENING_PROD.js
 *
 * Este archivo NO sustituye src/router/index.js.
 * Lee el router actual, exige el contrato esperado, crea backup fuera de /src,
 * genera el resultado en temporal, valida sintaxis con `node --check` y sólo
 * entonces reemplaza el router de forma atómica.
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const TARGET = path.join(ROOT, "src", "router", "index.js");
const BACKUP_DIR = path.join(ROOT, ".onion-backups");
const EXPECTED_OLD_VERSION = "router.minimal.v9-transition-safe";
const NEW_VERSION = "router.minimal.v9.1-activation-path-token-hardened";

function fail(message) {
  console.error(`\n[ONION ROUTER HARDENING] ERROR: ${message}\n`);
  process.exit(1);
}

function countOccurrences(source, needle) {
  if (!needle) return 0;
  let count = 0;
  let offset = 0;

  while (true) {
    const index = source.indexOf(needle, offset);
    if (index < 0) return count;
    count += 1;
    offset = index + needle.length;
  }
}

function replaceExactlyOnce(source, oldText, newText, label) {
  const count = countOccurrences(source, oldText);

  if (count !== 1) {
    fail(`${label}: se esperaba 1 coincidencia y hay ${count}. No se toca el archivo.`);
  }

  return source.replace(oldText, newText);
}

function checkSyntax(filePath) {
  const result = spawnSync(process.execPath, ["--check", filePath], {
    cwd: ROOT,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || "").trim();
    fail(`node --check falló para ${path.relative(ROOT, filePath)}${detail ? `:\n${detail}` : ""}`);
  }
}

if (!fs.existsSync(TARGET)) {
  fail(`No existe ${path.relative(ROOT, TARGET)}. Ejecuta el script desde la raíz del repo.`);
}

const original = fs.readFileSync(TARGET, "utf8");

if (original.includes(NEW_VERSION)) {
  console.log(`[ONION ROUTER HARDENING] Ya aplicado: ${NEW_VERSION}`);
  checkSyntax(TARGET);
  process.exit(0);
}

if (!original.includes(EXPECTED_OLD_VERSION)) {
  fail(
    `Versión inesperada. Esperaba ${EXPECTED_OLD_VERSION}. ` +
    "No aplico cambios sobre una base distinta."
  );
}

let next = original;

next = replaceExactlyOnce(
  next,
  "   - Mantener /password-reset?token=... como token route pública.\n",
  "   - Mantener /password-reset?token=... como token route pública.\n" +
    "   - Compatibilidad segura con /activate-account/<token> sin persistir el token.\n",
  "cabecera de responsabilidad"
);

next = replaceExactlyOnce(
  next,
  `export const ROUTER_VERSION =\n  "${EXPECTED_OLD_VERSION}";`,
  `export const ROUTER_VERSION =\n  "${NEW_VERSION}";`,
  "ROUTER_VERSION"
);

next = replaceExactlyOnce(
  next,
  `const LEGACY_RESET_TOKEN_REDACT =\n  /(\\/(?:reset-password|password-reset)\\/confirm\\/)([^/?#\\s]+)/gi;`,
  `const LEGACY_RESET_TOKEN_REDACT =\n  /(\\/(?:reset-password|password-reset)\\/confirm\\/)([^/?#\\s]+)/gi;\n\nconst LEGACY_ACTIVATION_TOKEN_PATH =\n  /^\\/activate-account\\/([^/?#]+)(?:\\/)?$/i;\n\nconst LEGACY_ACTIVATION_TOKEN_REDACT =\n  /(\\/activate-account\\/)([^/?#\\s]+)/gi;`,
  "constantes de token en pathname"
);

next = replaceExactlyOnce(
  next,
  `function redactLegacyResetToken(\n  value = ""\n) {\n  return String(\n    value ?? ""\n  ).replace(\n    LEGACY_RESET_TOKEN_REDACT,\n    "$1***"\n  );\n}`,
  `function redactLegacyResetToken(\n  value = ""\n) {\n  return String(\n    value ?? ""\n  )\n    .replace(\n      LEGACY_RESET_TOKEN_REDACT,\n      "$1***"\n    )\n    .replace(\n      LEGACY_ACTIVATION_TOKEN_REDACT,\n      "$1***"\n    );\n}`,
  "redacción de tokens en pathname"
);

next = replaceExactlyOnce(
  next,
  `function isLegacyResetTokenPath(\n  path = HOME_PATH\n) {\n  return (\n    LEGACY_RESET_TOKEN_PATH.test(\n      publicPathname(\n        path\n      )\n    )\n  );\n}`,
  `function isLegacyResetTokenPath(\n  path = HOME_PATH\n) {\n  const pathname =\n    publicPathname(\n      path\n    );\n\n  return Boolean(\n    LEGACY_RESET_TOKEN_PATH.test(\n      pathname\n    ) ||\n    LEGACY_ACTIVATION_TOKEN_PATH.test(\n      pathname\n    )\n  );\n}\n\nfunction sensitivePathCanonical(\n  path = HOME_PATH\n) {\n  const pathname =\n    publicPathname(\n      path\n    );\n\n  if (\n    LEGACY_RESET_TOKEN_PATH.test(\n      pathname\n    )\n  ) {\n    return (\n      ROUTES.passwordReset ||\n      "/password-reset"\n    );\n  }\n\n  if (\n    LEGACY_ACTIVATION_TOKEN_PATH.test(\n      pathname\n    )\n  ) {\n    return (\n      ROUTES.activateAccount ||\n      "/activate-account"\n    );\n  }\n\n  return "";\n}`,
  "detección/canonicalización de token en pathname"
);

next = replaceExactlyOnce(
  next,
  `  const publicPath =\n    normalizePublicPath(\n      match\n        ?.publicPath ||\n      matchOrPath ||\n      HOME_PATH\n    );\n\n  if (\n    isLegacyResetTokenPath(\n      publicPath\n    )\n  ) {\n    return normalizePathname(\n      match\n        ?.canonicalPath ||\n      canonicalPathFromPublicPath(\n        publicPath\n      ) ||\n      HOME_PATH\n    );\n  }`,
  `  const publicPath =\n    normalizePublicPath(\n      match\n        ?.publicPath ||\n      matchOrPath ||\n      HOME_PATH\n    );\n\n  const sensitiveCanonical =\n    sensitivePathCanonical(\n      publicPath\n    );\n\n  if (\n    sensitiveCanonical\n  ) {\n    return normalizePathname(\n      sensitiveCanonical\n    );\n  }`,
  "stateSafePublicPath"
);

if (next === original) {
  fail("No se generaron cambios.");
}

for (const required of [
  NEW_VERSION,
  "LEGACY_ACTIVATION_TOKEN_PATH",
  "LEGACY_ACTIVATION_TOKEN_REDACT",
  "sensitivePathCanonical",
]) {
  if (!next.includes(required)) {
    fail(`El resultado no contiene ${required}.`);
  }
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
fs.mkdirSync(BACKUP_DIR, { recursive: true });
const backupPath = path.join(BACKUP_DIR, `router-index.${stamp}.js`);
const tempPath = path.join(
  path.dirname(TARGET),
  `router.index.onion-next-${process.pid}.js`
);

fs.writeFileSync(backupPath, original, "utf8");
fs.writeFileSync(tempPath, next, "utf8");

try {
  checkSyntax(tempPath);
  fs.renameSync(tempPath, TARGET);
  checkSyntax(TARGET);
} catch (error) {
  try {
    if (fs.existsSync(tempPath)) fs.rmSync(tempPath, { force: true });
    fs.copyFileSync(backupPath, TARGET);
  } catch {
    // El error original es el relevante.
  }
  throw error;
}

console.log("\n[ONION ROUTER HARDENING] OK");
console.log(`- Router: ${path.relative(ROOT, TARGET)}`);
console.log(`- Versión: ${NEW_VERSION}`);
console.log(`- Backup: ${path.relative(ROOT, backupPath)}`);
console.log("- node --check: OK");
console.log("\nSiguiente validación:");
console.log("  git diff --check && git diff -- src/router/index.js");

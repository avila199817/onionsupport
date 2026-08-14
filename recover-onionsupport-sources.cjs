/*
===============================================================================
ONION SUPPORT · RECUPERACIÓN DE FUENTES SOBRESCRITAS
===============================================================================

IMPORTANTE
----------
ESTE ARCHIVO ES UN SCRIPT DE RECUPERACIÓN.
NO PEGAR SU CONTENIDO DENTRO DE src/core/index.js NI DE NINGÚN MÓDULO ESM.

Uso:
  1) Guarda/renombra este archivo como:
       recover-onionsupport-sources.cjs

  2) Colócalo en la RAÍZ del repositorio Onion Support.

  3) Ejecuta primero:
       node recover-onionsupport-sources.cjs --dry-run

  4) Si termina en OK:
       node recover-onionsupport-sources.cjs

Qué recupera:
  - src/core/index.js
  - src/features/auth/index.js
  - src/core/http.js
  - src/views/home/home.api.js

Fuente:
  blobs Git exactos de las últimas versiones funcionales revisadas
  ANTES de que los scripts de parcheo sustituyeran accidentalmente
  los módulos fuente.

Después de recuperar:
  - NO aplica todavía los hardenings.
  - Primero devuelve la SPA a un estado arrancable y verificable.
  - Después reintroduciremos las correcciones como FUENTES finales,
    no como parcheadores pegados dentro de los módulos.

===============================================================================
*/

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync, spawnSync } = require("node:child_process");

const FILES = Object.freeze([
  {
    path: "src/core/index.js",
    blob: "933a4bb706480b6850a0be9f1566710e52579e13",
    version: "core.minimal.v6-hardened",
    required: [
      "export const AppCore =",
      "export default AppCore;",
    ],
  },
  {
    path: "src/features/auth/index.js",
    blob: "dc4187909317f54db31fe7621fa8b455dee22c5f",
    version: "auth.minimal.v6.1-first-hotfix",
    required: [
      "export const Auth =",
      "export default Auth;",
    ],
  },
  {
    path: "src/core/http.js",
    blob: "e3c4c663e29d16be606d793da61f9473783c383f",
    version: "core.http.refresh.blob.v6-hardened",
    required: [
      "export async function request(",
      "export function setAuthTokens(",
    ],
  },
  {
    path: "src/views/home/home.api.js",
    blob: "7d15bbbbe2bacbc384ed891cbbbe5900759da693",
    version: "home.api.domain-aggregator.v9.invoice-stats-endpoint",
    required: [
      "export async function loadHomeDashboard(",
      "export function clearHomeDashboardCache(",
    ],
  },
]);

const PATCHER_MARKERS = Object.freeze([
  "ONION SUPPORT · CORE IDENTITY CONTRACT HARDENING",
  "ONION SUPPORT · HOTFIX FULL NAME / USER ENVELOPE",
  "ONION SUPPORT · HTTP AUTH/REFRESH CONTRACT HARDENING",
  "ONION SUPPORT · HOME CONTEXT / CACHE / ROLE HARDENING",
]);

function log(type, message) {
  console.log(`[${type}] ${message}`);
}

function fail(message) {
  console.error(`\n[ERROR] ${message}\n`);
  process.exitCode = 1;
}

function sha256(buffer) {
  return crypto
    .createHash("sha256")
    .update(buffer)
    .digest("hex");
}

function timestamp() {
  const d = new Date();
  const p = (v) => String(v).padStart(2, "0");

  return [
    d.getFullYear(),
    p(d.getMonth() + 1),
    p(d.getDate()),
    "-",
    p(d.getHours()),
    p(d.getMinutes()),
    p(d.getSeconds()),
  ].join("");
}

function runGit(args, options = {}) {
  return execFileSync(
    "git",
    args,
    {
      cwd: options.cwd || process.cwd(),
      encoding: options.encoding ?? "utf8",
      stdio: options.stdio || ["ignore", "pipe", "pipe"],
      maxBuffer: 64 * 1024 * 1024,
    }
  );
}

function getRepoRoot() {
  try {
    return runGit(
      ["rev-parse", "--show-toplevel"]
    ).trim();
  } catch {
    throw new Error(
      "No estás dentro de un repositorio Git. Ejecuta el script desde la raíz de Onion Support."
    );
  }
}

function blobExists(repoRoot, blob) {
  const result = spawnSync(
    "git",
    ["cat-file", "-e", `${blob}^{blob}`],
    {
      cwd: repoRoot,
      stdio: "ignore",
    }
  );

  return result.status === 0;
}

function ensureBlobs(repoRoot) {
  let missing = FILES.filter(
    (item) => !blobExists(repoRoot, item.blob)
  );

  if (!missing.length) {
    log("OK", "Los 4 blobs originales están disponibles en el repositorio local.");
    return;
  }

  log(
    "WARN",
    `Faltan ${missing.length} blob(s) localmente. Intentando git fetch --all --tags --prune...`
  );

  const fetch = spawnSync(
    "git",
    ["fetch", "--all", "--tags", "--prune"],
    {
      cwd: repoRoot,
      stdio: "inherit",
    }
  );

  if (fetch.status !== 0) {
    throw new Error(
      "git fetch falló y faltan objetos necesarios para la recuperación."
    );
  }

  missing = FILES.filter(
    (item) => !blobExists(repoRoot, item.blob)
  );

  if (missing.length) {
    throw new Error(
      "Siguen faltando estos blobs: " +
      missing.map((item) => `${item.path}=${item.blob}`).join(", ")
    );
  }

  log("OK", "Los blobs fueron recuperados desde el remoto.");
}

function readBlob(repoRoot, blob) {
  const buffer = execFileSync(
    "git",
    ["cat-file", "blob", blob],
    {
      cwd: repoRoot,
      encoding: "buffer",
      maxBuffer: 64 * 1024 * 1024,
    }
  );

  if (!buffer?.length) {
    throw new Error(`Blob vacío o ilegible: ${blob}`);
  }

  return buffer;
}

function validateSource(item, buffer) {
  const text = buffer.toString("utf8");

  if (!text.includes(item.version)) {
    throw new Error(
      `${item.path}: no contiene la versión esperada "${item.version}".`
    );
  }

  for (const token of item.required) {
    if (!text.includes(token)) {
      throw new Error(
        `${item.path}: falta la firma obligatoria: ${token}`
      );
    }
  }

  for (const marker of PATCHER_MARKERS) {
    if (text.includes(marker)) {
      throw new Error(
        `${item.path}: el blob contiene un marcador de parcheador y NO es una fuente válida.`
      );
    }
  }

  if (
    text.includes('const fs = require("node:fs")') ||
    text.includes("recover-onionsupport-sources.cjs")
  ) {
    throw new Error(
      `${item.path}: parece un script Node/CJS y no el módulo ESM esperado.`
    );
  }

  return true;
}

function syntaxCheck(target) {
  const result = spawnSync(
    process.execPath,
    ["--check", target],
    {
      encoding: "utf8",
    }
  );

  if (result.status !== 0) {
    throw new Error(
      `${target}: node --check falló:\n${result.stderr || result.stdout}`
    );
  }

  return true;
}

function writeAtomic(target, buffer) {
  const dir = path.dirname(target);
  fs.mkdirSync(dir, { recursive: true });

  const temp = path.join(
    dir,
    `.${path.basename(target)}.recover-${process.pid}-${Date.now()}.tmp`
  );

  try {
    fs.writeFileSync(temp, buffer, { flag: "wx" });
    fs.renameSync(temp, target);
  } catch (error) {
    try {
      if (fs.existsSync(temp)) fs.unlinkSync(temp);
    } catch {
      // noop
    }
    throw error;
  }
}

function parseArgs() {
  return {
    dryRun: process.argv.includes("--dry-run"),
  };
}

function main() {
  const { dryRun } = parseArgs();
  const repoRoot = getRepoRoot();

  log("INFO", `Repositorio: ${repoRoot}`);
  log("INFO", `Modo: ${dryRun ? "DRY RUN" : "RECUPERACIÓN REAL"}`);

  ensureBlobs(repoRoot);

  const recovered = [];

  for (const item of FILES) {
    const target = path.join(repoRoot, item.path);
    const blobBuffer = readBlob(repoRoot, item.blob);

    validateSource(item, blobBuffer);

    const beforeExists = fs.existsSync(target);
    const before = beforeExists ? fs.readFileSync(target) : null;

    const same =
      before &&
      Buffer.compare(before, blobBuffer) === 0;

    log(
      "INFO",
      `${item.path}: blob=${item.blob} sha256=${sha256(blobBuffer).slice(0, 16)}…`
    );

    if (same) {
      log("OK", `${item.path}: ya coincide exactamente con el blob bueno.`);
      recovered.push({
        path: item.path,
        status: "already-good",
      });
      continue;
    }

    if (dryRun) {
      log(
        "DRY",
        `${item.path}: sería sustituido por la fuente ESM conocida y validada.`
      );
      recovered.push({
        path: item.path,
        status: "would-recover",
      });
      continue;
    }

    if (beforeExists) {
      const backup = `${target}.broken-${timestamp()}`;
      fs.copyFileSync(target, backup, fs.constants.COPYFILE_EXCL);
      log("OK", `${item.path}: backup del archivo roto -> ${backup}`);
    }

    writeAtomic(target, blobBuffer);

    const written = fs.readFileSync(target);

    if (Buffer.compare(written, blobBuffer) !== 0) {
      throw new Error(
        `${item.path}: la verificación byte-a-byte después de escribir falló.`
      );
    }

    validateSource(item, written);
    syntaxCheck(target);

    log("OK", `${item.path}: recuperado y node --check OK.`);

    recovered.push({
      path: item.path,
      status: "recovered",
    });
  }

  console.log("\n==============================================");
  console.log("RESULTADO");
  console.log("==============================================");

  for (const item of recovered) {
    console.log(`- ${item.path}: ${item.status}`);
  }

  if (dryRun) {
    console.log(
      "\nDRY RUN terminado: NO se ha modificado ningún archivo."
    );
    console.log(
      "Si todo aparece correcto, ejecuta:\n  node recover-onionsupport-sources.cjs"
    );
    return;
  }

  console.log(
    "\nRECUPERACIÓN COMPLETADA."
  );

  console.log(
    "\nAhora haz una recarga forzada del navegador (Ctrl+F5)."
  );

  console.log(
    "El error «does not provide an export named AppCore» debe desaparecer."
  );

  console.log(
    "\nIMPORTANTE: esta recuperación restaura las fuentes buenas originales."
  );

  console.log(
    "Después volveremos a aplicar el fix de fullName de forma correcta sobre los módulos fuente."
  );
}

try {
  main();
} catch (error) {
  fail(error?.stack || error?.message || String(error));
}

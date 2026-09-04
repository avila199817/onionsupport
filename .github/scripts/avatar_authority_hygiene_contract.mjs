#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const SRC = path.join(ROOT, "src");
const AUTHORITY_ROOT = path.normalize(
  path.join(SRC, "features/avatar-system")
);
const AUTHORITY_FILES = new Set([
  path.normalize(path.join(SRC, "css/components/avatar-system.css")),
]);

const SOURCE_EXTENSIONS = new Set([".js", ".mjs", ".css"]);

function walk(directory) {
  const output = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      output.push(...walk(absolute));
      continue;
    }
    if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) output.push(absolute);
  }
  return output;
}

function relative(file) {
  return path.relative(ROOT, file).replace(/\\/g, "/");
}

function executableJs(source = "") {
  return String(source)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

const LOCAL_AVATAR_PALETTE_HASH = /\b(?:Math\.abs\([^;]*?\)|hash(?:Identity|Text)?\([^;]*?\))\s*%\s*(?:10|20)\b/g;

// Formatting must not hide a second palette engine from the architectural gate.
for (const sample of [
  'hashText("person") % 10',
  'hashText(\n  `${userId}:${email}:${name}`\n) % 10',
  'Math.abs(\n  Number(current.tone)\n) % 20',
]) {
  assert.equal(new RegExp(LOCAL_AVATAR_PALETTE_HASH).test(sample), true);
}

const violations = [];

function report(file, rule, detail) {
  violations.push(`${relative(file)} :: ${rule} :: ${detail}`);
}

for (const file of walk(SRC)) {
  const normalized = path.normalize(file);
  if (
    normalized === AUTHORITY_ROOT ||
    normalized.startsWith(`${AUTHORITY_ROOT}${path.sep}`) ||
    AUTHORITY_FILES.has(normalized)
  ) {
    continue;
  }

  const raw = fs.readFileSync(file, "utf8");
  const source = path.extname(file) === ".css" ? raw : executableJs(raw);

  const rules = [
    [
      /\bfunction\s+(?:avatarTone|avatarToneFromIdentity|getAvatarToneClass|resolveAvatarTone)\s*\(/g,
      "local-avatar-tone-function",
    ],
    [
      LOCAL_AVATAR_PALETTE_HASH,
      "local-avatar-palette-hash",
    ],
    [
      /\bfunction\s+(?:avatarInitials|initials|initialsFrom(?:Name)?)\s*\(/g,
      "local-avatar-initials-function",
    ],
    [
      /(?:avatar[^\n{]*--tone-|avatar-tone-)(?:[0-9]\b|\$\{)/g,
      "legacy-tone-class",
    ],
    [
      /\[data-avatar-tone=["'][0-9]+["']\]/g,
      "enumerated-data-avatar-tone-outside-authority",
    ],
    [
      /IncidenciasAvatarFallbackInternals/g,
      "incidencias-avatar-internals-coupling",
    ],
  ];

  for (const [pattern, rule] of rules) {
    for (const match of source.matchAll(pattern)) {
      const detail = match[0].replace(/\s+/g, " ").slice(0, 160);
      report(file, rule, detail);
    }
  }
}

if (violations.length) {
  console.error("\nAvatar authority hygiene violations:\n");
  for (const violation of violations) console.error(` - ${violation}`);
  console.error(`\nTotal: ${violations.length}\n`);
}

assert.equal(
  violations.length,
  0,
  "Toda identidad/paleta de avatar debe delegar en la autoridad global de AvatarSystem"
);

console.log(
  "Avatar authority hygiene: PASS · Microsoft Persona palette only in global authority · no local avatar color engines"
);
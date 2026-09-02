#!/usr/bin/env node

import fs from "node:fs";

const path = ".github/scripts/repo_integrity.py";
let source = fs.readFileSync(path, "utf8");

const legacy = `            "clientes.template.cursor.v12.private-admin-visual-parity",\n            "clientes-avatar--tone-\${avatarTone(current)}",\n            "clientes-table-loading-row",`;
const canonical = `            "clientes.template.cursor.v12.private-admin-visual-parity",\n            "resolveAvatarPresentation",\n            'data-avatar-system="true"',\n            'data-avatar-host="true"',\n            'data-avatar-tone="\${attr(String(presentation.tone))}"',\n            "clientes-table-loading-row",`;

if (!source.includes(legacy)) {
  throw new Error("repo_integrity.py: no se encontró el hook V16 legacy esperado");
}
source = source.replace(legacy, canonical);

fs.writeFileSync(path, source, "utf8");
console.log("Repository V16 avatar contract migrated to global authority.");

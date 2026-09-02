#!/usr/bin/env node

import fs from "node:fs";

const path = "src/features/incidencia-modal-bridge/index.js";
let source = fs.readFileSync(path, "utf8");

const replacements = [
  [
    '    import("../incidencias-avatar-fallback/index.js"),',
    '    import("../incidencias-comment-avatars/index.js"),',
    "import del adaptador de comentarios",
  ],
  [
    '    .then(([fallback, followup]) => {\n      fallback?.mountIncidenciasAvatarFallback?.();\n      followup?.mountIncidenciasFollowupAvatars?.();',
    '    .then(([comments, followup]) => {\n      comments?.mountIncidenciasCommentAvatars?.();\n      followup?.mountIncidenciasFollowupAvatars?.();',
    "mount de mejoras de avatar",
  ],
  [
    '        fallback,\n        followup,',
    '        comments,\n        followup,',
    "snapshot de mejoras",
  ],
  [
    '    enhancements.fallback?.syncIncidenciasCommentAvatars?.(document);',
    '    enhancements.comments?.syncIncidenciasCommentAvatars?.(document);',
    "sync del timeline",
  ],
];

for (const [from, to, label] of replacements) {
  const count = source.split(from).length - 1;
  if (count !== 1) {
    throw new Error(`${label}: esperaba 1 coincidencia y obtuvo ${count}`);
  }
  source = source.replace(from, to);
}

if (source.includes("incidencias-avatar-fallback")) {
  throw new Error("el bridge todavía referencia incidencias-avatar-fallback");
}

fs.writeFileSync(path, source, "utf8");
console.log("Incidencia modal bridge migrated to canonical comment avatar adapter.");

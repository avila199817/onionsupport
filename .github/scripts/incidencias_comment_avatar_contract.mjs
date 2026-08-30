import assert from "node:assert/strict";
import fs from "node:fs";

const FEATURE_PATH =
  "src/features/incidencias-avatar-fallback/index.js";

const source = fs.readFileSync(FEATURE_PATH, "utf8");

assert.match(
  source,
  /incidencias\.avatar-fallback\.v2\.comment-authors/u,
  "la mejora debe versionar explícitamente los avatares de comentaristas"
);

assert.match(
  source,
  /\.incidencias-timeline-card\.is-comment \.incidencias-timeline-meta/u,
  "los avatares deben limitarse a comentarios reales del timeline"
);

assert.match(
  source,
  /\.incidencias-modal-avatar\[title\]/u,
  "el avatar del solicitante debe reutilizar la identidad ya renderizada por el modal"
);

assert.match(
  source,
  /\[data-modal-technician='true'\]\[data-technician-assigned='true'\]/u,
  "el avatar del técnico debe reutilizar el perfil asignado ya renderizado"
);

assert.match(
  source,
  /document\.createElement\("img"\)/u,
  "el comentario debe recibir únicamente la foto, sin una tarjeta decorativa nueva"
);

assert.doesNotMatch(
  source,
  /createCommentAvatar[\s\S]*?document\.createElement\("(?:div|article|section)"\)/u,
  "no se deben crear recuadros o contenedores visuales nuevos para el avatar"
);

assert.match(
  source,
  /inline-size:\s*22px;[\s\S]*?block-size:\s*22px;/u,
  "el avatar del comentario debe mantenerse pequeño y alineado con autor/fecha"
);

assert.match(
  source,
  /border:\s*0;[\s\S]*?background:\s*transparent;[\s\S]*?box-shadow:\s*none;/u,
  "la foto no debe añadir borde, badge, fondo ni sombra"
);

assert.match(
  source,
  /@media \(max-width: 720px\)/u,
  "el alineado debe respetar el breakpoint existente del modal"
);

assert.match(
  source,
  /MutationObserver/u,
  "los avatares deben sobrevivir rerenders del modal y comentarios nuevos"
);

console.log(
  "Incidencias comment avatar contract OK · real requester/technician photos · no extra card · responsive alignment"
);

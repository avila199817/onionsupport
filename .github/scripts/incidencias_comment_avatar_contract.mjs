import assert from "node:assert/strict";
import fs from "node:fs";

const FEATURE_PATH =
  "src/features/incidencias-avatar-fallback/index.js";

const source = fs.readFileSync(FEATURE_PATH, "utf8");

assert.match(
  source,
  /incidencias\.avatar-fallback\.v3\.comment-identity-first/u,
  "la mejora debe versionar explícitamente el matching identity-first"
);

assert.match(
  source,
  /loadIncidenciaDetail/u,
  "el enhancement debe reutilizar el coordinador canónico de detalle"
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
  /entry\.byUserId/u,
  "los comentarios deben reconocer el userId estable persistido por backend"
);

assert.match(
  source,
  /entry\.byEmail/u,
  "los comentarios deben reconocer el email estable persistido por backend"
);

assert.match(
  source,
  /stableIdentity\?\.hasStableIdentity/u,
  "una identidad estable debe tener prioridad sobre el matching por nombre"
);

assert.match(
  source,
  /return matchProfileByStableIdentity\(stableIdentity, profiles\)/u,
  "cuando existe identidad estable no debe existir fallback silencioso por nombre"
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

const feature = await import(
  new URL(`../../${FEATURE_PATH}`, import.meta.url)
);

const {
  buildCommentIdentityIndex,
  resolveCommentProfile,
} = feature.IncidenciasAvatarFallbackInternals;

const requester = Object.freeze({
  source: "requester",
  name: "Cristian Ávila Luque",
  userId: "on-requester",
  email: "requester@example.com",
  src: "https://example.test/requester.jpg",
});

const technician = Object.freeze({
  source: "technician",
  name: "Cristian Ávila",
  userId: "on-technician",
  email: "technician@example.com",
  src: "https://example.test/technician.jpg",
});

const profiles = [requester, technician];

{
  const index = buildCommentIdentityIndex({
    comments: [
      {
        byName: "Cristian Ávila",
        byUserId: "on-technician",
        byEmail: "technician@example.com",
      },
    ],
  });

  assert.equal(
    resolveCommentProfile("Cristian Ávila", index, profiles)?.source,
    "technician",
    "el userId/email estable debe resolver el técnico aunque los nombres se solapen"
  );
}

{
  const index = buildCommentIdentityIndex({
    comments: [
      {
        byName: "Cristian Ávila",
        byUserId: "on-third-person",
        byEmail: "third@example.com",
      },
    ],
  });

  assert.equal(
    resolveCommentProfile("Cristian Ávila", index, profiles),
    null,
    "un ID/email estable que no coincide debe fallar cerrado y no apropiarse de una foto por nombre"
  );
}

{
  const index = buildCommentIdentityIndex({
    comments: [
      {
        byName: "Cristian Ávila Luque",
      },
    ],
  });

  assert.equal(
    resolveCommentProfile("Cristian Ávila Luque", index, profiles)?.source,
    "requester",
    "los comentarios legacy sin identidad estable deben conservar compatibilidad por nombre exacto"
  );
}

console.log(
  "Incidencias comment avatar contract OK · identity-first userId/email · legacy name fallback · no extra card"
);

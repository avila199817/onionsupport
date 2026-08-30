import assert from "node:assert/strict";
import fs from "node:fs";

const FEATURE_PATH =
  "src/features/incidencias-avatar-fallback/index.js";
const FOLLOWUP_PATH =
  "src/features/incidencias-followup-avatars/index.js";
const ENHANCEMENTS_PATH =
  "src/app/enhancements.js";

const source = fs.readFileSync(FEATURE_PATH, "utf8");
const followupSource = fs.readFileSync(FOLLOWUP_PATH, "utf8");
const enhancementsSource = fs.readFileSync(ENHANCEMENTS_PATH, "utf8");

assert.match(
  source,
  /incidencias\.avatar-fallback\.v4\.comment-identity-modal-scope/u,
  "la mejora debe versionar explícitamente identidad estable y scope de modal"
);

assert.match(
  source,
  /loadIncidenciaDetail/u,
  "el enhancement debe reutilizar el coordinador canónico de detalle"
);

assert.match(
  source,
  /const detailIdentityState = new WeakMap\(\)/u,
  "la identidad hidratada debe vivir por nodo de modal y poder liberarse al cerrar"
);

assert.doesNotMatch(
  source,
  /detailIdentityCache\s*=\s*new Map/u,
  "no se permite una caché eterna por ticketId para la identidad visual"
);

assert.match(
  source,
  /\.incidencias-timeline-card\.is-comment \.incidencias-timeline-meta/u,
  "el historial independiente debe seguir admitiendo avatares"
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
  followupSource,
  /incidencias\.followup-avatars\.v1\.identity-first/u,
  "Seguimiento debe tener una mejora específica y versionada"
);

assert.match(
  followupSource,
  /\.incidencias-modal-description-comment-head/u,
  "la foto debe apuntar al renderer real de Seguimiento visible en Details"
);

assert.match(
  followupSource,
  /IncidenciasAvatarFallbackInternals/u,
  "Seguimiento debe reutilizar la política identity-first ya validada"
);

assert.match(
  followupSource,
  /buildCommentIdentityIndex/u,
  "Seguimiento debe resolver comentarios desde identidad estable del detalle"
);

assert.match(
  followupSource,
  /resolveCommentProfile/u,
  "Seguimiento debe fallar cerrado cuando la identidad no coincide"
);

assert.match(
  followupSource,
  /document\.createElement\("img"\)/u,
  "Seguimiento debe insertar una foto real junto al autor"
);

assert.match(
  followupSource,
  /incidencias-modal-description-comment-author/u,
  "foto y nombre deben viajar juntos sin alterar la fecha del comentario"
);

assert.match(
  followupSource,
  /inline-size:\s*22px;[\s\S]*?block-size:\s*22px;/u,
  "el avatar visible de Seguimiento debe medir exactamente 22px"
);

assert.match(
  followupSource,
  /border:\s*0;[\s\S]*?border-radius:\s*50%;[\s\S]*?background:\s*transparent;[\s\S]*?box-shadow:\s*none;/u,
  "la foto de Seguimiento no debe añadir borde, badge, fondo ni sombra"
);

assert.match(
  followupSource,
  /MutationObserver/u,
  "las fotos de Seguimiento deben sobrevivir rerenders y comentarios nuevos"
);

assert.match(
  enhancementsSource,
  /key:\s*"incidencias-followup-avatars"[\s\S]*?scope:\s*"incidencias"[\s\S]*?features\/incidencias-followup-avatars\/index\.js/u,
  "la mejora visible de Seguimiento debe cargarse únicamente en Incidencias"
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
  "Incidencias comment avatar contract OK · visible Seguimiento + timeline · identity-first · 22px"
);

import assert from "node:assert/strict";
import fs from "node:fs";

const FEATURE_PATH =
  "src/features/incidencias-avatar-fallback/index.js";
const FOLLOWUP_PATH =
  "src/features/incidencias-followup-avatars/index.js";
const FOLLOWUP_STYLE_PATH =
  "src/features/incidencias-followup-avatars/style.css";
const ENHANCEMENTS_PATH =
  "src/app/enhancements.js";

const source = fs.readFileSync(FEATURE_PATH, "utf8");
const followupSource = fs.readFileSync(FOLLOWUP_PATH, "utf8");
const followupStyle = fs.readFileSync(FOLLOWUP_STYLE_PATH, "utf8");
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
  /incidencias\.followup-avatars\.v2\.premium-horizontal/u,
  "Seguimiento debe versionar explícitamente la presentación premium horizontal"
);

assert.match(
  followupSource,
  /import\s+"\.\/style\.css";/u,
  "la presentación del avatar debe estar co-localizada como CSS del feature"
);

assert.doesNotMatch(
  followupSource,
  /createElement\("style"\)/u,
  "el feature no debe inyectar CSS dinámico desde JavaScript"
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
  /image\.width\s*=\s*28;[\s\S]*?image\.height\s*=\s*28;/u,
  "el elemento img debe declarar 28x28 para reservar geometría antes de cargar"
);

assert.match(
  followupStyle,
  /grid-template-columns:\s*28px\s+minmax\(0,\s*1fr\)/u,
  "el wrapper de autor debe reservar una primera columna fija para la foto"
);

assert.match(
  followupStyle,
  /inline-size:\s*28px;[\s\S]*?block-size:\s*28px;/u,
  "el avatar premium de escritorio debe medir 28px"
);

assert.match(
  followupStyle,
  /border-radius:\s*999px;/u,
  "el avatar debe ser inequívocamente circular"
);

assert.match(
  followupStyle,
  /border:\s*1px solid color-mix/u,
  "el acabado premium debe usar un borde sutil derivado del design system"
);

assert.match(
  followupStyle,
  /0 0 0 2px color-mix[\s\S]*?0 2px 8px rgba\(0, 0, 0, \.22\)/u,
  "el avatar debe tener ring y profundidad discretos, no una tarjeta nueva"
);

assert.match(
  followupStyle,
  /@media \(max-width: 720px\)[\s\S]*?inline-size:\s*26px;[\s\S]*?block-size:\s*26px;/u,
  "móvil debe compactar el avatar a 26px manteniendo la relación horizontal"
);

assert.match(
  followupStyle,
  /@media \(forced-colors: active\)/u,
  "el acabado debe conservar una alternativa accesible en forced-colors"
);

assert.doesNotMatch(
  followupStyle,
  /!important/u,
  "el CSS del avatar no debe depender de !important"
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
  "Incidencias comment avatar contract OK · Seguimiento premium horizontal · identity-first · 28/26px"
);

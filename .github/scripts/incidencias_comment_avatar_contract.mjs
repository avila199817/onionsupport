import assert from "node:assert/strict";
import fs from "node:fs";

const FEATURE_PATH =
  "src/features/incidencias-avatar-fallback/index.js";
const FOLLOWUP_PATH =
  "src/features/incidencias-followup-avatars/index.js";
const FOLLOWUP_STYLE_PATH =
  "src/features/incidencias-followup-avatars/style.css";
const DETAIL_MODAL_STYLE_PATH =
  "src/css/components/detail-modal.css";
const DETAIL_EXPERIENCE_PATH =
  "src/features/incidencias-detail-experience/index.js";
const PRIVATE_INTERACTIONS_STYLE_PATH =
  "src/css/compositions/private-admin-interactions.css";
const ENHANCEMENTS_PATH =
  "src/app/enhancements.js";

const source = fs.readFileSync(FEATURE_PATH, "utf8");
const followupSource = fs.readFileSync(FOLLOWUP_PATH, "utf8");
const followupStyle = fs.readFileSync(FOLLOWUP_STYLE_PATH, "utf8");
const detailModalStyle = fs.readFileSync(DETAIL_MODAL_STYLE_PATH, "utf8");
const detailExperienceSource = fs.readFileSync(DETAIL_EXPERIENCE_PATH, "utf8");
const privateInteractionsStyle = fs.readFileSync(
  PRIVATE_INTERACTIONS_STYLE_PATH,
  "utf8"
);
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
  /incidencias\.followup-avatars\.v4\.canonical-visual/u,
  "Seguimiento debe versionar explícitamente la piel visual canónica compartida"
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
  /avatar\.className\s*=\s*[\s\S]*?AVATAR_CLASS[\s\S]*?CANONICAL_AVATAR_FRAME_CLASS/u,
  "el comentario debe montar el mismo frame ui-detail-modal-avatar-frame del encabezado"
);

assert.match(
  followupSource,
  /fallback\.className\s*=\s*[\s\S]*?AVATAR_FALLBACK_CLASS[\s\S]*?CANONICAL_AVATAR_FALLBACK_CLASS/u,
  "las iniciales deben reutilizar el fallback estructural canónico"
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
  /document\.createElement\("span"\)[\s\S]*?fallback\.textContent\s*=\s*avatarInitials\(authorText\)/u,
  "cada autor debe recibir un frame estable con sus iniciales canónicas"
);

assert.match(
  followupSource,
  /if \(profile\?\.src\)[\s\S]*?document\.createElement\("img"\)/u,
  "la foto real debe ser una mejora opcional sobre el fallback, no un requisito"
);

assert.doesNotMatch(
  followupSource,
  /if \(!profile\?\.src\)[\s\S]{0,120}removeAvatar/u,
  "un autor sin foto nunca debe perder su avatar de iniciales"
);

assert.match(
  followupSource,
  /image\.addEventListener\([\s\S]*?"error"[\s\S]*?image\.remove\(\)[\s\S]*?setAvatarState/u,
  "una foto rota debe volver al fallback conservando el frame"
);

assert.match(
  followupSource,
  /if \(!state\?\.detail\)[\s\S]*?syncHead\(head\)[\s\S]*?queueHydration/u,
  "las iniciales deben aparecer antes de terminar la hidratación de identidad"
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
  detailModalStyle,
  /\.ui-detail-modal-avatar-frame\s*\{[\s\S]*?border:\s*1px solid color-mix[\s\S]*?background:\s*linear-gradient\(135deg,[\s\S]*?box-shadow:\s*inset 0 1px 0 color-mix/u,
  "gradiente, borde y brillo deben pertenecer al componente canónico compartido"
);

assert.match(
  detailModalStyle,
  /\.ui-detail-modal-avatar-frame\[data-avatar-tone="3"\][\s\S]*?--ui-detail-avatar-a:\s*var\(--error\);[\s\S]*?--ui-detail-avatar-b:\s*var\(--warning\);/u,
  "Carlos debe conservar la pareja error-warning del mismo selector que el encabezado"
);

assert.match(
  detailExperienceSource,
  /date\.className\s*=\s*"incidencias-modal-description-comment-date"/u,
  "la fecha del comentario debe exponer una clase semántica propia"
);

assert.match(
  privateInteractionsStyle,
  /\.incidencias-modal-description-comment-date\s*\{[\s\S]*?color:\s*var\(--text-muted\);/u,
  "sólo la fecha debe consumir la tipografía secundaria del comentario"
);

assert.doesNotMatch(
  privateInteractionsStyle,
  /\.incidencias-modal-description-comment-head\s+span\s*\{/u,
  "la tipografía contextual no puede alcanzar avatares u otros spans del encabezado"
);

assert.doesNotMatch(
  followupStyle,
  /--followup-avatar-|linear-gradient|box-shadow:\s|\[data-avatar-tone=|(?:^|\n)\s*(?:color|background|border)\s*:/u,
  "Seguimiento no puede mantener una segunda paleta o textura visual"
);

assert.match(
  followupStyle,
  /@media \(max-width: 720px\)[\s\S]*?inline-size:\s*26px;[\s\S]*?block-size:\s*26px;/u,
  "móvil debe compactar el avatar a 26px manteniendo la relación horizontal"
);

assert.match(
  detailModalStyle,
  /@media \(forced-colors: active\)[\s\S]*?\.ui-detail-modal-avatar-frame\s*\{[\s\S]*?background:\s*Canvas;[\s\S]*?box-shadow:\s*none;/u,
  "la alternativa forced-colors también debe pertenecer al componente compartido"
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
  avatarInitials,
  avatarToneFromIdentity,
  buildCommentIdentityIndex,
  resolveCommentProfile,
} = feature.IncidenciasAvatarFallbackInternals;

assert.equal(
  avatarInitials("Carlos Yepes Garcia"),
  "CY",
  "Carlos debe usar las dos primeras iniciales, igual que el encabezado"
);

assert.equal(
  avatarInitials("Pol Cabeza Sillero"),
  "PC",
  "el fallback debe funcionar para cualquier nombre, no sólo para Carlos"
);

assert.equal(
  avatarToneFromIdentity("carlosgarciayepes16@gmail.com"),
  3,
  "la identidad de Carlos debe resolver el tono naranja canónico del encabezado"
);

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
  "Incidencias comment avatar contract OK · canonical visual owner · stable tones · identity-first · 28/26px"
);

#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";

import {
  resolveAvatarPresentation,
} from "../../src/features/avatar-system/identity.js";
import {
  SYNTHETIC_TECHNICIAN_IMAGE_PATH,
  avatarIdentityMatchScore,
  isSyntheticTechnicianSource,
  sameAvatarIdentity,
} from "../../src/features/incidencias-technician-avatar-bridge/index.js";
import {
  INCIDENCIAS_TECHNICIAN_PROFILE_VERSION,
  TECHNICIAN_RATING_INITIAL,
  TECHNICIAN_RATING_MAX,
  normalizePublicTechnicianMetrics,
} from "../../src/features/incidencias-technician-profile/index.js";

const source = fs.readFileSync(
  "src/features/incidencias-technician-profile/index.js",
  "utf8"
);
const css = fs.readFileSync(
  "src/features/incidencias-technician-profile/style.css",
  "utf8"
);
const publicHome = fs.readFileSync(
  "src/views/public/home/template.js",
  "utf8"
);
const bridge = fs.readFileSync(
  "src/features/incidencias-technician-avatar-bridge/index.js",
  "utf8"
);
const bridgeExecutable = bridge
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");
const privateRuntime = fs.readFileSync(
  "src/features/private-runtime-ui/index.js",
  "utf8"
);

/* =========================================================
   VERSION / PRODUCT INTENT
========================================================= */

assert.equal(
  INCIDENCIAS_TECHNICIAN_PROFILE_VERSION,
  "incidencias-technician-profile.v9-public-metrics-rating-ready"
);
assert.match(source, /import "\.\/style\.css";/);

/* =========================================================
   PRIVACY: AGGREGATE ONLY, NO THIRD-PARTY TICKET SURFACE
========================================================= */

for (const required of [
  'aggregate: "technician-public"',
  "aggregateOnly: true",
  "summaryOnly: true",
  "includeItems: false",
  "publicMetrics: true",
  "technicianUserId:",
  "assignedToUserId:",
  "technicianEmail:",
  "assigned: true",
  "closed: true",
  "includeTotal: true",
  "PUBLIC_METRIC_LIMIT = 1",
]) {
  assert.ok(
    source.includes(required),
    `El perfil público debe conservar el contrato agregado: ${required}`
  );
}

assert.match(source, /aggregateScopeIsPublic/);
assert.match(source, /normalizePublicTechnicianMetrics/);
assert.match(source, /loadPublicTechnicianMetrics/);
assert.match(source, /scope: publicScope \? "public-total" : "session-total"/);
assert.match(source, /Cómputo agregado público · sin tickets ni datos de clientes/);
assert.match(source, /Cómputo disponible en el ámbito de tu sesión/);
assert.match(source, /El backend aún no ha publicado un cómputo agregado/);

/* El antiguo historial privado y sus tarjetas deben desaparecer por completo. */
for (const forbidden of [
  /renderPublicTrust/,
  /inc-technician-trust-/,
  /inc-technician-method-/,
  /loadStatusHistory/,
  /collectHistoryWindow/,
  /HISTORY_SEARCH_MAX_PAGES/,
  /HISTORY_FALLBACK_MAX_PAGES/,
  /resolvedRecent/,
  /ticketCard\s*\(/,
  /ticketTitle\s*\(/,
  /ticketClosedAt\s*\(/,
  /data-technician-resolved-history=/,
  /Actividad reciente/,
  /Quién te atiende y cómo trabaja/,
  /Diagnóstico primero/,
  /Solución con criterio/,
  /Presupuesto y factura/,
]) {
  assert.doesNotMatch(
    source,
    forbidden,
    `La superficie cliente no puede reintroducir historial/detalle privado: ${forbidden}`
  );
}

assert.match(source, /thirdPartyTicketDetailsRendered:\s*false/);
assert.match(source, /resolvedTicketCardsRendered:\s*false/);
assert.match(source, /activityTicketCardsRendered:\s*false/);
assert.match(source, /publicSafeSurface:\s*true/);

/* La normalización distingue explícitamente agregado público de total de sesión. */
const publicMetrics = normalizePublicTechnicianMetrics({
  total: 1,
  summary: {
    publicTechnicianStats: true,
    scope: "technician-public",
    technician: {
      resolvedTotal: 37,
    },
  },
});
assert.equal(publicMetrics.resolvedTotal, 37);
assert.equal(publicMetrics.resolvedTotalKnown, true);
assert.equal(publicMetrics.publicTotal, true);
assert.equal(publicMetrics.scope, "public-total");

const sessionMetrics = normalizePublicTechnicianMetrics({
  total: 4,
  summary: {},
});
assert.equal(sessionMetrics.resolvedTotal, 4);
assert.equal(sessionMetrics.resolvedTotalKnown, true);
assert.equal(sessionMetrics.publicTotal, false);
assert.equal(sessionMetrics.scope, "session-total");

const unknownMetrics = normalizePublicTechnicianMetrics({});
assert.equal(unknownMetrics.resolvedTotalKnown, false);
assert.equal(unknownMetrics.publicTotal, false);
assert.equal(unknownMetrics.resolvedTotal, 0);

/* =========================================================
   FIVE STAR READ MODEL · 0/5 INITIAL · NO SUBMISSION YET
========================================================= */

assert.equal(TECHNICIAN_RATING_MAX, 5);
assert.deepEqual(TECHNICIAN_RATING_INITIAL, {
  average: 0,
  count: 0,
  max: 5,
});
assert.equal(publicMetrics.ratingAverage, 0);
assert.equal(publicMetrics.ratingCount, 0);
assert.equal(publicMetrics.ratingMax, 5);

for (const required of [
  'data-technician-rating="true"',
  'data-rating-average=',
  'data-rating-count=',
  'data-rating-max=',
  "Sin valoraciones todavía",
  "Valoración",
  "Opiniones",
  "ratingMax: TECHNICIAN_RATING_MAX",
  "ratingInitialAverage: TECHNICIAN_RATING_INITIAL.average",
  "ratingInitialCount: TECHNICIAN_RATING_INITIAL.count",
  "ratingSubmissionEnabled: false",
]) {
  assert.ok(source.includes(required), `Rating shell: falta ${required}`);
}

assert.match(source, /Array\.from\(\{ length: TECHNICIAN_RATING_MAX \}/);
assert.doesNotMatch(source, /<form[^>]*technician-rating/i);
assert.doesNotMatch(source, /data-technician-rating-submit/);
assert.doesNotMatch(source, /POST[\s\S]{0,120}rating/i);

/* =========================================================
   PROFILE: COMPACT CLIENT DATA ONLY
========================================================= */

assert.match(source, /Rendimiento y valoración/);
assert.match(source, /Información pública y segura/);
assert.match(source, /Incidencias resueltas/);
assert.match(source, /Perfil y contacto/);
assert.match(source, /Datos útiles para el cliente/);
assert.match(source, /experienceValue: "\+8"/);
assert.match(source, /clientsValue: "\+300"/);
assert.doesNotMatch(source, /metaCard\("Último acceso"/);
assert.doesNotMatch(source, /metaCard\("Identificador de usuario"/);

/* =========================================================
   AVATAR: GLOBAL AUTHORITY + NESTED WRAPPER BOUNDARY
========================================================= */

assert.equal(
  SYNTHETIC_TECHNICIAN_IMAGE_PATH,
  "/src/media/img/Cristian_Avila_224.webp"
);
assert.equal(
  isSyntheticTechnicianSource("/src/media/img/Cristian_Avila_224.webp"),
  true
);
assert.match(publicHome, /Cristian_Avila_224\.webp/);
assert.doesNotMatch(
  source,
  /Cristian_Avila_224\.webp/,
  "El perfil Técnico no puede volver a inyectar el retrato editorial como avatar"
);
assert.equal(
  fs.existsSync("src/media/img/Cristian_Avila_224.webp"),
  true,
  "La imagen pública puede seguir existiendo para la Home"
);

for (const token of [
  'data-avatar-system="off"',
  'data-avatar-managed="false"',
  'data-avatar-system="true"',
  'data-avatar-host="true"',
  'data-avatar-authority="global"',
  'data-avatar-source="incidencias-technician-profile"',
  'data-avatar-name=',
  'data-avatar-email=',
  'data-avatar-user-id=',
  'data-avatar-username=',
  'data-avatar-tone=',
  'data-avatar-identity=',
  'data-avatar-initials=',
]) {
  assert.ok(source.includes(token), `Avatar Técnico: falta ${token}`);
}
assert.match(source, /synchronizeAvatars\(host\)/);

const cristian = resolveAvatarPresentation({
  displayName: "Cristian Ávila Luque",
  email: "cristian@onionsupport.com",
  username: "cristian",
});
const poisonedWrapper = resolveAvatarPresentation({ displayName: "CL" });
assert.equal(cristian.initials, "CL");
assert.equal(cristian.tone, 12);
assert.equal(cristian.color, "#A4262C");
assert.equal(poisonedWrapper.tone, 19);
assert.equal(poisonedWrapper.color, "#69797E");

assert.match(bridge, /incidencias-technician-avatar-bridge\.v2-nested-host-boundary/);
assert.match(bridge, /wrapper\.setAttribute\("data-avatar-system", "off"\)/);
assert.match(bridge, /wrapper\.setAttribute\("data-avatar-managed", "false"\)/);
assert.match(bridge, /nestedWrapperOptOut:\s*true/);
assert.match(bridge, /canonicalImageReuse:\s*true/);
assert.match(bridge, /syntheticPhotoAuthority:\s*false/);
assert.match(bridge, /noLocalInitials:\s*true/);
assert.match(bridge, /noLocalTone:\s*true/);
assert.match(bridge, /noLocalColor:\s*true/);

assert.equal(
  avatarIdentityMatchScore(
    { userId: "user-a", email: "same@example.com" },
    { userId: "user-b", email: "same@example.com" }
  ),
  -1
);
assert.equal(
  sameAvatarIdentity(
    { email: "cristian@onionsupport.com" },
    { email: "cristian@onionsupport.com", name: "cristian avila luque" }
  ),
  true
);

for (const forbidden of [
  /(^|[^A-Za-z0-9_$])fetch\s*\(/m,
  /\bXMLHttpRequest\b/,
  /\blocalStorage\b/,
  /\bsessionStorage\b/,
  /\bindexedDB\b/,
  /\bMath\.random\s*\(/,
  /#[0-9a-fA-F]{3,8}\b/,
]) {
  assert.doesNotMatch(
    bridgeExecutable,
    forbidden,
    `El bridge no puede introducir autoridad paralela: ${forbidden}`
  );
}

assert.match(
  privateRuntime,
  /await initModule\(AvatarSystemUI, payload\);[\s\S]*await initModule\(IncidenciasTechnicianAvatarBridgeUI, payload\);/
);

/* =========================================================
   VISUAL AUTHORITY · EXISTING TOKENS ONLY
========================================================= */

assert.doesNotMatch(source, /style="/);
assert.match(css, /@layer components/);
assert.match(css, /inc-technician-overview-grid/);
assert.match(css, /inc-technician-rating-card/);
assert.match(css, /inc-technician-rating-score/);
assert.match(css, /inc-technician-stars/);
assert.match(css, /inc-technician-star/);
assert.match(css, /--avatar-size:\s*64px/);
assert.match(css, /var\(--warning\)/);
assert.match(css, /var\(--success-bg\)/);
assert.match(css, /var\(--ui-detail-modal-card-border\)/);
assert.match(css, /block-size:\s*auto/);
assert.doesNotMatch(css, /inc-technician-trust-/);
assert.doesNotMatch(css, /inc-technician-method-/);
assert.doesNotMatch(css, /inc-technician-ticket-/);
assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/);
assert.doesNotMatch(css, /linear-gradient\s*\(/);
assert.doesNotMatch(css, /!important/);

console.log(
  "Incidencias technician profile extreme contract OK · public-safe aggregate · no third-party tickets · rating 0/5 ready · global avatar authority"
);

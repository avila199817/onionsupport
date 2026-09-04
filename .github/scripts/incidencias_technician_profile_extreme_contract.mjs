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

/*
  No importamos el feature del perfil directamente desde Node porque su entrypoint
  importa CSS por diseño. Este contrato inspecciona el source y reserva imports
  ejecutables para módulos puros/Node-native.
*/
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

assert.match(
  source,
  /incidencias-technician-profile\.v9-public-metrics-rating-ready/
);
assert.match(source, /import "\.\/style\.css";/);
assert.match(source, /export const TECHNICIAN_RATING_MAX = 5;/);
assert.match(
  source,
  /TECHNICIAN_RATING_INITIAL = Object\.freeze\(\{[\s\S]*average: 0,[\s\S]*count: 0,[\s\S]*max: TECHNICIAN_RATING_MAX/
);

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
  "normalizePublicTechnicianMetrics",
  "loadPublicTechnicianMetrics",
  'scope: publicScope ? "public-total" : "session-total"',
  "Cómputo agregado público · sin tickets ni datos de clientes",
  "Cómputo disponible en el ámbito de tu sesión",
  "El backend aún no ha publicado un cómputo agregado",
]) {
  assert.ok(
    source.includes(required),
    `El perfil público debe conservar el contrato agregado: ${required}`
  );
}

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

for (const required of [
  "publicSafeSurface: true",
  "thirdPartyTicketDetailsRendered: false",
  "resolvedTicketCardsRendered: false",
  "activityTicketCardsRendered: false",
]) {
  assert.ok(source.includes(required), `Privacy snapshot: falta ${required}`);
}

/* El parser sólo puede declarar scope público mediante marcadores explícitos. */
assert.match(source, /aggregateScopeIsPublic/);
assert.match(source, /summary\.publicTechnicianStats === true/);
assert.match(source, /meta\.publicTechnicianStats === true/);
assert.match(source, /value\.includes\("technician_public"\)/);
assert.match(source, /resolvedTotalKnown:/);
assert.match(source, /publicTotal: publicScope/);

/* =========================================================
   FIVE STAR READ MODEL · 0/5 INITIAL · NO SUBMISSION YET
========================================================= */

for (const required of [
  'data-technician-rating="true"',
  'data-rating-average=',
  'data-rating-count=',
  'data-rating-max=',
  "Sin valoraciones todavía",
  "Valoración",
  "Opiniones",
  "Array.from({ length: TECHNICIAN_RATING_MAX }",
  "ratingMax: TECHNICIAN_RATING_MAX",
  "ratingInitialAverage: TECHNICIAN_RATING_INITIAL.average",
  "ratingInitialCount: TECHNICIAN_RATING_INITIAL.count",
  "ratingSubmissionEnabled: false",
]) {
  assert.ok(source.includes(required), `Rating shell: falta ${required}`);
}

assert.doesNotMatch(source, /<form[^>]*technician-rating/i);
assert.doesNotMatch(source, /data-technician-rating-submit/);
assert.doesNotMatch(source, /ratingValue/i);

/* =========================================================
   COMPACT CLIENT PROFILE
========================================================= */

for (const required of [
  "Rendimiento y valoración",
  "Información pública y segura",
  "Incidencias resueltas",
  "Perfil y contacto",
  "Datos útiles para el cliente",
  'experienceValue: "+8"',
  'clientsValue: "+300"',
]) {
  assert.ok(source.includes(required), `Perfil cliente: falta ${required}`);
}
assert.doesNotMatch(source, /metaCard\("Último acceso"/);
assert.doesNotMatch(source, /metaCard\("Identificador de usuario"/);

/* =========================================================
   AVATAR GLOBAL + REGRESIÓN DEL WRAPPER ANIDADO
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
assert.doesNotMatch(source, /Cristian_Avila_224\.webp/);
assert.equal(fs.existsSync("src/media/img/Cristian_Avila_224.webp"), true);

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

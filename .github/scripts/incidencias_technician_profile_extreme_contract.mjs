#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";

import {
  resolveAvatarPresentation,
} from "../../src/features/avatar-system/identity.js";


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
const privateRuntime = fs.readFileSync(
  "src/features/private-runtime-ui/index.js",
  "utf8"
);

/* =========================================================
   VERSION / PRODUCT INTENT
========================================================= */

assert.match(
  source,
  /incidencias-technician-profile\.v10-technician-rating-from-authority/
);
assert.match(source, /import "\.\/style\.css";/);
assert.match(source, /export const TECHNICIAN_RATING_MAX = 5;/);
assert.match(
  source,
  /TECHNICIAN_RATING_STATES = Object\.freeze\(\{[\s\S]*loading: "loading",[\s\S]*value: "value",[\s\S]*empty: "empty",[\s\S]*restricted: "restricted",[\s\S]*unresolved: "unresolved",[\s\S]*error: "error",/
);
/* El arranque en 0,0 / 5 con 0 opiniones era una afirmación falsa: decía que el
   técnico tenía una nota pésima y ninguna opinión cuando en realidad nadie había
   preguntado. No puede volver. */
assert.doesNotMatch(source, /TECHNICIAN_RATING_INITIAL/);

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
  'data-technician-rating-state=',
  'data-rating-average=',
  'data-rating-count=',
  'data-rating-max=',
  "Sin valoraciones",
  "Valoración",
  "Opiniones",
  "Array.from({ length: max }",
  "ratingMax: TECHNICIAN_RATING_MAX",
  'ratingAuthority: "api.facturas.tecnicos.valoraciones"',
  "ratingComputedInBrowser: false",
  "ratingSubmissionEnabled: false",
]) {
  assert.ok(source.includes(required), `Rating shell: falta ${required}`);
}

assert.doesNotMatch(source, /<form[^>]*technician-rating/i);
assert.doesNotMatch(source, /data-technician-rating-submit/);
assert.doesNotMatch(source, /ratingValue/i);

/* =========================================================
   LA VALORACIÓN VIENE DE LA AUTORIDAD, NO DEL NAVEGADOR

   El resumen lo calcula el backend sobre la atribución ya persistida. El modal
   pregunta por la identidad del técnico --la misma que el vínculo congeló-- y
   presenta lo que recibe. Ni suma, ni promedia, ni copia lo que Facturas tenga
   en pantalla.
========================================================= */

for (const required of [
  "getTechnicianReviewSummary",
  "technicianRatingIdentity",
  "loadTechnicianRating",
  "technicianRatingView",
  "tech.lookupUserId, tech.userId",
  'cleanText(summary?.technicianId, "") !== asked',
  "status === 401 || status === 403",
  "TECHNICIAN_RATING_STATES.restricted",
  "TECHNICIAN_RATING_STATES.unresolved",
]) {
  assert.ok(source.includes(required), `Autoridad de valoración: falta ${required}`);
}

/* El agregado de incidencias resueltas no puede volver a hablar de la nota: dos
   fuentes para un mismo número es exactamente el defecto que se cerró. */
const normalize = source.slice(
  source.indexOf("export function normalizePublicTechnicianMetrics"),
  source.indexOf("function metricSearchTerm")
);
assert.ok(normalize.length > 0);
for (const forbidden of ["ratingAverage", "ratingCount", "ratingMax"]) {
  assert.ok(
    !normalize.includes(forbidden),
    `El agregado de incidencias no publica ${forbidden}`
  );
}

/* Los textos de «ya llegará» eran falsos en cuanto la API existió. */
for (const mentira of [
  /se activará en una fase posterior/i,
  /Sistema preparado para 5 estrellas/i,
  /Se habilitarán con el flujo de cierre/i,
  /"0,0 \/ 5"/,
]) {
  assert.doesNotMatch(
    source,
    mentira,
    `El perfil no puede prometer una valoración que ya existe: ${mentira}`
  );
}

/* Una sola composición de la nota y una sola de la frase de cabecera: la
   definición del formateador y exactamente UNA llamada, dentro de la vista. */
assert.equal((source.match(/ratingLabel\(/g) || []).length, 2);
assert.match(source, /const scoreValue = hasValue \? ratingLabel\(average, max\) : "—";/);
assert.equal((source.match(/function profileSummary\(/g) || []).length, 1);
assert.equal((source.match(/profileSummary\(metrics, view\)/g) || []).length, 2);

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
assert.equal(cristian.seed, "email:cristian@onionsupport.com");
assert.equal(cristian.initials, "CL");
assert.equal(cristian.tone, 4);
assert.equal(cristian.color, "#498205");
assert.equal(poisonedWrapper.tone, 19);
assert.equal(poisonedWrapper.color, "#69797E");

assert.equal(fs.existsSync("src/features/incidencias-technician-avatar-bridge/index.js"), false);
assert.doesNotMatch(privateRuntime, /technician-avatar-bridge|TechnicianAvatarBridge/);
assert.match(privateRuntime, /await initModule\(AvatarSystemUI, payload\);/);

/* =========================================================
   VISUAL AUTHORITY · EXISTING TOKENS ONLY
========================================================= */

assert.doesNotMatch(source, /style="/);
assert.match(css, /@layer components/);
assert.match(css, /inc-technician-overview-grid/);
assert.match(css, /inc-technician-rating-card/);
assert.match(css, /data-technician-rating-state="value"/);
assert.match(css, /inc-technician-rating-retry/);
assert.match(css, /inc-technician-rating-score/);
assert.match(css, /inc-technician-stars/);
assert.match(css, /inc-technician-star/);
assert.match(css, /--avatar-size:\s*64px/);
assert.match(css, /var\(--warning\)/);
assert.match(css, /var\(--success-bg\)/);
assert.match(css, /var\(--ui-detail-modal-card-border\)/);
assert.match(css, /\[data-technician-profile-root="true"\] \{\n\s*--ui-detail-modal-panel-height: min\(92dvh, 720px\);/);
assert.doesNotMatch(css, /\.ui-detail-modal-(?:root|overlay|panel|header|body|footer|close-btn)\b/);
assert.match(source, /renderModalShell\(\{/);
assert.match(source, /height: "auto",/);
assert.match(source, /onBackdrop: \(\) => closeProfile\(\),/);
assert.doesNotMatch(source, /technician-profile-overlay='true'\]/);
assert.doesNotMatch(css, /inc-technician-trust-/);
assert.doesNotMatch(css, /inc-technician-method-/);
assert.doesNotMatch(css, /inc-technician-ticket-/);
assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/);
assert.doesNotMatch(css, /linear-gradient\s*\(/);
assert.doesNotMatch(css, /!important/);

console.log(
  "Incidencias technician profile extreme contract OK · public-safe aggregate · no third-party tickets · resumen desde la autoridad, con estados explícitos · global avatar authority"
);
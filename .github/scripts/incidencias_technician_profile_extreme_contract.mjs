#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";

import {
  resolveAvatarPresentation,
} from "../../src/features/avatar-system/identity.js";

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

assert.match(
  source,
  /incidencias-technician-profile\.v8\.client-trust-resolved-history/
);
assert.match(source, /import "\.\/style\.css";/);

/* Foto pública canónica: no inventar otro asset para el técnico. */
assert.match(source, /\/src\/media\/img\/Cristian_Avila_224\.webp/);
assert.match(publicHome, /Cristian_Avila_224\.webp/);
assert.equal(
  fs.existsSync("src/media/img/Cristian_Avila_224.webp"),
  true,
  "Debe existir el retrato WebP 224 reutilizado por el perfil técnico"
);

/* La propuesta de valor y método deben ser exactamente los ya publicados. */
for (const canonicalText of [
  "Diagnóstico claro, trato directo y reparación con criterio antes de tocar nada.",
  "Diagnóstico primero",
  "Reviso síntomas, urgencia y contexto antes de tocar nada. Claridad antes que prisas.",
  "Solución con criterio",
  "Te explico qué merece la pena reparar, qué conviene mejorar y qué no compensa.",
  "Presupuesto y factura",
  "Intervención formal, presupuesto previo y factura disponible para particulares y negocios.",
]) {
  assert.ok(source.includes(canonicalText), `Perfil técnico: falta copy canónico ${canonicalText}`);
  assert.ok(publicHome.includes(canonicalText), `Home pública: falta copy canónico ${canonicalText}`);
}

assert.match(source, /experienceValue: "\+8"/);
assert.match(source, /clientsValue: "\+300"/);
assert.doesNotMatch(source, /★★★★★|star-rating|customer-rating|ratingValue/i);

/* Avatar global: foto real si existe; Fluent Persona sólo como fallback. */
for (const token of [
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
  'data-avatar-image="true"',
]) {
  assert.ok(source.includes(token), `Avatar del técnico debe incluir ${token}`);
}
assert.match(source, /synchronizeAvatars\(host\)/);

const cristian = resolveAvatarPresentation({
  displayName: "Cristian Ávila Luque",
  email: "cristian@onionsupport.com",
  username: "cristian",
});
assert.equal(cristian.initials, "CL");
assert.equal(cristian.tone, 12);
assert.equal(cristian.color, "#A4262C");

/* Historial: consultar explícitamente abiertas y cerradas, paginado y RBAC-scoped. */
assert.match(source, /loadStatusHistory\(api, tech, false\)/);
assert.match(source, /loadStatusHistory\(api, tech, true\)/);
assert.match(source, /assigned: true/);
assert.match(source, /closed,/);
assert.match(source, /cursor/);
assert.match(source, /HISTORY_SEARCH_MAX_PAGES/);
assert.match(source, /HISTORY_FALLBACK_MAX_PAGES/);
assert.match(source, /Nunca saltamos el RBAC del API/);
assert.match(source, /resolvedRecent/);
assert.match(source, /data-technician-resolved-history="true"/);
assert.match(source, /Incidencias resueltas/);
assert.match(source, /ticketClosedAt/);

/* No presentar una ventana truncada como estadística total. */
assert.match(source, /stats\.partial/);
assert.match(source, /muestra accesible/);
assert.match(source, /no se presentan estos datos como histórico total/);
assert.match(source, /los permisos de la sesión actual/);

/* Perfil orientado a cliente: retirar metadatos internos que había en v7. */
assert.doesNotMatch(source, /metaCard\("Último acceso"/);
assert.doesNotMatch(source, /metaCard\("Identificador de usuario"/);
assert.match(source, /Perfil y contacto", "Datos útiles para el cliente"/);
assert.match(source, /Técnico informático/);

/* CSP/arquitectura visual: no estilos inline ni paletas locales. */
assert.doesNotMatch(source, /style="/);
assert.match(css, /@layer components/);
assert.match(css, /ui-detail-modal-card-border/);
assert.match(css, /ui-detail-modal-card-bg/);
assert.match(css, /--avatar-size:\s*64px/);
assert.match(css, /var\(--success\)/);
assert.match(css, /var\(--info\)/);
assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/);
assert.doesNotMatch(css, /linear-gradient\s*\(/);
assert.doesNotMatch(css, /!important/);

console.log(
  "Incidencias technician profile extreme contract OK · canonical photo · client-safe public profile · role-scoped resolved history · no fake ratings"
);

#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";

import {
  resolveAvatarPresentation,
} from "../../src/features/avatar-system/identity.js";
import {
  SYNTHETIC_TECHNICIAN_IMAGE_PATH,
  isSyntheticTechnicianSource,
  sameAvatarIdentity,
} from "../../src/features/incidencias-technician-avatar-bridge/index.js";

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
const privateRuntime = fs.readFileSync(
  "src/features/private-runtime-ui/index.js",
  "utf8"
);

assert.match(
  source,
  /incidencias-technician-profile\.v8\.client-trust-resolved-history/
);
assert.match(source, /import "\.\/style\.css";/);

/*
  El retrato público sigue existiendo porque pertenece a la Home y al perfil v8,
  pero YA NO es autoridad de avatar del modal Técnico. El bridge lo reconoce
  expresamente como fuente sintética y lo retira si AvatarSystem no puede
  respaldarlo con una imagen canónica de la misma identidad.
*/
assert.equal(
  SYNTHETIC_TECHNICIAN_IMAGE_PATH,
  "/src/media/img/Cristian_Avila_224.webp"
);
assert.equal(
  isSyntheticTechnicianSource("/src/media/img/Cristian_Avila_224.webp"),
  true
);
assert.equal(
  isSyntheticTechnicianSource(
    "https://onionsupport.com/src/media/img/Cristian_Avila_224.webp"
  ),
  true
);
assert.equal(
  isSyntheticTechnicianSource(
    "https://onionassets.blob.core.windows.net/avatars/cristian.webp"
  ),
  false
);
assert.match(source, /\/src\/media\/img\/Cristian_Avila_224\.webp/);
assert.match(publicHome, /Cristian_Avila_224\.webp/);
assert.equal(
  fs.existsSync("src/media/img/Cristian_Avila_224.webp"),
  true,
  "Debe seguir existiendo el retrato WebP 224 de la Home pública"
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

/*
  Avatar global en el markup: identity/state/initials siguen delegados al
  AvatarSystem. El bridge sólo resuelve reutilización de una URL ya visible.
*/
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

/*
  La fuente de imagen del modal queda subordinada a la autoridad global:
  - se buscan sólo hosts globales que ya estén en estado image;
  - nunca se toma como candidato otro host dentro del propio perfil;
  - una fuente sintética se elimina;
  - el estado final vuelve siempre a AvatarSystem.syncHost().
*/
assert.match(
  bridge,
  /incidencias-technician-avatar-bridge\.v1-global-source-authority/
);
assert.match(
  bridge,
  /\[data-avatar-authority='global'\]\[data-avatar-state='image'\]/
);
assert.match(bridge, /profileRoot\?\.contains\?\.\(candidate\)/);
assert.match(bridge, /removeSyntheticImages\(target\)/);
assert.match(bridge, /AvatarSystem\.syncHost\?\.\(target/);
assert.match(bridge, /AvatarSystem\.sync\?\.\(scope\)/);
assert.match(bridge, /canonicalImageReuse:\s*true/);
assert.match(bridge, /syntheticPhotoAuthority:\s*false/);
assert.match(bridge, /noLocalInitials:\s*true/);
assert.match(bridge, /noLocalTone:\s*true/);
assert.match(bridge, /noLocalColor:\s*true/);

/*
  Fingerprints de snapshots incompletos pueden diferir por aliases. El bridge
  debe reconciliar después por userId/email/username/nombre, pero un userId
  explícitamente contradictorio nunca puede caer al nombre.
*/
assert.equal(
  sameAvatarIdentity(
    { fingerprint: "alias-a", name: "cristian avila luque" },
    { fingerprint: "alias-b", name: "cristian avila luque" }
  ),
  true
);
assert.equal(
  sameAvatarIdentity(
    { userId: "user-a", name: "cristian avila luque" },
    { userId: "user-b", name: "cristian avila luque" }
  ),
  false
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
    bridge,
    forbidden,
    `El bridge no puede introducir autoridad paralela: ${forbidden}`
  );
}

/*
  El bridge vive en el runtime privado autenticado y se monta DESPUÉS del
  AvatarSystem. Así nunca puede convertirse en autoridad independiente.
*/
assert.match(
  privateRuntime,
  /import\("\.\.\/incidencias-technician-avatar-bridge\/index\.js"\)/
);
assert.match(
  privateRuntime,
  /await initModule\(AvatarSystemUI, payload\);[\s\S]*await initModule\(IncidenciasTechnicianAvatarBridgeUI, payload\);/
);
assert.match(
  privateRuntime,
  /AvatarSystemUI\.sync\?\.\(document\);[\s\S]*IncidenciasTechnicianAvatarBridgeUI\.sync\?\.\(document\);/
);
assert.match(
  privateRuntime,
  /technicianAvatarUsesGlobalAuthority:\s*true/
);
assert.match(
  privateRuntime,
  /technicianAvatarNoSyntheticSourceAuthority:\s*true/
);

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
  "Incidencias technician profile extreme contract OK · AvatarSystem global source authority · synthetic photo retired · client-safe resolved history"
);

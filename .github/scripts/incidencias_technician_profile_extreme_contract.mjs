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
  El retrato público pertenece a la Home/perfil editorial, pero jamás puede ser
  autoridad del avatar del técnico. El bridge lo reconoce y lo elimina antes
  de que AvatarSystem cierre el state del modal.
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

/* Markup del frame REAL: identidad visual subordinada al AvatarSystem. */
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

/* =========================================================
   REGRESIÓN REAL DE LA CAPTURA · NESTED AVATAR HOST
========================================================= */

assert.match(
  bridge,
  /incidencias-technician-avatar-bridge\.v2-nested-host-boundary/
);

/*
  .ui-detail-modal-avatar es sólo layout. Si AvatarSystem lo autopromueve por
  [class*=avatar], ese wrapper no tiene identity propia y puede leer "CL" del
  fallback hijo. La firma exacta del bug es Microsoft Persona("CL") = tone 19,
  #69797E: el círculo gris vacío que apareció en producción.
*/
const cristian = resolveAvatarPresentation({
  displayName: "Cristian Ávila Luque",
  email: "cristian@onionsupport.com",
  username: "cristian",
});
const poisonedWrapper = resolveAvatarPresentation({
  displayName: "CL",
});
assert.equal(cristian.initials, "CL");
assert.equal(cristian.tone, 12);
assert.equal(cristian.color, "#A4262C");
assert.equal(poisonedWrapper.initials, "C");
assert.equal(poisonedWrapper.tone, 19);
assert.equal(poisonedWrapper.color, "#69797E");

/* El wrapper debe quedar opt-out y sin ningún atributo que pueda pintarlo. */
assert.match(bridge, /target\.closest\?\.\("\.ui-detail-modal-avatar"\)/);
assert.match(bridge, /wrapper\.setAttribute\("data-avatar-system", "off"\)/);
assert.match(bridge, /wrapper\.setAttribute\("data-avatar-managed", "false"\)/);
for (const attribute of [
  "data-avatar-host",
  "data-avatar-authority",
  "data-avatar-state",
  "data-avatar-state-reason",
  "data-avatar-system-version",
  "data-avatar-identity-version",
  "data-avatar-identity",
  "data-avatar-tone",
  "data-avatar-initials",
  "data-has-avatar",
]) {
  assert.ok(
    bridge.includes(`"${attribute}"`),
    `El wrapper debe retirar ${attribute}`
  );
}
assert.match(bridge, /wrappersQuarantined/);
assert.match(bridge, /nestedWrapperOptOut:\s*true/);

/*
  Orden contractual crítico:
  1. frontera wrapper;
  2. sellado identity del frame;
  3. retirar sintético;
  4. scan global;
  5. reusar fuente real o fallback global.
*/
const syncStart = bridge.indexOf(
  "export function synchronizeTechnicianAvatarBridge"
);
const syncEnd = bridge.indexOf("function schedule()", syncStart);
const syncBody = bridge.slice(syncStart, syncEnd);
assert.ok(syncStart >= 0 && syncEnd > syncStart);

const quarantineIndex = syncBody.indexOf("quarantineNestedAvatarWrapper(target)");
const sealIndex = syncBody.indexOf("sealTargetIdentity(target)");
const removeIndex = syncBody.indexOf("removeSyntheticImages(target)");
const globalSyncIndex = syncBody.indexOf("AvatarSystem.sync?.(document)");
assert.ok(quarantineIndex >= 0);
assert.ok(sealIndex > quarantineIndex);
assert.ok(removeIndex > sealIndex);
assert.ok(globalSyncIndex > removeIndex);

assert.match(bridge, /syntheticRemovedBeforeGlobalSync:\s*true/);
assert.match(bridge, /fallbackResynchronizedAfterRemoval:\s*true/);
assert.match(bridge, /AvatarSystem\.syncHost\?\.\(target\)/);
assert.match(bridge, /setBridgeState\(target, "fallback-global"\)/);
assert.match(bridge, /setBridgeState\(target, "reused-global"\)/);

/*
  La búsqueda canónica acepta cualquier host YA gobernado por AvatarSystem y
  valida la imagen por complete/natural dimensions. No depende de una carrera
  concreta del atributo data-avatar-state=image.
*/
assert.match(
  bridge,
  /\[data-avatar-authority='global'\]\[data-avatar-host='true'\]/
);
assert.doesNotMatch(
  bridge,
  /GLOBAL_IMAGE_HOST_QUERY[\s\S]{0,220}data-avatar-state='image'/
);
assert.match(bridge, /image\.complete === true/);
assert.match(bridge, /Number\(image\.naturalWidth \|\| 0\) > 0/);
assert.match(bridge, /Number\(image\.naturalHeight \|\| 0\) > 0/);
assert.match(bridge, /profileRoot\?\.contains\?\.\(candidate\)/);

/* Reconciliación de aliases: gana el identificador común más fuerte. */
assert.equal(
  avatarIdentityMatchScore(
    { userId: "user-a", email: "same@example.com" },
    { userId: "user-b", email: "same@example.com" }
  ),
  -1,
  "userId contradictorio debe fallar cerrado"
);
assert.equal(
  sameAvatarIdentity(
    { fingerprint: "alias-a", name: "cristian avila luque" },
    { fingerprint: "alias-b", name: "cristian avila luque" }
  ),
  true
);
assert.equal(
  sameAvatarIdentity(
    { email: "cristian@onionsupport.com" },
    { email: "cristian@onionsupport.com", name: "cristian avila luque" }
  ),
  true
);

assert.match(bridge, /canonicalImageReuse:\s*true/);
assert.match(bridge, /syntheticPhotoAuthority:\s*false/);
assert.match(bridge, /noLocalInitials:\s*true/);
assert.match(bridge, /noLocalTone:\s*true/);
assert.match(bridge, /noLocalColor:\s*true/);

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

/* El bridge vive autenticado y SIEMPRE después de AvatarSystem. */
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

/* Historial: abiertas/cerradas, paginado y RBAC-scoped. */
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

/* Perfil cliente: nada de metadatos internos. */
assert.doesNotMatch(source, /metaCard\("Último acceso"/);
assert.doesNotMatch(source, /metaCard\("Identificador de usuario"/);
assert.match(source, /Perfil y contacto", "Datos útiles para el cliente"/);
assert.match(source, /Técnico informático/);

/* CSP/arquitectura visual: sin estilo inline ni paleta paralela. */
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
  "Incidencias technician profile extreme contract OK · nested wrapper quarantined · real global image reuse · Microsoft fallback preserved"
);

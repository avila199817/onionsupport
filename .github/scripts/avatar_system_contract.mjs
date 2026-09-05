#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  AVATAR_IDENTITY_VERSION,
  AVATAR_SYSTEM_VERSION,
  AVATAR_TONE_COUNT,
  getAvatarSystemSnapshot,
  isAvatarHostClassName,
  resolveAvatarImageState,
  resolveAvatarPresentation,
} from "../../src/features/avatar-system/index.js";

assert.match(AVATAR_SYSTEM_VERSION, /deterministic-identity-authority/);
assert.equal(
  AVATAR_IDENTITY_VERSION,
  "avatar-identity.v4-stable-user-tone"
);
assert.equal(AVATAR_TONE_COUNT, 20);

for (const hostClass of [
  "ui-avatar",
  "ui-detail-modal-avatar-frame",
  "sidebar-user-avatar",
  "sidebar-account-menu-avatar",
  "home-current-user-avatar",
  "home-entity-relation-avatar",
  "incidencias-avatar",
  "incidencias-assigned-avatar",
  "facturas-avatar",
  "clientes-avatar",
  "usuarios-avatar",
  "cuenta-profile-avatar-preview",
]) {
  assert.equal(isAvatarHostClassName(hostClass), true, `${hostClass} must be managed`);
}

assert.equal(
  resolveAvatarImageState({
    source: "https://cdn.example.com/avatar-transparent.png",
    complete: false,
    naturalWidth: 0,
    naturalHeight: 0,
  }),
  "loading"
);
assert.equal(
  resolveAvatarImageState({
    source: "https://cdn.example.com/avatar-transparent.png",
    complete: true,
    naturalWidth: 512,
    naturalHeight: 512,
  }),
  "image"
);
assert.equal(
  resolveAvatarImageState({
    source: "https://cdn.example.com/avatar.webp",
    complete: true,
    naturalWidth: 0,
    naturalHeight: 0,
  }),
  "error"
);
assert.equal(
  resolveAvatarImageState({
    source: "",
    complete: true,
    naturalWidth: 0,
    naturalHeight: 0,
  }),
  "fallback"
);

const identityA = resolveAvatarPresentation({
  userId: "ON-20260901024205",
  email: "avila199817@gmail.com",
  displayName: "Cristian Ávila Luque",
  username: "avila199817",
});
const identityB = resolveAvatarPresentation({
  requesterUserId: "ON-20260901024205",
  emailLower: "AVILA199817@GMAIL.COM",
  name: "Cristian Avila Luque",
});
const identityHomeSidebar = resolveAvatarPresentation({
  displayName: "CRISTIAN ÁVILA LUQUE",
  email: "avila199817@gmail.com",
  username: "avila199817",
});

for (const candidate of [identityB, identityHomeSidebar]) {
  assert.equal(identityA.seed, candidate.seed);
  assert.equal(identityA.tone, candidate.tone);
  assert.equal(identityA.colorKey, candidate.colorKey);
  assert.equal(identityA.color, candidate.color);
  assert.equal(identityA.fingerprint, candidate.fingerprint);
}

assert.equal(identityA.seed, "email:avila199817@gmail.com");
assert.equal(identityA.initials, "CL");
assert.equal(identityA.tone, 18);
assert.equal(identityA.colorKey, "rust");
assert.equal(identityA.color, "#8E562E");

for (const [name, initials, tone, color] of [
  ["DMARC Reports", "DR", 4, "#498205"],
  ["No Reply", "NR", 5, "#0B6A0B"],
  ["Soporte Onion Support", "SS", 15, "#750B1C"],
]) {
  const presentation = resolveAvatarPresentation({ displayName: name });
  assert.equal(presentation.initials, initials);
  assert.equal(presentation.tone, tone);
  assert.equal(presentation.color, color);
}

const carlosPlain = resolveAvatarPresentation({
  email: "carlosgarciayepes16@gmail.com",
  displayName: "Carlos Yepes Garcia",
});
const carlosAccent = resolveAvatarPresentation({
  emailLower: "CARLOSGARCIAYEPES16@GMAIL.COM",
  name: "Carlos Yepes García",
});
assert.equal(carlosPlain.seed, carlosAccent.seed);
assert.equal(carlosPlain.tone, carlosAccent.tone);
assert.equal(carlosPlain.color, carlosAccent.color);
assert.equal(carlosPlain.fingerprint, carlosAccent.fingerprint);

const snapshot = getAvatarSystemSnapshot();
for (const key of [
  "singleRuntimeAuthority",
  "deterministicIdentityTone",
  "deterministicInitials",
  "legacyToneHintsAreSubordinate",
  "validImageClearsFallbackSurface",
  "transparentPixelsPreserved",
  "fallbackOnlyWithoutValidImage",
  "brokenImagesBecomeFallback",
  "dynamicSpaDomObserved",
  "identityMutationsReconciled",
  "imageFormatsAreContentAgnostic",
  "noPixelInspection",
  "noNetwork",
  "noStorage",
  "noPersistedColor",
]) {
  assert.equal(snapshot.policy[key], true, `Avatar policy ${key} must stay enabled`);
}

const [
  appCss,
  privateCss,
  avatarCss,
  avatarRuntime,
  privateRuntime,
  criticalGate,
  publicSupport,
] = await Promise.all([
  readFile("src/css/app.css", "utf8"),
  readFile("src/css/private.css", "utf8"),
  readFile("src/css/components/avatar-system.css", "utf8"),
  readFile("src/features/avatar-system/index.js", "utf8"),
  readFile("src/features/private-runtime-ui/index.js", "utf8"),
  readFile(".github/ci/validate_spa_contracts.sh", "utf8"),
  readFile("src/features/public-support/index.js", "utf8"),
]);

assert.match(
  appCss,
  /@layer tokens, reset, core, layout, components, views, auth, compositions, loading, guardrails;/
);
assert.match(appCss, /avatar-system\.css"\) layer\(guardrails\);/);
assert.ok(
  appCss.indexOf('avatar-system.css") layer(guardrails)') >
    appCss.indexOf('guardrails.css") layer(guardrails)')
);
assert.match(
  privateCss,
  /components\/avatar-system\.css"\) layer\(guardrails\);/,
  "private CSS chunk must carry the avatar guardrail"
);
assert.ok(
  privateCss.indexOf("./components/avatar-system.css") >
    privateCss.indexOf("./compositions/private-amounts.css"),
  "avatar guardrail must close the private stylesheet"
);

assert.match(avatarCss, /SINGLE VISUAL AUTHORITY/);
assert.match(avatarCss, /MICROSOFT FLUENT UI V8 PERSONA AUTO-COLOR PALETTE/);
assert.match(avatarCss, /\[data-avatar-tone="0"\]/);
assert.match(avatarCss, /\[data-avatar-tone="19"\]/);
assert.match(avatarCss, /--avatar-fallback-color:\s*#A4262C;/);
assert.match(avatarCss, /--avatar-fallback-color:\s*#498205;/);
assert.match(avatarCss, /--avatar-fallback-color:\s*#0B6A0B;/);
assert.match(avatarCss, /--avatar-fallback-color:\s*#750B1C;/);
assert.match(avatarCss, /border-radius:\s*50%;/);
assert.match(avatarCss, /--avatar-size-default:\s*42px;/);
assert.match(avatarCss, /--avatar-size-shell:\s*36px;/);
assert.match(avatarCss, /--avatar-size-relation:\s*30px;/);
assert.match(avatarCss, /--avatar-size-detail:\s*56px;/);
assert.match(avatarCss, /font-family:\s*"Segoe UI"/);
assert.match(avatarCss, /font-weight:\s*600;/);
assert.match(avatarCss, /background:\s*var\(--avatar-fallback-color\);/);
assert.match(avatarCss, /background-image:\s*none;/);
assert.match(avatarCss, /box-shadow:\s*none;/);
assert.match(avatarCss, /object-fit:\s*var\(--avatar-object-fit\);/);
assert.doesNotMatch(avatarCss, /linear-gradient\s*\(/);
assert.doesNotMatch(avatarCss, /!important/);

assert.match(avatarRuntime, /document\.addEventListener\("load", onImageLoad, true\)/);
assert.match(avatarRuntime, /document\.addEventListener\("error", onImageError, true\)/);
assert.match(avatarRuntime, /new MutationObserver\(onMutations\)/);
for (const observedAttribute of [
  '"src"',
  '"srcset"',
  '"hidden"',
  '"class"',
  '"data-avatar-tone"',
  '"data-avatar-state"',
  '"data-has-avatar"',
  '"data-avatar-name"',
  '"data-avatar-email"',
  '"data-avatar-user-id"',
  '"data-avatar-username"',
]) {
  assert.ok(
    avatarRuntime.includes(observedAttribute),
    `Avatar observer must reconcile ${observedAttribute}`
  );
}
assert.match(avatarRuntime, /characterData:\s*true/);
assert.match(avatarRuntime, /image\.naturalWidth/);
assert.match(avatarRuntime, /image\.naturalHeight/);
assert.match(avatarRuntime, /data-avatar-authority/);
assert.match(avatarRuntime, /data-avatar-identity/);
assert.match(avatarRuntime, /data-avatar-tone/);
assert.match(avatarRuntime, /data-avatar-initials/);
assert.match(avatarRuntime, /data-avatar-state/);
assert.match(avatarRuntime, /data-has-avatar/);

for (const forbidden of [
  /\bfetch\s*\(/,
  /\bXMLHttpRequest\b/,
  /\blocalStorage\b/,
  /\bsessionStorage\b/,
  /\bindexedDB\b/,
  /\bgetImageData\b/,
  /\bcreateImageBitmap\b/,
  /\bFileReader\b/,
  /\bMath\.random\s*\(/,
]) {
  assert.doesNotMatch(avatarRuntime, forbidden);
}

assert.match(publicSupport, /AvatarSystem\.mount\(\{ AppCore \}\)/);
assert.match(publicSupport, /AvatarSystem\.syncHost\(mark\)/);
assert.match(publicSupport, /sanitizeRuntimeImageUrl/);
assert.doesNotMatch(publicSupport, /img\.addEventListener\(["'](?:load|error)["']/);
assert.doesNotMatch(publicSupport, /mark\.dataset\.(?:hasAvatar|avatarState)\s*=/);

for (const consumerPath of [
  "src/views/facturas/facturas.template.js",
  "src/features/incidencias-detail-state/index.js",
]) {
  const consumer = await readFile(consumerPath, "utf8");
  assert.match(consumer, /synchronizeAvatars\(/);
  assert.doesNotMatch(consumer, /addEventListener\(["']error["']/);
  assert.doesNotMatch(consumer, /fallbackTechnicianAvatar|repairTechnicianAvatar|facturasAvatarBound/);
}

const sidebarTemplate = await readFile("src/ui/sidebar/template.js", "utf8");
assert.match(sidebarTemplate, /synchronizeAvatarHost\(avatar\)/);
assert.match(sidebarTemplate, /initials:\s*avatarInitials\(name\)/);
assert.doesNotMatch(sidebarTemplate, /markAvatarFallback|function initialsFromName/);
assert.doesNotMatch(sidebarTemplate, /addEventListener\(\s*["']error["']/);

const userModal = await readFile("src/views/usuarios/usuarios.template.modal.js", "utf8");
assert.doesNotMatch(userModal, /onRootError|errorHandler|function hashText|function initialsFrom/);
assert.match(userModal, /resolveAvatarPresentation\(/);

const [clientCreate, clientDetail, mailTemplate, homeFoundation] = await Promise.all([
  import("../../src/views/clientes/clientes.template.create.js"),
  import("../../src/views/clientes/clientes.template.modal.js"),
  import("../../src/views/correo/correo.template.js"),
  import("../../src/views/home/home.template.foundation.js"),
]);
for (const name of ["Javier Harandou", "Ana Maria López", "Maria del Carmen Ortiz"]) {
  const user = { id: "fixture-user", userId: "fixture-user", name, displayName: name, email: "fixture@example.test", username: "fixture" };
  const expected = resolveAvatarPresentation(user);
  const createHtml = clientCreate.renderClientesCreateModal({ open: true, role: "admin", userSearch: { query: name, results: [user], selectedUser: user }, form: { targetUserId: user.userId, targetUserName: name, targetUserEmail: user.email } });
  const detailHtml = clientDetail.renderClientesDetailModal({ open: true, detail: { clienteId: "fixture-client", userId: user.userId, nombreFiscal: "Empresa Fixture", contactoNombre: name, email: user.email } });
  const mailHtml = mailTemplate.renderMessageRows([{ id: "fixture-message", from: { name, address: user.email }, receivedDateTime: "2026-01-01T12:00:00Z" }]);
  for (const [context, html] of [["client-create", createHtml], ["client-detail", detailHtml], ["mail-sender", mailHtml]]) {
    const hosts = [...html.matchAll(/<(?:span|div)\b[^>]*data-avatar-host="true"[^>]*>/g)].map((match) => match[0]);
    assert.ok(hosts.length > 0, `${context} must declare its identity to AvatarSystem`);
    for (const host of hosts) {
      assert.ok(host.includes(`data-avatar-initials="${expected.initials}"`), `${context} initials for ${name}`);
      assert.ok(host.includes(`data-avatar-tone="${expected.tone}"`), `${context} tone for ${name}`);
    }
  }
  assert.equal(homeFoundation.initialsFrom(name), expected.initials);
}

assert.match(privateRuntime, /import\("\.\.\/avatar-system\/index\.js"\)/);
assert.match(privateRuntime, /AvatarSystemUI\.sync\?\.\(document\)/);
assert.match(privateRuntime, /avatarImageTransparencyAuthority:\s*true/);
assert.match(criticalGate, /node \.github\/scripts\/avatar_system_contract\.mjs/);
assert.match(criticalGate, /node \.github\/scripts\/avatar_identity_authority_contract\.mjs/);
assert.match(criticalGate, /node \.github\/scripts\/avatar_authority_hygiene_contract\.mjs/);

console.log(
  "Avatar system contract: PASS · stable user tone · Fluent Persona palette/initials · flat fallback · transparent image alpha · SPA-wide"
);
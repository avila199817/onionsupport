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
  "avatar-identity.v3-microsoft-fluent-persona-v8"
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
  name: "Cristian Ávila Luque",
});
const identityHomeSidebar = resolveAvatarPresentation({
  displayName: "Cristian Ávila Luque",
  username: "avila199817",
});

for (const candidate of [identityB, identityHomeSidebar]) {
  assert.equal(identityA.tone, candidate.tone);
  assert.equal(identityA.colorKey, candidate.colorKey);
  assert.equal(identityA.color, candidate.color);
  assert.equal(identityA.initials, candidate.initials);
  assert.equal(identityA.fingerprint, candidate.fingerprint);
}

assert.equal(identityA.initials, "CL");
assert.equal(identityA.tone, 12);
assert.equal(identityA.colorKey, "darkRed");
assert.equal(identityA.color, "#A4262C");

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
] = await Promise.all([
  readFile("src/css/app.css", "utf8"),
  readFile("src/css/private.css", "utf8"),
  readFile("src/css/components/avatar-system.css", "utf8"),
  readFile("src/features/avatar-system/index.js", "utf8"),
  readFile("src/features/private-runtime-ui/index.js", "utf8"),
  readFile(".github/ci/validate_spa_contracts.sh", "utf8"),
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

assert.match(privateRuntime, /import\("\.\.\/avatar-system\/index\.js"\)/);
assert.match(privateRuntime, /AvatarSystemUI\.sync\?\.\(document\)/);
assert.match(privateRuntime, /avatarImageTransparencyAuthority:\s*true/);
assert.match(criticalGate, /node \.github\/scripts\/avatar_system_contract\.mjs/);
assert.match(criticalGate, /node \.github\/scripts\/avatar_identity_authority_contract\.mjs/);
assert.match(criticalGate, /node \.github\/scripts\/avatar_authority_hygiene_contract\.mjs/);

console.log(
  "Avatar system contract: PASS · Microsoft Fluent Persona initials/colors · flat fallback · transparent image alpha · SPA-wide"
);
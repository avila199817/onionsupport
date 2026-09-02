#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  AVATAR_IDENTITY_VERSION,
  AVATAR_SYSTEM_VERSION,
  getAvatarSystemSnapshot,
  isAvatarHostClassName,
  resolveAvatarImageState,
  resolveAvatarPresentation,
} from "../../src/features/avatar-system/index.js";

assert.match(AVATAR_SYSTEM_VERSION, /deterministic-identity-authority/);
assert.match(AVATAR_IDENTITY_VERSION, /^avatar-identity\.v1-/);

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
});
const identityB = resolveAvatarPresentation({
  requesterUserId: "ON-20260901024205",
  emailLower: "AVILA199817@GMAIL.COM",
  name: "Cristian Ávila Luque",
});

assert.equal(identityA.tone, identityB.tone);
assert.equal(identityA.initials, identityB.initials);
assert.equal(identityA.fingerprint, identityB.fingerprint);
assert.equal(identityA.initials, "CÁ");

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

const [appCss, avatarCss, avatarRuntime, privateRuntime, criticalGate] = await Promise.all([
  readFile("src/css/app.css", "utf8"),
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

assert.match(avatarCss, /SINGLE VISUAL AUTHORITY/);
assert.match(avatarCss, /border-radius:\s*50%;/);
assert.match(avatarCss, /--avatar-size-default:\s*42px;/);
assert.match(avatarCss, /--avatar-size-shell:\s*36px;/);
assert.match(avatarCss, /--avatar-size-relation:\s*30px;/);
assert.match(avatarCss, /--avatar-size-detail:\s*56px;/);
assert.match(avatarCss, /\.home-current-user-avatar/);
assert.match(avatarCss, /\.sidebar-user-avatar/);
assert.match(avatarCss, /\.incidencias-avatar/);
assert.match(avatarCss, /\.facturas-avatar/);
assert.match(avatarCss, /\.clientes-avatar/);
assert.match(avatarCss, /\.usuarios-avatar/);
assert.match(avatarCss, /background:\s*transparent;/);
assert.match(avatarCss, /background-image:\s*none;/);
assert.match(avatarCss, /box-shadow:\s*none;/);
assert.match(avatarCss, /object-fit:\s*var\(--avatar-object-fit\);/);
assert.doesNotMatch(avatarCss, /!important/);
assert.doesNotMatch(
  avatarCss,
  /(?:background|background-color)\s*:\s*(?:#fff|white|rgb\(255\s+255\s+255)/i
);

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

console.log(
  "Avatar system contract: PASS · one identity/state/visual authority · transparent alpha · SPA-wide"
);

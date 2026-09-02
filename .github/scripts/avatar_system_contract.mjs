#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  AVATAR_SYSTEM_VERSION,
  getAvatarSystemSnapshot,
  isAvatarFallbackClassName,
  isAvatarHostClassName,
  isAvatarImageClassName,
  resolveAvatarImageState,
} from "../../src/features/avatar-system/index.js";

assert.match(AVATAR_SYSTEM_VERSION, /transparent-alpha-authority/);

for (const hostClass of [
  "ui-avatar",
  "ui-detail-modal-avatar-frame",
  "sidebar-user-avatar",
  "sidebar-account-menu-avatar",
  "home-current-user-avatar",
  "home-entity-relation-avatar",
  "incidencias-avatar",
  "incidencias-assigned-avatar",
  "incidencias-modal-description-comment-avatar",
  "facturas-avatar",
  "clientes-avatar",
  "usuarios-avatar",
  "cuenta-profile-avatar-preview",
]) {
  assert.equal(
    isAvatarHostClassName(hostClass),
    true,
    `${hostClass} must resolve as one managed avatar host`
  );
}

for (const nonHostClass of [
  "sidebar-user-avatar-img",
  "home-entity-relation-avatar-image",
  "home-entity-relation-avatar-fallback",
  "avatar-copy",
  "avatar-name",
  "avatar-upload",
]) {
  assert.equal(isAvatarHostClassName(nonHostClass), false);
}

assert.equal(isAvatarImageClassName("sidebar-user-avatar-img"), true);
assert.equal(isAvatarImageClassName("clientes-avatar-image"), true);
assert.equal(isAvatarFallbackClassName("home-entity-relation-fallback"), true);
assert.equal(isAvatarFallbackClassName("ui-detail-modal-avatar-initials"), true);

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
  "image",
  "A transparent PNG is a valid image and must never expose fallback paint"
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

const snapshot = getAvatarSystemSnapshot();
assert.equal(snapshot.policy.validImageClearsFallbackSurface, true);
assert.equal(snapshot.policy.transparentPixelsPreserved, true);
assert.equal(snapshot.policy.fallbackOnlyWithoutValidImage, true);
assert.equal(snapshot.policy.brokenImagesBecomeFallback, true);
assert.equal(snapshot.policy.dynamicSpaDomObserved, true);
assert.equal(snapshot.policy.imageFormatsAreContentAgnostic, true);
assert.equal(snapshot.policy.noPixelInspection, true);
assert.equal(snapshot.policy.noNetwork, true);
assert.equal(snapshot.policy.noStorage, true);

const [
  appCss,
  avatarCss,
  avatarRuntime,
  privateRuntime,
  homeTemplate,
  sidebarTemplate,
  incidenciasTemplate,
  facturasTemplate,
  clientesTemplate,
  usuariosTemplate,
  criticalGate,
] = await Promise.all([
  readFile("src/css/app.css", "utf8"),
  readFile("src/css/components/avatar-system.css", "utf8"),
  readFile("src/features/avatar-system/index.js", "utf8"),
  readFile("src/features/private-runtime-ui/index.js", "utf8"),
  readFile("src/views/home/home.template.shared.js", "utf8"),
  readFile("src/ui/sidebar/template.js", "utf8"),
  readFile("src/views/incidencias/incidencias.template.js", "utf8"),
  readFile("src/views/facturas/facturas.template.js", "utf8"),
  readFile("src/views/clientes/clientes.template.js", "utf8"),
  readFile("src/views/usuarios/usuarios.template.js", "utf8"),
  readFile(".github/ci/validate_spa_contracts.sh", "utf8"),
]);

assert.match(
  appCss,
  /@layer tokens, reset, core, layout, components, views, auth, compositions, loading, guardrails;/
);
assert.match(
  appCss,
  /@import url\("\.\/components\/avatar-system\.css"\) layer\(guardrails\);/
);

const loadingIndex = appCss.indexOf(
  '@import url("./components/skeleton.css") layer(loading);'
);
const guardrailIndex = appCss.indexOf(
  '@import url("./core/guardrails.css") layer(guardrails);'
);
const avatarIndex = appCss.indexOf(
  '@import url("./components/avatar-system.css") layer(guardrails);'
);
assert.ok(loadingIndex >= 0);
assert.ok(guardrailIndex > loadingIndex);
assert.ok(avatarIndex > guardrailIndex);

/* One visual geometry authority. */
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

/* A valid image clears every local fallback surface. */
assert.match(
  avatarCss,
  /data-avatar-state="image"[\s\S]*?background:\s*transparent;[\s\S]*?background-image:\s*none;[\s\S]*?box-shadow:\s*none;/
);
assert.match(
  avatarCss,
  /data-avatar-state="image"[\s\S]*?avatar-fallback[\s\S]*?visibility:\s*hidden;[\s\S]*?opacity:\s*0;/
);
assert.match(
  avatarCss,
  /data-avatar-state="image"[\s\S]*?> span:not\(\[data-avatar-image\]\)[\s\S]*?color:\s*transparent;/
);
assert.doesNotMatch(avatarCss, /!important/);
assert.doesNotMatch(
  avatarCss,
  /(?:background|background-color)\s*:\s*(?:#fff|white|rgb\(255\s+255\s+255)/i,
  "AvatarSystem must never inject an opaque white background"
);

/* One runtime state machine, dynamic SPA-wide. */
assert.match(avatarRuntime, /document\.addEventListener\("load", onImageLoad, true\)/);
assert.match(avatarRuntime, /document\.addEventListener\("error", onImageError, true\)/);
assert.match(avatarRuntime, /new MutationObserver\(onMutations\)/);
assert.match(avatarRuntime, /attributeFilter:\s*\["src", "srcset", "hidden"\]/);
assert.match(avatarRuntime, /image\.naturalWidth/);
assert.match(avatarRuntime, /image\.naturalHeight/);
assert.match(avatarRuntime, /data-avatar-state/);
assert.match(avatarRuntime, /data-has-avatar/);
assert.match(avatarRuntime, /setClass\(host, "has-image", hasImage\)/);
assert.match(avatarRuntime, /setClass\(host, "is-fallback", !hasImage\)/);

for (const forbidden of [
  /\bfetch\s*\(/,
  /\bXMLHttpRequest\b/,
  /\blocalStorage\b/,
  /\bsessionStorage\b/,
  /\bindexedDB\b/,
  /\bcanvas\b/i,
  /\bgetImageData\b/,
  /\bcreateImageBitmap\b/,
  /\bFileReader\b/,
]) {
  assert.doesNotMatch(avatarRuntime, forbidden);
}

assert.match(privateRuntime, /import\("\.\.\/avatar-system\/index\.js"\)/);
assert.match(privateRuntime, /AvatarSystemUI\s*=[\s\S]*avatarSystemModule\?\.AvatarSystem/);
assert.match(
  privateRuntime,
  /await initModule\(AppChromeUI, payload\);[\s\S]*await initModule\(AvatarSystemUI, payload\);[\s\S]*await initModule\(HomeEntityModalUI, payload\);/
);
assert.match(privateRuntime, /AvatarSystemUI\.sync\?\.\(document\)/);
assert.match(privateRuntime, /destroyLoaded\(AvatarSystemUI\)/);
assert.match(privateRuntime, /avatarImageTransparencyAuthority:\s*true/);

/* Legacy renderers may supply data; they may not escape the final authority. */
assert.match(homeTemplate, /home-current-user-avatar/);
assert.match(sidebarTemplate, /sidebar-user-avatar/);
assert.match(incidenciasTemplate, /incidencias-avatar/);
assert.match(facturasTemplate, /facturas-avatar/);
assert.match(clientesTemplate, /clientes-avatar/);
assert.match(usuariosTemplate, /usuarios-avatar/);

assert.match(criticalGate, /node \.github\/scripts\/avatar_system_contract\.mjs/);

console.log(
  "Avatar system contract: PASS · one state authority · one visual geometry · transparent alpha preserved · SPA-wide coverage"
);

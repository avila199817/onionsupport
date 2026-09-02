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

import {
  renderHomeTemplate,
} from "../../src/views/home/home.template.js";

assert.match(
  AVATAR_SYSTEM_VERSION,
  /transparent-alpha-authority/,
  "The avatar runtime must expose the transparent-alpha authority contract"
);

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
  "clientes-avatar",
  "usuarios-avatar",
  "cuenta-profile-avatar-preview",
]) {
  assert.equal(
    isAvatarHostClassName(hostClass),
    true,
    `${hostClass} must be recognized as an avatar host`
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
  assert.equal(
    isAvatarHostClassName(nonHostClass),
    false,
    `${nonHostClass} must not be mistaken for the avatar host`
  );
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
  "A valid transparent PNG is a real image; alpha must not trigger fallback paint"
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

const transparentPng =
  "https://cdn.example.com/avatars/onion-transparent.png";

const html = renderHomeTemplate({
  user: {
    displayName: "Administrador Onion",
    role: "admin",
  },
  role: "admin",
  dashboard: {
    admin: true,
    summary: {
      incidencias: 1,
      facturas: 0,
      clientes: 1,
      usuarios: 1,
      invoiceStatsAvailable: false,
      currency: "EUR",
    },
    incidencias: [
      {
        ticketId: "INC-20260902-ALPHA01",
        subject: "Avatar PNG transparente",
        status: "open",
        updatedAt: "2026-09-02T08:00:00Z",
        requesterSnapshot: {
          displayName: "Onion Support",
          email: "soporte@onionsupport.com",
          avatarUrl: transparentPng,
        },
      },
    ],
    facturas: [],
    activity: [
      {
        type: "ticket",
        entityId: "INC-20260902-ALPHA01",
        title: "Avatar PNG transparente",
        status: "open",
        date: "2026-09-02T08:00:00Z",
      },
    ],
  },
});

assert.match(html, /data-has-avatar="true"/);
assert.match(
  html,
  new RegExp(transparentPng.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
);
assert.match(html, /home-entity-relation-fallback/);

const [
  appCss,
  avatarCss,
  avatarRuntime,
  privateRuntime,
  relationTemplate,
  detailModalCss,
  sidebarCss,
  parityCss,
  criticalGate,
] = await Promise.all([
  readFile("src/css/app.css", "utf8"),
  readFile("src/css/components/avatar-system.css", "utf8"),
  readFile("src/features/avatar-system/index.js", "utf8"),
  readFile("src/features/private-runtime-ui/index.js", "utf8"),
  readFile("src/views/home/home.template.relation.js", "utf8"),
  readFile("src/css/components/detail-modal.css", "utf8"),
  readFile("src/css/layout/sidebar.css", "utf8"),
  readFile("src/css/compositions/private-admin-parity.css", "utf8"),
  readFile(".github/ci/validate_spa_contracts.sh", "utf8"),
]);

assert.match(
  appCss,
  /@layer tokens, reset, core, layout, components, views, auth, compositions, identity, loading, guardrails;/
);
assert.match(
  appCss,
  /@import url\("\.\/components\/avatar-system\.css"\) layer\(identity\);/
);

const compositionIndex = appCss.indexOf(
  '@import url("./compositions/home-extreme.css") layer(compositions);'
);
const avatarIndex = appCss.indexOf(
  '@import url("./components/avatar-system.css") layer(identity);'
);
const loadingIndex = appCss.indexOf(
  '@import url("./components/skeleton.css") layer(loading);'
);

assert.ok(compositionIndex >= 0);
assert.ok(avatarIndex > compositionIndex);
assert.ok(loadingIndex > avatarIndex);

assert.match(
  avatarCss,
  /\[data-avatar-system="true"\]\[data-avatar-state="image"\][\s\S]*?\[data-has-avatar="true"\][\s\S]*?\{[\s\S]*?background:\s*transparent;[\s\S]*?background-image:\s*none;[\s\S]*?box-shadow:\s*none;/
);
assert.match(
  avatarCss,
  /\[data-avatar-system="true"\]\[data-avatar-state="image"\][\s\S]*?\[data-avatar-fallback="true"\][\s\S]*?visibility:\s*hidden;[\s\S]*?opacity:\s*0;/
);
assert.match(
  avatarCss,
  /\[data-avatar-system="true"\]\[data-avatar-state="error"\][\s\S]*?\[data-avatar-image="true"\][\s\S]*?display:\s*none;/
);
assert.doesNotMatch(avatarCss, /!important/);
assert.doesNotMatch(
  avatarCss,
  /(?:background|background-color)\s*:\s*(?:#fff|white|rgb\(255\s+255\s+255)/i,
  "The real-image authority must never inject an opaque white surface"
);

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
  assert.doesNotMatch(
    avatarRuntime,
    forbidden,
    "Avatar synchronization must not perform network, storage or pixel inspection"
  );
}

assert.match(
  privateRuntime,
  /import\("\.\.\/avatar-system\/index\.js"\)/
);
assert.match(
  privateRuntime,
  /AvatarSystemUI\s*=[\s\S]*avatarSystemModule\?\.AvatarSystem/
);
assert.match(
  privateRuntime,
  /await initModule\(AppChromeUI, payload\);[\s\S]*await initModule\(AvatarSystemUI, payload\);[\s\S]*await initModule\(HomeEntityModalUI, payload\);/
);
assert.match(privateRuntime, /AvatarSystemUI\.sync\?\.\(document\)/);
assert.match(privateRuntime, /destroyLoaded\(AvatarSystemUI\)/);
assert.match(privateRuntime, /avatarImageTransparencyAuthority:\s*true/);

assert.match(relationTemplate, /data-has-avatar="\$\{avatarUrl \? "true" : "false"\}"/);
assert.match(relationTemplate, /home-entity-relation-fallback/);
assert.match(detailModalCss, /\.ui-detail-modal-avatar-frame/);
assert.match(sidebarCss, /\.sidebar-user-avatar-fallback/);
assert.match(parityCss, /\.incidencias-avatar/);
assert.match(parityCss, /\.facturas-avatar/);
assert.match(parityCss, /\.clientes-avatar/);
assert.match(parityCss, /\.usuarios-avatar/);

assert.match(
  criticalGate,
  /node \.github\/scripts\/avatar_system_contract\.mjs/
);

console.log(
  "Avatar system contract: PASS · transparent alpha preserved · fallback state unified · dynamic SPA coverage · zero pixel/network work"
);

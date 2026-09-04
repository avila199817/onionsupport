#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  avatarColorFromIdentity,
  avatarInitials,
  avatarToneFromIdentity,
  resolveAvatarPresentation,
} from "../../src/features/avatar-system/identity.js";
import {
  INCIDENCIAS_CREATE_AVATAR_IDENTITY_VERSION,
  getIncidenciasCreateAvatarIdentitySnapshot,
} from "../../src/views/incidencias/incidencias.create-avatar-identity.js";
import {
  renderIncidenciasCreateModal,
} from "../../src/views/incidencias/incidencias.template.create.js";

const css = readFileSync(
  "src/css/components/avatar-system-contexts.css",
  "utf8"
);
const appCss = readFileSync("src/css/app.css", "utf8");

const JAVIER = Object.freeze({
  userId: "ON-1770551914523",
  displayName: "Javier Harandou",
  name: "Javier Harandou",
  email: "harandou@efcusa.com",
  phone: "+34 646 979 996",
});

assert.equal(avatarInitials(JAVIER.displayName), "JH");
assert.equal(avatarToneFromIdentity(JAVIER), 11);
assert.equal(avatarColorFromIdentity(JAVIER), "#D13438");

const legacyMisread = resolveAvatarPresentation({ displayName: "JH" });
assert.equal(
  legacyMisread.initials,
  "J",
  "El bug original queda reproducido: tratar las iniciales JH como nombre las reduce a J"
);

const html = renderIncidenciasCreateModal({
  open: true,
  admin: true,
  role: "admin",
  form: {
    targetUserId: JAVIER.userId,
    targetUserName: JAVIER.displayName,
    targetUserEmail: JAVIER.email,
    targetUserAvatar: "",
    subject: "Equipo sin conexión",
    description: "El usuario no puede acceder a la red corporativa.",
    priority: "medium",
    category: "general",
    source: "panel_admin",
    attachments: [],
  },
  userSearch: {
    query: "Javier Harandou",
    selectedUser: JAVIER,
    results: [JAVIER],
  },
});

const targetTag = html.match(
  /<span\b(?=[^>]*class="[^"]*\binc-create-target-user-avatar\b[^"]*")[^>]*>/i
)?.[0] || "";

assert.ok(targetTag, "El usuario seleccionado debe renderizar avatar");
assert.match(targetTag, /data-avatar-system="true"/);
assert.match(targetTag, /data-avatar-host="true"/);
assert.match(targetTag, /data-avatar-authority="global"/);
assert.match(targetTag, /data-avatar-source="incidencias-create-selected-user"/);
assert.match(targetTag, /data-avatar-name="Javier Harandou"/);
assert.match(targetTag, /data-avatar-email="harandou@efcusa\.com"/);
assert.match(targetTag, /data-avatar-user-id="ON-1770551914523"/);
assert.match(targetTag, /data-avatar-initials="JH"/);
assert.match(targetTag, /data-avatar-tone="11"/);
assert.match(
  targetTag,
  new RegExp(`data-avatar-identity-contract="${INCIDENCIAS_CREATE_AVATAR_IDENTITY_VERSION}"`)
);

assert.match(
  html,
  /inc-create-target-user-avatar[\s\S]*?data-avatar-fallback="true">JH<\/span>/,
  "El fallback visible del usuario seleccionado debe conservar JH"
);
assert.doesNotMatch(
  html,
  /inc-create-target-user-avatar[\s\S]{0,900}?data-avatar-fallback="true">J<\/span>/,
  "Javier Harandou nunca puede degradarse a una sola J"
);

const resultButton = html.match(
  /<button\b(?=[^>]*class="[^"]*\binc-create-user-result\b[^"]*")[^>]*>[\s\S]*?<\/button>/i
)?.[0] || "";
const resultAvatarTag = resultButton.match(
  /<span\b(?=[^>]*class="[^"]*\binc-create-user-avatar\b[^"]*")[^>]*>/i
)?.[0] || "";

assert.ok(resultAvatarTag, "Los resultados del buscador deben renderizar avatar");
assert.match(resultAvatarTag, /data-avatar-authority="global"/);
assert.match(resultAvatarTag, /data-avatar-source="incidencias-create-search-result"/);
assert.match(resultAvatarTag, /data-avatar-name="Javier Harandou"/);
assert.match(resultAvatarTag, /data-avatar-email="harandou@efcusa\.com"/);
assert.match(resultAvatarTag, /data-avatar-user-id="ON-1770551914523"/);
assert.match(resultAvatarTag, /data-avatar-initials="JH"/);
assert.match(resultAvatarTag, /data-avatar-tone="11"/);

for (const required of [
  ".inc-create-user-avatar",
  ".inc-create-target-user-avatar",
  "--avatar-size: 36px",
  "--avatar-font-size: 14px",
]) {
  assert.ok(css.includes(required), `Falta sizing global Create: ${required}`);
}

for (const forbidden of [
  /background\s*:/,
  /background-color\s*:/,
  /linear-gradient\s*\(/,
  /radial-gradient\s*\(/,
  /\bborder\s*:/,
  /box-shadow\s*:/,
  /data-user-tone/,
  /\[data-avatar-tone=/,
  /--inc-avatar-/,
]) {
  assert.doesNotMatch(
    css,
    forbidden,
    "El contexto Create sólo puede decidir tamaño; color/paint pertenece a AvatarSystem"
  );
}

const authorityImport = appCss.indexOf("./components/avatar-system.css");
const contextImport = appCss.indexOf("./components/avatar-system-contexts.css");
assert.ok(authorityImport >= 0);
assert.ok(contextImport > authorityImport);
assert.match(
  appCss,
  /avatar-system-contexts\.css"\) layer\(guardrails\)/,
  "El sizing Create debe ejecutarse en guardrails después de AvatarSystem"
);

const snapshot = getIncidenciasCreateAvatarIdentitySnapshot();
assert.equal(snapshot.policy.globalAvatarAuthority, true);
assert.equal(snapshot.policy.noFallbackTextAsIdentitySeed, true);
assert.equal(snapshot.policy.noLocalPalette, true);

console.log(
  "Incidencias Create avatar identity: PASS · Javier Harandou = JH · tone 11 · #D13438 · global AvatarSystem"
);

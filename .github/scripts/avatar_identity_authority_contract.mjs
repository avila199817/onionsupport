#!/usr/bin/env node

/* =========================================================
   Onion Support · Avatar Identity Authority Contract

   Garantiza:
   - una identidad de usuario estable produce un único tone SPA-wide;
   - cambios de acentos/capitalización del nombre NO cambian color cuando
     existe email/userId/username;
   - iniciales y paleta siguen siendo compatibles con Fluent UI Persona;
   - AvatarSystem sigue siendo autoridad única;
   - sin aleatoriedad, storage, red ni color persistido.
========================================================= */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  AVATAR_COLOR_SPACE,
  AVATAR_IDENTITY_VERSION,
  AVATAR_TONE_COUNT,
  MICROSOFT_PERSONA_COLORS,
  avatarColorFromIdentity,
  avatarColorKeyFromIdentity,
  avatarInitials,
  avatarSeedFromIdentity,
  avatarToneFromIdentity,
  microsoftPersonaHash,
  resolveAvatarPresentation,
} from "../../src/features/avatar-system/identity.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function executableSource(source = "") {
  return String(source ?? "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

function includesAll(source, values, label) {
  for (const value of values) {
    assert.ok(
      source.includes(value),
      `${label}: falta ${JSON.stringify(value)}`
    );
  }
}

assert.equal(
  AVATAR_IDENTITY_VERSION,
  "avatar-identity.v4-stable-user-tone"
);
assert.equal(AVATAR_TONE_COUNT, 20);
assert.equal(AVATAR_COLOR_SPACE, 20);
assert.equal(MICROSOFT_PERSONA_COLORS.length, 20);

assert.deepEqual(
  MICROSOFT_PERSONA_COLORS.map((entry) => entry.hex),
  [
    "#4F6BED", "#0078D4", "#004E8C", "#038387", "#498205",
    "#0B6A0B", "#C239B3", "#E3008C", "#881798", "#5C2E91",
    "#CA5010", "#D13438", "#A4262C", "#8764B8", "#986F0B",
    "#750B1C", "#7A7574", "#005B70", "#8E562E", "#69797E",
  ],
  "la paleta debe conservar exactamente los 20 swatches Fluent Persona"
);

const canonical = resolveAvatarPresentation({
  userId: "ON-20260901024205",
  email: "avila199817@gmail.com",
  displayName: "Cristian Ávila Luque",
  username: "avila199817",
});

const incidenciaSnapshot = resolveAvatarPresentation({
  requesterUserId: "ON-20260901024205",
  emailLower: "AVILA199817@GMAIL.COM",
  name: "Cristian Ávila Luque",
});

const facturaSnapshot = resolveAvatarPresentation({
  clienteEmail: "avila199817@gmail.com",
  nombre: "Cristian Avila Luque",
});

const nestedSnapshot = resolveAvatarPresentation({
  user: {
    userId: "ON-20260901024205",
    email: "avila199817@gmail.com",
    fullName: "CRISTIAN AVILA LUQUE",
  },
});

const homeSidebarSnapshot = resolveAvatarPresentation({
  displayName: "Cristian Ávila Luque",
  email: "avila199817@gmail.com",
  username: "avila199817",
});

const activitySnapshot = resolveAvatarPresentation({
  name: "Cristian Avila Luque",
  email: "avila199817@gmail.com",
});

for (const presentation of [
  incidenciaSnapshot,
  facturaSnapshot,
  nestedSnapshot,
  homeSidebarSnapshot,
  activitySnapshot,
]) {
  assert.equal(
    presentation.seed,
    canonical.seed,
    "el mismo email debe resolver la misma seed aunque cambie el nombre visible"
  );
  assert.equal(presentation.tone, canonical.tone);
  assert.equal(presentation.color, canonical.color);
  assert.equal(presentation.colorKey, canonical.colorKey);
  assert.equal(
    presentation.fingerprint,
    canonical.fingerprint,
    "la misma persona debe conservar fingerprint entre DTOs"
  );
}

assert.equal(canonical.seed, "email:avila199817@gmail.com");
assert.equal(canonical.initials, "CL");
assert.equal(canonical.tone, 18);
assert.equal(canonical.colorKey, "rust");
assert.equal(canonical.color, "#8E562E");

/* Regression exacta del caso observado en producción. */
const carlosPlain = resolveAvatarPresentation({
  userId: "ON-CARLOS-FIXTURE",
  email: "carlosgarciayepes16@gmail.com",
  displayName: "Carlos Yepes Garcia",
});
const carlosAccent = resolveAvatarPresentation({
  clienteEmail: "CARLOSGARCIAYEPES16@GMAIL.COM",
  nombre: "Carlos Yepes García",
});

assert.notEqual(
  microsoftPersonaHash("Carlos Yepes Garcia") % AVATAR_TONE_COUNT,
  microsoftPersonaHash("Carlos Yepes García") % AVATAR_TONE_COUNT,
  "el displayName crudo reproduce el drift histórico de acento"
);
assert.equal(carlosPlain.seed, "email:carlosgarciayepes16@gmail.com");
assert.equal(carlosAccent.seed, carlosPlain.seed);
assert.equal(carlosAccent.fingerprint, carlosPlain.fingerprint);
assert.equal(carlosAccent.tone, carlosPlain.tone);
assert.equal(carlosAccent.color, carlosPlain.color);
assert.equal(carlosPlain.tone, 2);
assert.equal(carlosPlain.colorKey, "darkBlue");
assert.equal(carlosPlain.color, "#004E8C");
assert.equal(carlosPlain.initials, "CG");
assert.equal(carlosAccent.initials, "CG");

/* Nombre sin identidad estable conserva comportamiento Persona legacy. */
const microsoftSamples = [
  ["Cristian Ávila Luque", "CL", 12, "darkRed", "#A4262C"],
  ["DMARC Reports", "DR", 4, "green", "#498205"],
  ["No Reply", "NR", 5, "darkGreen", "#0B6A0B"],
  ["Soporte Onion Support", "SS", 15, "burgundy", "#750B1C"],
  ["Onion", "O", 15, "burgundy", "#750B1C"],
  ["Nombre (Temporal) Persona", "NP", null, null, null],
];

for (const [name, initials, tone, colorKey, color] of microsoftSamples) {
  assert.equal(avatarInitials(name), initials, `iniciales Microsoft para ${name}`);
  if (tone !== null) {
    assert.equal(avatarToneFromIdentity({ displayName: name }), tone);
    assert.equal(avatarColorKeyFromIdentity({ displayName: name }), colorKey);
    assert.equal(avatarColorFromIdentity({ displayName: name }), color);
  }
}

assert.equal(microsoftPersonaHash("Cristian Ávila Luque"), 512);
assert.equal(microsoftPersonaHash("DMARC Reports"), 8364);
assert.equal(microsoftPersonaHash("No Reply"), 11645);
assert.equal(microsoftPersonaHash("Soporte Onion Support"), 10735);
assert.equal(
  avatarSeedFromIdentity({
    email: " Test.User+tag@Example.COM ",
    displayName: "Cualquier Nombre",
  }),
  "email:test.user+tag@example.com"
);

const identitySource = read("src/features/avatar-system/identity.js");
const identityExecutableSource = executableSource(identitySource);
const runtimeSource = read("src/features/avatar-system/index.js");
const cssSource = read("src/css/components/avatar-system.css");
const privateCssSource = read("src/css/private.css");
const privateRuntimeSource = read("src/features/private-runtime-ui/index.js");
const appCssSource = read("src/css/app.css");

for (const forbidden of [
  /\bMath\.random\s*\(/,
  /\blocalStorage\b/,
  /\bsessionStorage\b/,
  /\bfetch\s*\(/,
]) {
  assert.doesNotMatch(
    identityExecutableSource,
    forbidden,
    `identity authority no puede depender de ${forbidden}`
  );
}

includesAll(
  identitySource,
  [
    "MICROSOFT_PERSONA_COLORS",
    "microsoftPersonaHash",
    "avatarSeedFromIdentity",
    "avatarToneFromSeed",
    "email:${email}",
    "user:${userId}",
    "username:${username}",
    "identified users never derive color from displayName",
    "UNWANTED_ENCLOSURES_REGEX",
    "UNSUPPORTED_TEXT_REGEX",
  ],
  "Avatar stable identity domain"
);

includesAll(
  runtimeSource,
  [
    "data-avatar-authority",
    "data-avatar-identity-version",
    "data-avatar-identity",
    "data-avatar-tone",
    "data-avatar-initials",
    "identityMutationsReconciled: true",
    "legacyToneHintsAreSubordinate: true",
    ".sidebar-user-avatar",
    ".home-current-user-avatar",
    ".incidencias-main",
    ".facturas-main",
    ".clientes-main",
    ".usuarios-main",
  ],
  "AvatarSystem runtime authority"
);

includesAll(
  cssSource,
  [
    "MICROSOFT FLUENT UI V8 PERSONA AUTO-COLOR PALETTE",
    '[data-avatar-tone="0"]',
    '[data-avatar-tone="19"]',
    "--avatar-fallback-color: #A4262C",
    "--avatar-fallback-color: #498205",
    "--avatar-fallback-color: #0B6A0B",
    "--avatar-fallback-color: #750B1C",
    '"Segoe UI"',
    "font-weight: 600",
    "background: var(--avatar-fallback-color)",
    "background-image: none",
    "box-shadow: none",
  ],
  "AvatarSystem Fluent Persona CSS guardrail"
);

assert.doesNotMatch(
  cssSource,
  /linear-gradient\s*\(/,
  "el fallback debe ser plano, sin gradientes"
);

assert.ok(
  privateCssSource.includes("./components/avatar-system.css"),
  "el chunk privado debe transportar la autoridad visual global de avatar"
);
assert.ok(
  privateCssSource.indexOf("./components/avatar-system.css") >
    privateCssSource.indexOf("./compositions/private-amounts.css"),
  "AvatarSystem debe cerrar el chunk privado en guardrails"
);
assert.ok(
  privateRuntimeSource.includes('import("../avatar-system/index.js")'),
  "private runtime debe cargar la autoridad global"
);
assert.ok(
  privateRuntimeSource.includes("AvatarSystemUI.sync?.(document)"),
  "private runtime debe resincronizar el documento"
);

const guardrailIndex = appCssSource.indexOf("./components/avatar-system.css");
const viewCommentIndex = appCssSource.indexOf("ROUTE VIEWS");
assert.ok(guardrailIndex > viewCommentIndex);
assert.ok(appCssSource.includes("layer(guardrails)"));

console.log("✅ avatar identity authority: one stable user = one tone SPA-wide");
console.log(JSON.stringify({
  identityVersion: AVATAR_IDENTITY_VERSION,
  paletteSize: AVATAR_TONE_COUNT,
  canonical: {
    seed: canonical.seed,
    initials: canonical.initials,
    tone: canonical.tone,
    colorKey: canonical.colorKey,
    color: canonical.color,
    fingerprint: canonical.fingerprint,
  },
  carlosRegression: {
    seed: carlosPlain.seed,
    initials: carlosPlain.initials,
    tone: carlosPlain.tone,
    color: carlosPlain.color,
  },
}, null, 2));
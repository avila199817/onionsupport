#!/usr/bin/env node

/* =========================================================
   Onion Support · Avatar Identity Authority Contract

   Garantiza que:
   - identidad/tone/iniciales salen del dominio global;
   - la misma persona conserva presentation entre snapshots distintos;
   - AvatarSystem corrige hints legacy en DOM dinámico;
   - Sidebar/Home/listados están dentro del takeover global;
   - no se introduce aleatoriedad, storage ni red para resolver colores.
========================================================= */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  AVATAR_IDENTITY_VERSION,
  AVATAR_TONE_COUNT,
  avatarInitials,
  avatarSeedFromIdentity,
  avatarToneFromIdentity,
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

assert.match(
  AVATAR_IDENTITY_VERSION,
  /^avatar-identity\.v1-/,
  "identity version debe ser explícita y versionada"
);

assert.equal(AVATAR_TONE_COUNT, 10, "la paleta global actual tiene 10 tones");

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
  nombre: "Cristian Ávila Luque",
});

const nestedSnapshot = resolveAvatarPresentation({
  user: {
    userId: "ON-20260901024205",
    email: "avila199817@gmail.com",
    fullName: "Cristian Ávila Luque",
  },
});

for (const presentation of [
  incidenciaSnapshot,
  facturaSnapshot,
  nestedSnapshot,
]) {
  assert.equal(
    presentation.tone,
    canonical.tone,
    "misma persona debe conservar tone entre snapshots"
  );

  assert.equal(
    presentation.initials,
    canonical.initials,
    "misma persona debe conservar iniciales entre snapshots"
  );

  assert.equal(
    presentation.fingerprint,
    canonical.fingerprint,
    "misma persona debe terminar en la misma identidad visual"
  );
}

assert.equal(
  canonical.initials,
  "CÁ",
  "Cristian Ávila Luque debe usar el contrato global de las dos primeras palabras"
);

assert.equal(
  avatarInitials("Onion"),
  "ON",
  "un nombre de una palabra usa hasta dos caracteres"
);

assert.equal(
  avatarSeedFromIdentity({
    email: " AVILA199817@GMAIL.COM ",
    userId: "ON-OTHER",
  }),
  avatarSeedFromIdentity({
    email: "avila199817@gmail.com",
    userId: "ON-20260901024205",
  }),
  "email normalizado es el alias transversal prioritario"
);

assert.equal(
  avatarToneFromIdentity({ email: "avila199817@gmail.com" }),
  canonical.tone,
  "tone puro debe coincidir con presentation"
);

const identitySource = read("src/features/avatar-system/identity.js");
const identityExecutableSource = executableSource(identitySource);
const runtimeSource = read("src/features/avatar-system/index.js");
const cssSource = read("src/css/components/avatar-system.css");
const privateRuntimeSource = read("src/features/private-runtime-ui/index.js");
const appCssSource = read("src/css/app.css");

assert.equal(
  executableSource("/* Math.random() localStorage sessionStorage fetch() */\nconst stable = true;").includes("Math.random("),
  false,
  "el detector debe ignorar tokens prohibidos cuando sólo aparecen en comentarios"
);

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
  runtimeSource,
  [
    'data-avatar-authority',
    'data-avatar-identity-version',
    'data-avatar-identity',
    'data-avatar-tone',
    'data-avatar-initials',
    'identityMutationsReconciled: true',
    'legacyToneHintsAreSubordinate: true',
    '.sidebar-user-avatar',
    '.home-current-user-avatar',
    '.incidencias-main',
    '.facturas-main',
    '.clientes-main',
    '.usuarios-main',
  ],
  "AvatarSystem runtime authority"
);

includesAll(
  cssSource,
  [
    '[data-avatar-system="true"]',
    '[data-avatar-tone="0"]',
    '[data-avatar-tone="9"]',
    'VALID IMAGE · NOTHING MAY PAINT BEHIND ALPHA',
    'ONE FALLBACK PALETTE',
  ],
  "AvatarSystem CSS guardrail"
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

assert.ok(guardrailIndex > viewCommentIndex, "avatar-system.css debe cerrar la cascada después de vistas");
assert.ok(appCssSource.includes("layer(guardrails)"), "AvatarSystem debe vivir en guardrails");

console.log("✅ avatar identity authority contract: OK");
console.log(JSON.stringify({
  identityVersion: AVATAR_IDENTITY_VERSION,
  toneCount: AVATAR_TONE_COUNT,
  sample: {
    initials: canonical.initials,
    tone: canonical.tone,
    fingerprint: canonical.fingerprint,
  },
}, null, 2));

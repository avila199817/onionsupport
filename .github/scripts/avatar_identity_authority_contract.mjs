#!/usr/bin/env node

/* =========================================================
   Onion Support · Avatar Identity Authority Contract

   Garantiza que:
   - identidad/tone/iniciales salen del dominio global;
   - la misma persona conserva presentation entre snapshots distintos;
   - Home/Sidebar sin email y actividad con email convergen igualmente;
   - el espacio cromático ya no es una paleta discreta de 10 buckets;
   - AvatarSystem corrige hints legacy en DOM dinámico;
   - Sidebar/Home/listados están dentro del takeover global;
   - no se introduce aleatoriedad, storage ni red para resolver colores.
========================================================= */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  AVATAR_COLOR_SPACE,
  AVATAR_IDENTITY_VERSION,
  AVATAR_TONE_COUNT,
  avatarColorKeyFromSeed,
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
  /^avatar-identity\.v2-/,
  "identity version debe reflejar la autoridad portable uint32"
);

assert.equal(
  AVATAR_TONE_COUNT,
  0x1_0000_0000,
  "el tone debe usar el espacio uint32 completo"
);
assert.equal(
  AVATAR_COLOR_SPACE,
  0x1_0000_0000,
  "el espacio cromático debe exponer 2^32 perfiles deterministas"
);
assert.ok(
  AVATAR_COLOR_SPACE > 4_000_000_000,
  "la identidad no puede volver a una paleta pequeña"
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
  nombre: "Cristian Ávila Luque",
});

const nestedSnapshot = resolveAvatarPresentation({
  user: {
    userId: "ON-20260901024205",
    email: "avila199817@gmail.com",
    fullName: "Cristian Ávila Luque",
  },
});

/* Reproduce el fallo visual observado: usuario público sin email vs DTO con email. */
const homeSidebarSnapshot = resolveAvatarPresentation({
  displayName: "Cristian Ávila Luque",
  username: "avila199817",
});
const activitySnapshot = resolveAvatarPresentation({
  name: "Cristian Ávila Luque",
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
    presentation.tone,
    canonical.tone,
    "misma persona debe conservar tone entre snapshots parciales"
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

  assert.equal(
    presentation.colorKey,
    canonical.colorKey,
    "misma persona debe conservar la misma clave cromática"
  );
}

assert.equal(canonical.initials, "CÁ");
assert.equal(avatarInitials("Onion"), "ON");
assert.equal(
  homeSidebarSnapshot.seed,
  activitySnapshot.seed,
  "username y local-part de email deben reconciliar Home/Sidebar con actividad"
);
assert.equal(
  avatarToneFromIdentity({
    displayName: "Cristian Ávila Luque",
    username: "avila199817",
  }),
  canonical.tone
);
assert.equal(
  avatarToneFromIdentity({
    name: "Cristian Ávila Luque",
    email: "avila199817@gmail.com",
  }),
  canonical.tone
);
assert.equal(
  avatarColorKeyFromSeed(canonical.seed),
  canonical.colorKey
);

/* La antigua paleta de 10 colisionaba casi inmediatamente. */
const syntheticTones = new Set();
for (let index = 0; index < 4096; index += 1) {
  syntheticTones.add(
    resolveAvatarPresentation({
      displayName: `Persona Sintética ${index}`,
      email: `persona.${index}@example.test`,
    }).tone
  );
}
assert.ok(
  syntheticTones.size >= 4080,
  `diversidad uint32 degradada: sólo ${syntheticTones.size}/4096 tones únicos`
);

const identitySource = read("src/features/avatar-system/identity.js");
const identityExecutableSource = executableSource(identitySource);
const runtimeSource = read("src/features/avatar-system/index.js");
const cssSource = read("src/css/components/avatar-system.css");
const privateCssSource = read("src/css/private.css");
const privateRuntimeSource = read("src/features/private-runtime-ui/index.js");
const appCssSource = read("src/css/app.css");

assert.equal(
  executableSource("/* Math.random() localStorage sessionStorage fetch() */\nconst stable = true;").includes("Math.random("),
  false
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
  identitySource,
  [
    "0x1_0000_0000",
    "FNV-1a + avalanche uint32",
    "onion-avatar-color:v2|",
    "explicitAvatarNameFromIdentity",
    "emailHandle",
  ],
  "Avatar identity domain"
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
    "UINT32 COLOR ENGINE",
    "4,294,967,296 TONES",
    "attr(data-avatar-tone type(<number>), 0)",
    "mod(var(--avatar-tone-number), 360)",
    '[data-avatar-authority="global"][data-avatar-state="fallback"]',
    "VALID IMAGE · NOTHING MAY PAINT BEHIND ALPHA",
    "ONE FALLBACK PAINT AUTHORITY",
  ],
  "AvatarSystem CSS guardrail"
);
assert.doesNotMatch(
  cssSource,
  /\[data-avatar-tone="[0-9]"\]/,
  "el guardrail global no puede volver a enumerar una paleta de 10 tones"
);

assert.ok(
  privateCssSource.includes('./components/avatar-system.css'),
  "el chunk privado debe transportar su propia autoridad visual de avatar"
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

console.log("✅ avatar identity authority contract: OK");
console.log(JSON.stringify({
  identityVersion: AVATAR_IDENTITY_VERSION,
  toneCount: AVATAR_TONE_COUNT,
  sample: {
    initials: canonical.initials,
    tone: canonical.tone,
    colorKey: canonical.colorKey,
    fingerprint: canonical.fingerprint,
  },
  diversity: {
    checked: 4096,
    uniqueTones: syntheticTones.size,
  },
}, null, 2));
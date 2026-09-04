/* =========================================================
   Onion Support - Avatar Identity Authority
   Archivo: /src/features/avatar-system/identity.js

   PURE DOMAIN · SINGLE SOURCE OF TRUTH

   Microsoft Fluent UI Persona parity:
   - Iniciales: misma regla que Fluent UI/Persona para nombres latinos.
   - Colores: misma paleta y mismo hash determinista de PersonaInitialsColor.
   - Misma persona/nombre => mismo color en cualquier vista.
   - Sin aleatoriedad, storage, red ni color persistido.
========================================================= */

"use strict";

export const AVATAR_IDENTITY_VERSION =
  "avatar-identity.v3-microsoft-fluent-persona-v8";

/*
  Fluent UI v8 Persona auto-colors.
  Orden y valores hex exactos de Microsoft:
  lightBlue, blue, darkBlue, teal, green, darkGreen, lightPink, pink,
  magenta, purple, orange, lightRed, darkRed, violet, gold, burgundy,
  warmGray, cyan, rust, coolGray.
*/
export const MICROSOFT_PERSONA_COLORS = Object.freeze([
  Object.freeze({ key: "lightBlue", hex: "#4F6BED" }),
  Object.freeze({ key: "blue", hex: "#0078D4" }),
  Object.freeze({ key: "darkBlue", hex: "#004E8C" }),
  Object.freeze({ key: "teal", hex: "#038387" }),
  Object.freeze({ key: "green", hex: "#498205" }),
  Object.freeze({ key: "darkGreen", hex: "#0B6A0B" }),
  Object.freeze({ key: "lightPink", hex: "#C239B3" }),
  Object.freeze({ key: "pink", hex: "#E3008C" }),
  Object.freeze({ key: "magenta", hex: "#881798" }),
  Object.freeze({ key: "purple", hex: "#5C2E91" }),
  Object.freeze({ key: "orange", hex: "#CA5010" }),
  Object.freeze({ key: "lightRed", hex: "#D13438" }),
  Object.freeze({ key: "darkRed", hex: "#A4262C" }),
  Object.freeze({ key: "violet", hex: "#8764B8" }),
  Object.freeze({ key: "gold", hex: "#986F0B" }),
  Object.freeze({ key: "burgundy", hex: "#750B1C" }),
  Object.freeze({ key: "warmGray", hex: "#7A7574" }),
  Object.freeze({ key: "cyan", hex: "#005B70" }),
  Object.freeze({ key: "rust", hex: "#8E562E" }),
  Object.freeze({ key: "coolGray", hex: "#69797E" }),
]);

export const AVATAR_TONE_COUNT = MICROSOFT_PERSONA_COLORS.length;
export const AVATAR_COLOR_SPACE = AVATAR_TONE_COUNT;

function isObject(value = null) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

export function cleanAvatarText(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

export function normalizeAvatarEmail(value = "") {
  const email = cleanAvatarText(value, "")
    .toLowerCase()
    .replace(/\s+/g, "");

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ? email
    : "";
}

export function normalizeAvatarUserId(value = "") {
  return cleanAvatarText(value, "").toLowerCase();
}

export function normalizeAvatarUsername(value = "") {
  return cleanAvatarText(value, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^@+/, "")
    .replace(/\s+/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .toLowerCase();
}

export function normalizeAvatarName(value = "") {
  return cleanAvatarText(value, "")
    .toLocaleLowerCase("es-ES")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s._-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function firstText(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;

    if (
      typeof value === "string" ||
      typeof value === "number"
    ) {
      const output = cleanAvatarText(value, "");
      if (output) return output;
    }
  }

  return "";
}

function objectCandidates(input = {}) {
  const source = isObject(input) ? input : {};
  const profile = isObject(source.profile) ? source.profile : {};
  const user = isObject(source.user) ? source.user : {};
  const raw = isObject(source.raw) ? source.raw : {};

  return { source, profile, user, raw };
}

function explicitAvatarNameFromIdentity(input = {}) {
  if (!isObject(input)) return cleanAvatarText(input, "");

  const { source, profile, user, raw } = objectCandidates(input);

  return firstText(
    source.displayName,
    source.fullName,
    source.name,
    source.nombre,
    source.contactName,
    source.nombreContacto,
    source.requesterName,
    source.clienteNombre,
    source.userNameDisplay,
    profile.displayName,
    profile.fullName,
    profile.name,
    profile.nombre,
    user.displayName,
    user.fullName,
    user.name,
    user.nombre,
    raw.displayName,
    raw.fullName,
    raw.name,
    raw.nombre,
    ""
  );
}

export function avatarNameFromIdentity(input = {}) {
  if (!isObject(input)) {
    return cleanAvatarText(input, "");
  }

  const { source, profile, user, raw } = objectCandidates(input);

  return firstText(
    explicitAvatarNameFromIdentity(input),
    source.username,
    profile.username,
    user.username,
    raw.username,
    source.email,
    profile.email,
    user.email,
    raw.email,
    ""
  );
}

export function avatarEmailFromIdentity(input = {}) {
  if (!isObject(input)) {
    return normalizeAvatarEmail(input);
  }

  const { source, profile, user, raw } = objectCandidates(input);

  return normalizeAvatarEmail(
    firstText(
      source.emailLower,
      source.email,
      source.userEmail,
      source.clientEmail,
      source.clienteEmail,
      source.emailAddress,
      source.mail,
      profile.emailLower,
      profile.email,
      profile.emailAddress,
      profile.mail,
      user.emailLower,
      user.email,
      user.emailAddress,
      user.mail,
      raw.emailLower,
      raw.email,
      raw.emailAddress,
      raw.mail,
      ""
    )
  );
}

export function avatarUserIdFromIdentity(input = {}) {
  if (!isObject(input)) return "";

  const { source, profile, user, raw } = objectCandidates(input);

  return normalizeAvatarUserId(
    firstText(
      source.userId,
      source.usuarioId,
      source.uid,
      source.ownerUserId,
      source.requesterUserId,
      source.createdByUserId,
      source.technicianUserId,
      source.tecnicoUserId,
      profile.userId,
      profile.id,
      user.userId,
      user.id,
      raw.userId,
      raw.usuarioId,
      ""
    )
  );
}

export function avatarUsernameFromIdentity(input = {}) {
  if (!isObject(input)) return "";

  const { source, profile, user, raw } = objectCandidates(input);

  return normalizeAvatarUsername(
    firstText(
      source.usernameLower,
      source.username,
      source.userName,
      source.user_name,
      source.slug,
      source.publicSlug,
      profile.username,
      profile.userName,
      profile.slug,
      user.username,
      user.userName,
      user.slug,
      raw.username,
      raw.userName,
      raw.slug,
      ""
    )
  );
}

function emailHandle(value = "") {
  const email = normalizeAvatarEmail(value);
  if (!email) return "";
  return normalizeAvatarUsername(email.split("@")[0] || "");
}

/*
  Identidad estable de Onion Support. Se mantiene separada del color:
  Microsoft calcula el color desde displayName; Onion usa esta seed para
  fingerprint/reconciliación de la misma persona entre DTOs.
*/
export function avatarSeedFromIdentity(input = {}) {
  const username = avatarUsernameFromIdentity(input);
  const email = avatarEmailFromIdentity(input);
  const handle = username || emailHandle(email);
  if (handle) return `handle:${handle}`;

  const userId = avatarUserIdFromIdentity(input);
  if (userId) return `user:${userId}`;

  const explicitName = normalizeAvatarName(
    explicitAvatarNameFromIdentity(input)
  );
  if (explicitName) return `name:${explicitName}`;

  if (email) return `email:${email}`;

  return "avatar:onion-support";
}

/* Fingerprint estable de identidad; no decide el color visual. */
export function hashAvatarSeed(value = "") {
  const seed = cleanAvatarText(value, "avatar:onion-support");
  let hash = 0x811c9dc5;

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;

  return hash >>> 0;
}

/*
  Hash exacto usado por Microsoft Fluent UI Persona para el auto-color.
  Se recorre el displayName de derecha a izquierda y se combinan sus UTF-16
  charCode con un shift i % 8.
*/
export function microsoftPersonaHash(displayName = "") {
  const name = cleanAvatarText(displayName, "");
  let hashCode = 0;

  for (let index = name.length - 1; index >= 0; index -= 1) {
    const charCode = name.charCodeAt(index);
    const shift = index % 8;
    hashCode ^= (charCode << shift) + (charCode >> (8 - shift));
  }

  return hashCode;
}

export function avatarToneFromName(displayName = "") {
  const name = cleanAvatarText(displayName, "");
  if (!name) return 1;
  return microsoftPersonaHash(name) % AVATAR_TONE_COUNT;
}

/*
  Compatibilidad para consumidores que sólo tienen una seed textual.
  La presentación normal debe usar avatarToneFromIdentity(), que hashea el
  displayName como Microsoft.
*/
export function avatarToneFromSeed(value = "") {
  return avatarToneFromName(
    cleanAvatarText(value, "avatar:onion-support")
  );
}

export function avatarToneFromIdentity(input = {}) {
  return avatarToneFromName(
    avatarNameFromIdentity(input)
  );
}

export function avatarColorFromTone(value = 1) {
  const numeric = Number(value);
  const tone = Number.isFinite(numeric)
    ? ((Math.trunc(numeric) % AVATAR_TONE_COUNT) + AVATAR_TONE_COUNT) %
      AVATAR_TONE_COUNT
    : 1;

  return MICROSOFT_PERSONA_COLORS[tone]?.hex || "#0078D4";
}

export function avatarColorKeyFromTone(value = 1) {
  const numeric = Number(value);
  const tone = Number.isFinite(numeric)
    ? ((Math.trunc(numeric) % AVATAR_TONE_COUNT) + AVATAR_TONE_COUNT) %
      AVATAR_TONE_COUNT
    : 1;

  return MICROSOFT_PERSONA_COLORS[tone]?.key || "blue";
}

export function avatarColorKeyFromSeed(value = "") {
  return avatarColorKeyFromTone(
    avatarToneFromSeed(value)
  );
}

export function avatarColorFromIdentity(input = {}) {
  return avatarColorFromTone(
    avatarToneFromIdentity(input)
  );
}

export function avatarColorKeyFromIdentity(input = {}) {
  return avatarColorKeyFromTone(
    avatarToneFromIdentity(input)
  );
}

/* =========================================================
   MICROSOFT FLUENT UI PERSONA INITIALS
========================================================= */

const UNWANTED_ENCLOSURES_REGEX =
  /[\(\[\{\<][^\)\]\}\>]*[\)\]\}\>]/g;

const UNWANTED_CHARS_REGEX =
  /[\0-\u001F\!-/:-@\[-`\{-\u00BF\u0250-\u036F\uD800-\uFFFF]/g;

const PHONENUMBER_REGEX =
  /^\d+[\d\s]*(:?ext|x|)\s*\d+$/i;

const MULTIPLE_WHITESPACES_REGEX = /\s+/g;

const UNSUPPORTED_TEXT_REGEX =
  /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\u1100-\u11FF\u3130-\u318F\uA960-\uA97F\uAC00-\uD7AF\uD7B0-\uD7FF\u3040-\u309F\u30A0-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]|[\uD840-\uD869][\uDC00-\uDED6]/;

function cleanupMicrosoftDisplayName(value = "") {
  return cleanAvatarText(value, "")
    .replace(UNWANTED_ENCLOSURES_REGEX, "")
    .replace(UNWANTED_CHARS_REGEX, "")
    .replace(MULTIPLE_WHITESPACES_REGEX, " ")
    .trim();
}

export function avatarInitials(value = "") {
  const rawName = isObject(value)
    ? avatarNameFromIdentity(value)
    : cleanAvatarText(value, "");

  if (!rawName) return "ON";

  const displayName = cleanupMicrosoftDisplayName(rawName);
  if (!displayName) return "ON";

  if (
    UNSUPPORTED_TEXT_REGEX.test(displayName) ||
    PHONENUMBER_REGEX.test(displayName)
  ) {
    return "ON";
  }

  const splits = displayName.split(" ");
  let initials = "";

  if (splits.length === 2) {
    initials += splits[0].charAt(0).toUpperCase();
    initials += splits[1].charAt(0).toUpperCase();
  } else if (splits.length === 3) {
    initials += splits[0].charAt(0).toUpperCase();
    initials += splits[2].charAt(0).toUpperCase();
  } else if (splits.length !== 0) {
    initials += splits[0].charAt(0).toUpperCase();
  }

  return initials || "ON";
}

export function avatarIdentityFingerprint(input = {}) {
  return hashAvatarSeed(
    `onion-avatar-fingerprint:v3|${avatarSeedFromIdentity(input)}`
  ).toString(36);
}

export function resolveAvatarPresentation(input = {}) {
  const name = avatarNameFromIdentity(input);
  const email = avatarEmailFromIdentity(input);
  const userId = avatarUserIdFromIdentity(input);
  const username = avatarUsernameFromIdentity(input);
  const seed = avatarSeedFromIdentity(input);
  const tone = avatarToneFromIdentity({
    ...(isObject(input) ? input : {}),
    name,
    email,
    userId,
    username,
  });
  const initials = avatarInitials({
    ...(isObject(input) ? input : {}),
    name,
    email,
    userId,
    username,
  });

  return Object.freeze({
    version: AVATAR_IDENTITY_VERSION,
    name,
    email,
    userId,
    username,
    seed,
    tone,
    colorKey: avatarColorKeyFromTone(tone),
    color: avatarColorFromTone(tone),
    initials,
    fingerprint: avatarIdentityFingerprint({
      name,
      email,
      userId,
      username,
    }),
  });
}

export default Object.freeze({
  version: AVATAR_IDENTITY_VERSION,
  toneCount: AVATAR_TONE_COUNT,
  colorSpace: AVATAR_COLOR_SPACE,
  colors: MICROSOFT_PERSONA_COLORS,
  cleanText: cleanAvatarText,
  normalizeEmail: normalizeAvatarEmail,
  normalizeUserId: normalizeAvatarUserId,
  normalizeUsername: normalizeAvatarUsername,
  normalizeName: normalizeAvatarName,
  initials: avatarInitials,
  seed: avatarSeedFromIdentity,
  hash: hashAvatarSeed,
  microsoftHash: microsoftPersonaHash,
  toneFromName: avatarToneFromName,
  toneFromSeed: avatarToneFromSeed,
  tone: avatarToneFromIdentity,
  colorFromTone: avatarColorFromTone,
  colorKeyFromTone: avatarColorKeyFromTone,
  colorFromIdentity: avatarColorFromIdentity,
  colorKeyFromIdentity: avatarColorKeyFromIdentity,
  colorKeyFromSeed: avatarColorKeyFromSeed,
  fingerprint: avatarIdentityFingerprint,
  resolve: resolveAvatarPresentation,
});
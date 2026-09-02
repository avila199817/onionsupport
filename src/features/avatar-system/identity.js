/* =========================================================
   Onion Support - Avatar Identity Authority
   Archivo: /src/features/avatar-system/identity.js

   PURE DOMAIN · SINGLE SOURCE OF TRUTH

   Contrato:
   - La misma persona produce la misma identidad visual en cualquier vista.
   - No existe aleatoriedad runtime, storage, red ni color persistido.
   - El color se deriva de una clave estable y usa todo el espacio uint32.
   - Los snapshots parciales priorizan el nombre humano normalizado porque es
     el alias que permanece visible incluso cuando Core/DTO omiten email/id.
   - Si no hay nombre humano, username y local-part del email comparten handle.
========================================================= */

"use strict";

export const AVATAR_IDENTITY_VERSION =
  "avatar-identity.v2-portable-seed-uint32-color";

/* 2^32 perfiles deterministas antes de repetir el tone numérico. */
export const AVATAR_TONE_COUNT = 0x1_0000_0000;
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
  El nombre humano es el alias visual más portable de los snapshots actuales:
  Home/Sidebar pueden recibir un usuario público sin email mientras que
  Incidencias/Facturas sí lo traen. Usarlo primero evita que una misma persona
  cambie de color por la forma del DTO. Cuando no hay nombre, el local-part del
  email y username comparten namespace para reconciliar snapshots parciales.
*/
export function avatarSeedFromIdentity(input = {}) {
  const explicitName = normalizeAvatarName(
    explicitAvatarNameFromIdentity(input)
  );
  if (explicitName) return `name:${explicitName}`;

  const username = avatarUsernameFromIdentity(input);
  const email = avatarEmailFromIdentity(input);
  const handle = username || emailHandle(email);
  if (handle) return `handle:${handle}`;

  const userId = avatarUserIdFromIdentity(input);
  if (userId) return `user:${userId}`;

  if (email) return `email:${email}`;

  return "avatar:onion-support";
}

/*
  FNV-1a + avalanche uint32. Sigue siendo puro y determinista, pero distribuye
  mucho mejor que el antiguo modulo 10 para perfiles cromáticos masivos.
*/
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

export function avatarToneFromSeed(value = "") {
  const seed = cleanAvatarText(value, "avatar:onion-support");
  return hashAvatarSeed(`onion-avatar-color:v2|${seed}`);
}

export function avatarToneFromIdentity(input = {}) {
  return avatarToneFromSeed(
    avatarSeedFromIdentity(input)
  );
}

export function avatarColorKeyFromSeed(value = "") {
  return avatarToneFromSeed(value)
    .toString(36)
    .padStart(7, "0");
}

function unicodeChars(value = "") {
  return Array.from(cleanAvatarText(value, ""));
}

function letterFromToken(value = "") {
  return unicodeChars(value)
    .find((char) => /[\p{L}\p{N}]/u.test(char)) || "";
}

export function avatarInitials(value = "") {
  const name = isObject(value)
    ? avatarNameFromIdentity(value)
    : cleanAvatarText(value, "");

  const words = name
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (words.length >= 2) {
    const first = letterFromToken(words[0]);
    const second = letterFromToken(words[1]);
    const output = `${first}${second}`.toLocaleUpperCase("es-ES");
    if (output) return unicodeChars(output).slice(0, 2).join("");
  }

  if (words.length === 1) {
    const output = unicodeChars(words[0])
      .filter((char) => /[\p{L}\p{N}]/u.test(char))
      .slice(0, 2)
      .join("")
      .toLocaleUpperCase("es-ES");

    if (output) return output;
  }

  const email = isObject(value)
    ? avatarEmailFromIdentity(value)
    : normalizeAvatarEmail(value);

  if (email) {
    const local = email.split("@")[0] || "";
    const output = unicodeChars(local)
      .filter((char) => /[\p{L}\p{N}]/u.test(char))
      .slice(0, 2)
      .join("")
      .toUpperCase();

    if (output) return output;
  }

  return "ON";
}

export function avatarIdentityFingerprint(input = {}) {
  return hashAvatarSeed(
    `onion-avatar-fingerprint:v2|${avatarSeedFromIdentity(input)}`
  ).toString(36);
}

export function resolveAvatarPresentation(input = {}) {
  const name = avatarNameFromIdentity(input);
  const email = avatarEmailFromIdentity(input);
  const userId = avatarUserIdFromIdentity(input);
  const username = avatarUsernameFromIdentity(input);
  const seed = avatarSeedFromIdentity(input);
  const tone = avatarToneFromSeed(seed);
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
    colorKey: avatarColorKeyFromSeed(seed),
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
  cleanText: cleanAvatarText,
  normalizeEmail: normalizeAvatarEmail,
  normalizeUserId: normalizeAvatarUserId,
  normalizeUsername: normalizeAvatarUsername,
  normalizeName: normalizeAvatarName,
  initials: avatarInitials,
  seed: avatarSeedFromIdentity,
  hash: hashAvatarSeed,
  toneFromSeed: avatarToneFromSeed,
  tone: avatarToneFromIdentity,
  colorKeyFromSeed: avatarColorKeyFromSeed,
  fingerprint: avatarIdentityFingerprint,
  resolve: resolveAvatarPresentation,
});
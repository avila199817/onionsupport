/* =========================================================
   Onion Support - Avatar Identity Authority
   Archivo: /src/features/avatar-system/identity.js

   PURE DOMAIN · SINGLE SOURCE OF TRUTH

   Responsabilidad:
   - Resolver una identidad visual estable sin depender de una vista concreta.
   - Producir las mismas iniciales y el mismo tone para la misma persona.
   - Mantener el algoritmo determinista: nunca Math.random(), nunca storage.
   - No persistir color en backend/Cosmos: el color deriva de la identidad.
   - No conocer DOM, Auth, Router, HTTP ni CSS de una vista concreta.

   Prioridad del seed visual:
   1. email normalizado: es el alias que hoy atraviesa más snapshots/vistas;
   2. userId estable;
   3. username/slug;
   4. nombre normalizado como compatibilidad legacy.

   IMPORTANTE:
   El sistema global puede conocer además varios aliases de una misma persona,
   pero todos deben terminar pasando por esta función pura.
========================================================= */

"use strict";

export const AVATAR_IDENTITY_VERSION =
  "avatar-identity.v1-deterministic-single-authority";

export const AVATAR_TONE_COUNT = 10;

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

export function avatarNameFromIdentity(input = {}) {
  if (!isObject(input)) {
    return cleanAvatarText(input, "");
  }

  const { source, profile, user, raw } = objectCandidates(input);

  return firstText(
    source.displayName,
    source.fullName,
    source.name,
    source.nombre,
    source.contactName,
    source.nombreContacto,
    profile.displayName,
    profile.fullName,
    profile.name,
    user.displayName,
    user.fullName,
    user.name,
    raw.displayName,
    raw.fullName,
    raw.name,
    source.username,
    source.email,
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
      profile.emailLower,
      profile.email,
      user.emailLower,
      user.email,
      raw.emailLower,
      raw.email,
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
      source.slug,
      source.publicSlug,
      profile.username,
      profile.slug,
      user.username,
      user.slug,
      raw.username,
      raw.slug,
      ""
    )
  );
}

export function avatarSeedFromIdentity(input = {}) {
  const email = avatarEmailFromIdentity(input);
  if (email) return `email:${email}`;

  const userId = avatarUserIdFromIdentity(input);
  if (userId) return `user:${userId}`;

  const username = avatarUsernameFromIdentity(input);
  if (username) return `username:${username}`;

  const name = normalizeAvatarName(avatarNameFromIdentity(input));
  if (name) return `name:${name}`;

  return "avatar:onion-support";
}

/*
  Conservamos deliberadamente el hash entero que ya usaban Incidencias,
  Facturas/Home y varias vistas legacy. Centralizarlo aquí permite que el
  takeover global mantenga el color existente y elimine diferencias visuales
  sin una migración cromática inesperada para los usuarios actuales.
*/
export function hashAvatarSeed(value = "") {
  const seed = cleanAvatarText(value, "avatar:onion-support");
  let hash = 0;

  for (let index = 0; index < seed.length; index += 1) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(index);
    hash |= 0;
  }

  return hash >>> 0;
}

export function avatarToneFromSeed(value = "") {
  return hashAvatarSeed(value) % AVATAR_TONE_COUNT;
}

export function avatarToneFromIdentity(input = {}) {
  return avatarToneFromSeed(
    avatarSeedFromIdentity(input)
  );
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
    `onion-avatar:v1|${avatarSeedFromIdentity(input)}`
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
  fingerprint: avatarIdentityFingerprint,
  resolve: resolveAvatarPresentation,
});

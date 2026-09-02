/* =========================================================
   Onion Support · Incidencias Comment Identity

   PURE DOMAIN · NO DOM · NO HTTP · NO PAINT

   Responsabilidad:
   - Resolver identidad estable de autores desde el detalle ya cargado.
   - Priorizar userId/email frente a coincidencias por nombre.
   - Mantener compatibilidad legacy por nombre sólo cuando no hay identidad estable.
   - No decidir color, iniciales, imagen, CSS ni estado de avatar.
========================================================= */

"use strict";

import {
  cleanAvatarText,
  normalizeAvatarEmail,
  normalizeAvatarName,
  normalizeAvatarUserId,
} from "../avatar-system/identity.js";

export const INCIDENCIAS_COMMENT_IDENTITY_VERSION =
  "incidencias.comment-identity.v1-pure-stable-aliases";

function safeObject(value = null) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : null;
}

function safeArray(value = null) {
  return Array.isArray(value) ? value : [];
}

function firstText(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    if (typeof value !== "string" && typeof value !== "number") continue;
    const text = cleanAvatarText(value, "");
    if (text) return text;
  }
  return "";
}

function firstObject(...values) {
  for (const value of values) {
    const object = safeObject(value);
    if (object && Object.keys(object).length) return object;
  }
  return {};
}

function samePerson(left = "", right = "") {
  const a = normalizeAvatarName(left);
  const b = normalizeAvatarName(right);

  if (!a || !b) return false;
  if (a === b) return true;

  return (
    a.length >= 5 &&
    b.length >= 5 &&
    (a.includes(b) || b.includes(a))
  );
}

export function requesterIdentity(detail = {}) {
  const raw = safeObject(detail?.raw) || {};
  const requester = firstObject(
    detail.requesterSnapshot,
    detail.cliente,
    detail.receptor,
    detail.user,
    raw.requesterSnapshot,
    raw.cliente,
    raw.receptor,
    raw.user
  );

  return Object.freeze({
    userId: normalizeAvatarUserId(firstText(
      detail.userId,
      detail.usuarioId,
      detail.ownerUserId,
      detail.createdByUserId,
      detail.receptorUserId,
      requester.userId,
      requester.id,
      raw.userId,
      raw.usuarioId,
      raw.ownerUserId,
      raw.createdByUserId,
      raw.receptorUserId
    )),
    email: normalizeAvatarEmail(firstText(
      detail.email,
      detail.emailLower,
      detail.userEmail,
      detail.clienteEmail,
      requester.email,
      requester.emailLower,
      raw.email,
      raw.emailLower,
      raw.userEmail
    )),
  });
}

export function technicianIdentity(detail = {}) {
  const raw = safeObject(detail?.raw) || {};
  const assignment = firstObject(detail.assignment, raw.assignment);
  const technician = firstObject(
    assignment.technician,
    detail.tecnico,
    detail.assignedTo,
    detail.technician,
    raw.tecnico,
    raw.assignedTo,
    raw.technician
  );

  return Object.freeze({
    userId: normalizeAvatarUserId(firstText(
      detail.assignedToUserId,
      detail.technicianUserId,
      detail.tecnicoUserId,
      assignment.assignedToUserId,
      assignment.userId,
      assignment.technician?.userId,
      assignment.technician?.id,
      technician.userId,
      technician.id,
      raw.assignedToUserId,
      raw.technicianUserId,
      raw.tecnicoUserId
    )),
    email: normalizeAvatarEmail(firstText(
      detail.assignedToEmail,
      detail.technicianEmail,
      detail.tecnicoEmail,
      assignment.assignedToEmail,
      assignment.email,
      assignment.technician?.email,
      technician.email,
      technician.emailLower,
      raw.assignedToEmail,
      raw.technicianEmail,
      raw.tecnicoEmail
    )),
  });
}

function commentEntries(detail = {}) {
  const raw = safeObject(detail?.raw) || {};
  const entries = [];

  for (const value of [
    ...safeArray(detail.comments),
    ...safeArray(detail.notes),
    ...safeArray(detail.messages),
    ...safeArray(raw.comments),
    ...safeArray(raw.notes),
    ...safeArray(raw.messages),
  ]) {
    const entry = safeObject(value);
    if (entry) entries.push(entry);
  }

  for (const value of [
    ...safeArray(detail.timeline),
    ...safeArray(raw.timeline),
  ]) {
    const entry = safeObject(value);
    if (!entry) continue;

    const kind = firstText(
      entry.kind,
      entry.type,
      entry.action,
      entry.event
    ).toLowerCase();

    if (["comment", "comentario"].includes(kind)) entries.push(entry);
  }

  return entries;
}

export function stableCommentIdentity(entry = {}) {
  const byObject = safeObject(entry.by) || {};
  const createdBy = safeObject(entry.createdBy) || {};
  const updatedBy = safeObject(entry.updatedBy) || {};

  return Object.freeze({
    name: firstText(
      entry.author,
      entry.byName,
      entry.createdByName,
      entry.userName,
      entry.name,
      byObject.name,
      createdBy.name,
      updatedBy.name
    ),
    userId: normalizeAvatarUserId(firstText(
      entry.byUserId,
      typeof entry.by === "string" || typeof entry.by === "number"
        ? entry.by
        : "",
      entry.authorUserId,
      entry.createdByUserId,
      entry.userId,
      byObject.userId,
      byObject.id,
      createdBy.userId,
      createdBy.id,
      updatedBy.userId,
      updatedBy.id
    )),
    email: normalizeAvatarEmail(firstText(
      entry.byEmail,
      entry.authorEmail,
      entry.createdByEmail,
      entry.email,
      byObject.email,
      createdBy.email,
      updatedBy.email
    )),
  });
}

export function buildCommentIdentityIndex(detail = {}) {
  const aggregate = new Map();

  for (const entry of commentEntries(detail)) {
    const identity = stableCommentIdentity(entry);
    const key = normalizeAvatarName(identity.name);
    if (!key) continue;

    const bucket = aggregate.get(key) || {
      userIds: new Set(),
      emails: new Set(),
    };

    if (identity.userId) bucket.userIds.add(identity.userId);
    if (identity.email) bucket.emails.add(identity.email);
    aggregate.set(key, bucket);
  }

  const index = new Map();

  for (const [key, bucket] of aggregate) {
    const userIds = [...bucket.userIds];
    const emails = [...bucket.emails];

    index.set(key, Object.freeze({
      userId: userIds.length === 1 ? userIds[0] : "",
      email: emails.length === 1 ? emails[0] : "",
      ambiguous: userIds.length > 1 || emails.length > 1,
      hasStableIdentity: userIds.length > 0 || emails.length > 0,
    }));
  }

  return index;
}

export function matchProfileByStableIdentity(identity = null, profiles = []) {
  if (!identity || identity.ambiguous) return null;

  if (identity.userId) {
    const matches = profiles.filter(
      (profile) => profile?.userId && profile.userId === identity.userId
    );
    if (matches.length === 1) return matches[0];
  }

  if (identity.email) {
    const matches = profiles.filter(
      (profile) => profile?.email && profile.email === identity.email
    );
    if (matches.length === 1) return matches[0];
  }

  return null;
}

export function resolveCommentProfile(
  author = "",
  identityIndex = new Map(),
  profiles = []
) {
  const key = normalizeAvatarName(author);
  if (!key) return null;

  const stableIdentity = identityIndex.get(key) || null;

  if (stableIdentity?.hasStableIdentity) {
    return matchProfileByStableIdentity(stableIdentity, profiles);
  }

  const exact = profiles.filter(
    (profile) => normalizeAvatarName(profile?.name) === key
  );
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;

  const legacy = profiles.filter(
    (profile) => samePerson(author, profile?.name)
  );

  return legacy.length === 1 ? legacy[0] : null;
}

export default Object.freeze({
  version: INCIDENCIAS_COMMENT_IDENTITY_VERSION,
  requesterIdentity,
  technicianIdentity,
  stableCommentIdentity,
  buildCommentIdentityIndex,
  matchProfileByStableIdentity,
  resolveCommentProfile,
});
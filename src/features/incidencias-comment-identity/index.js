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
  normalizeAvatarUsername,
} from "../avatar-system/identity.js";

export const INCIDENCIAS_COMMENT_IDENTITY_VERSION =
  "incidencias.comment-identity.v2-comment-id-user-authority";

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
  const requesters = [
    detail.requesterSnapshot,
    detail.requester,
    detail.cliente,
    detail.receptor,
    detail.user,
    raw.requesterSnapshot,
    raw.requester,
    raw.cliente,
    raw.receptor,
    raw.user
  ].filter(safeObject);

  // A client record's id belongs to the client, not to its contact user.
  // Requester snapshots may also contain client records. Only the explicit
  // Users projection may supply the short id alias.
  const users = [
    detail.user,
    raw.user,
  ].filter(safeObject);

  return Object.freeze({
    userId: normalizeAvatarUserId(firstText(
      detail.requesterUserId,
      detail.userId,
      detail.usuarioId,
      detail.ownerUserId,
      detail.receptorUserId,
      raw.requesterUserId,
      raw.userId,
      raw.usuarioId,
      raw.ownerUserId,
      raw.receptorUserId,
      ...requesters.flatMap((requester) => [requester.userId, requester.usuarioId]),
      ...users.map((user) => user.id)
    )),
    email: normalizeAvatarEmail(firstText(
      detail.email,
      detail.emailLower,
      detail.userEmail,
      detail.clienteEmail,
      ...requesters.flatMap((requester) => [requester.email, requester.emailLower]),
      raw.email,
      raw.emailLower,
      raw.userEmail
    )),
    username: normalizeAvatarUsername(firstText(
      detail.requesterUsername,
      detail.username,
      detail.usernameLower,
      ...requesters.flatMap((requester) => [requester.username, requester.usernameLower]),
      raw.requesterUsername,
      raw.username,
      raw.usernameLower
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
      assignment.technicianUserId,
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
    username: normalizeAvatarUsername(firstText(
      detail.assignedToUsername,
      detail.technicianUsername,
      detail.tecnicoUsername,
      assignment.assignedToUsername,
      assignment.technicianUsername,
      assignment.username,
      technician.username,
      technician.usernameLower,
      raw.assignedToUsername,
      raw.technicianUsername,
      raw.tecnicoUsername
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
    commentId: persistedCommentId(entry),
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
    username: normalizeAvatarUsername(firstText(
      entry.byUsername,
      entry.authorUsername,
      entry.createdByUsername,
      entry.username,
      byObject.username,
      createdBy.username,
      updatedBy.username
    )),
  });
}

export function persistedCommentId(entry = {}) {
  const source = safeObject(entry) || {};
  // Normalized UI records may keep a synthetic id for ordering/signatures.
  // Its explicitly empty persisted alias must survive further projections.
  return Object.hasOwn(source, "persistedCommentId")
    ? firstText(source.persistedCommentId)
    : firstText(source.id, source.commentId, source.eventId);
}

function commentIdentityKey(commentId = "") {
  const id = firstText(commentId);
  return id ? `comment:${id}` : "";
}

export function buildCommentIdentityIndex(detail = {}) {
  const aggregate = new Map();

  for (const entry of commentEntries(detail)) {
    const identity = stableCommentIdentity(entry);
    // Keep record-specific aliases in this same detail-scoped index. Names
    // remain a compatibility lookup for older markup without a comment id.
    for (const key of [commentIdentityKey(identity.commentId), normalizeAvatarName(identity.name)].filter(Boolean)) {
      const bucket = aggregate.get(key) || {
        userIds: new Set(),
        emails: new Set(),
        usernames: new Set(),
        everyEntryHasUserId: true,
        isCommentRecord: key === commentIdentityKey(identity.commentId),
      };

      if (identity.userId) bucket.userIds.add(identity.userId);
      if (identity.email) bucket.emails.add(identity.email);
      if (identity.username) bucket.usernames.add(identity.username);
      bucket.everyEntryHasUserId &&= Boolean(identity.userId);
      aggregate.set(key, bucket);
    }
  }

  const index = new Map();

  for (const [key, bucket] of aggregate) {
    const userIds = [...bucket.userIds];
    const emails = [...bucket.emails];
    const usernames = [...bucket.usernames];
    const mixedNameIdentity = !bucket.isCommentRecord && userIds.length > 0 && !bucket.everyEntryHasUserId;
    const provenUser = userIds.length === 1 && (bucket.isCommentRecord || bucket.everyEntryHasUserId);

    index.set(key, Object.freeze({
      userId: userIds.length === 1 ? userIds[0] : "",
      email: emails.length === 1 ? emails[0] : "",
      username: usernames.length === 1 ? usernames[0] : "",
      // A shared name/email never proves the missing UID of a legacy entry.
      // A persisted comment id can link versions of that same event.
      ambiguous: userIds.length > 1 || mixedNameIdentity || (
        !provenUser && (
          emails.length > 1 || (emails.length === 0 && usernames.length > 1)
        )
      ),
      hasStableIdentity: userIds.length > 0 || emails.length > 0 || usernames.length > 0,
    }));
  }

  return index;
}

export function resolveCommentIdentity(
  author = "",
  identityIndex = new Map(),
  commentId = ""
) {
  return identityIndex.get(commentIdentityKey(commentId)) ||
    identityIndex.get(normalizeAvatarName(author)) ||
    null;
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
      (profile) => profile?.email && profile.email === identity.email &&
        !(identity.userId && profile.userId && identity.userId !== profile.userId)
    );
    if (matches.length === 1) return matches[0];
  }

  if (identity.username) {
    const matches = profiles.filter(
      (profile) => profile?.username && profile.username === identity.username &&
        !(identity.userId && profile.userId && identity.userId !== profile.userId) &&
        !(identity.email && profile.email && identity.email !== profile.email)
    );
    if (matches.length === 1) return matches[0];
  }

  return null;
}

export function resolveCommentProfile(
  author = "",
  identityIndex = new Map(),
  profiles = [],
  commentId = ""
) {
  const key = normalizeAvatarName(author);
  if (!key) return null;

  const stableIdentity = resolveCommentIdentity(author, identityIndex, commentId);

  if (stableIdentity?.ambiguous) return null;

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

export function commentAvatarIdentity(author = "", identity = null, profile = null) {
  const stable = identity && !identity.ambiguous ? identity : {};
  const linkedProfile = stable.userId && profile?.userId === stable.userId ? profile : null;
  return Object.freeze({
    name: firstText(author, profile?.name),
    userId: normalizeAvatarUserId(stable.userId || ""),
    // Only an explicit shared user id proves a current profile belongs to
    // this author. A legacy photo match cannot promote email/name to a UID.
    email: normalizeAvatarEmail(linkedProfile ? linkedProfile.email || "" : stable.email || ""),
    username: normalizeAvatarUsername(linkedProfile ? linkedProfile.username || "" : stable.username || ""),
  });
}

export default Object.freeze({
  version: INCIDENCIAS_COMMENT_IDENTITY_VERSION,
  requesterIdentity,
  technicianIdentity,
  stableCommentIdentity,
  persistedCommentId,
  buildCommentIdentityIndex,
  resolveCommentIdentity,
  matchProfileByStableIdentity,
  resolveCommentProfile,
  commentAvatarIdentity,
});

import {
  normalizeIncidenciaCategory,
  normalizeIncidenciaPriority,
  normalizeIncidenciaStatus,
} from "./incidencias.options.js";

/* ONE authority for "does this edit have anything to save, and may it be saved".
 *
 * The detail modal edits several things at once -- classification (estado, prioridad,
 * tipo), a new comment and new attachments -- and before this module each of them
 * answered "is there anything pending?" on its own, inline, at the call site. Three
 * answers cannot be kept in agreement, and the button could not be disabled honestly
 * because nothing could say what "pending" meant for the edit as a whole.
 *
 *   hasChanges  = editable fields differ OR the comment is a real comment
 *                 OR attachments are staged
 *   canUpdate   = hasChanges AND the draft is valid AND the actor may write
 *                 AND nothing is in flight
 *
 * The comparison is against the last SERVER-CONFIRMED classification, normalized through
 * the same authority the editor and the writer use, so returning a field to its original
 * value is not a change. Nothing volatile is compared: no fetch timestamps, no loading
 * flags, no object identity, no temporary URLs -- only the three values the user can edit.
 *
 * Pure: no DOM, no I/O, no clock. The caller supplies the state; this decides.
 */

/* A comment made only of whitespace is not an update. Line endings are normalized first so
 * a draft that differs only by CRLF/LF never counts as content. */
function commentText(value = "") {
  return String(value ?? "")
    .replace(/\r\n?/gu, "\n")
    .trim();
}

function stagedCount(files = []) {
  return Array.isArray(files) ? files.length : 0;
}

/* Normalized through the field authority, so "Abierta", "abierta" and "open" are the same
 * value and cannot fake a pending change. */
function normalizeDetailClassification(values = null) {
  if (!values || typeof values !== "object") return null;

  const status = normalizeIncidenciaStatus(values.status, "");
  const priority = normalizeIncidenciaPriority(values.priority, "");
  const category = normalizeIncidenciaCategory(values.category, "");

  return status && priority && category
    ? Object.freeze({ status, priority, category })
    : null;
}

/* `desired` absent means the editor is not present or not readable for this actor, which is
 * "no field change", never "everything changed". */
function detailClassificationChanged(current = null, desired = null) {
  const from = normalizeDetailClassification(current);
  const to = normalizeDetailClassification(desired);

  if (!from || !to) return false;

  return (
    from.status !== to.status ||
    from.priority !== to.priority ||
    from.category !== to.category
  );
}

export function resolveDetailPending({
  current = null,
  desired = null,
  comment = "",
  pendingFiles = [],
} = {}) {
  const fields = detailClassificationChanged(current, desired);
  const hasComment = commentText(comment).length > 0;
  const attachments = stagedCount(pendingFiles) > 0;

  const parts = [];
  if (fields) parts.push("fields");
  if (hasComment) parts.push("comment");
  if (attachments) parts.push("attachments");

  return Object.freeze({
    fields,
    comment: hasComment,
    attachments,
    parts: Object.freeze(parts),
    hasChanges: parts.length > 0,
  });
}

/* The disabled attribute is a courtesy, not a guarantee: the submit handler calls this too,
 * so a click that reaches it with nothing pending still does nothing and writes nothing. */
export function canUpdateDetail({
  pending = null,
  valid = true,
  permitted = true,
  submitting = false,
} = {}) {
  if (!pending || pending.hasChanges !== true) return false;
  if (valid === false) return false;
  if (permitted === false) return false;
  if (submitting === true) return false;
  return true;
}

/* The authority that decides what is pending also names it, so the footer rendered by the
   template and the footer synchronized while typing can never word the same state
   differently. */
const PART_LABELS = Object.freeze({
  fields: "estado, prioridad y tipo",
  comment: "la actualización escrita",
  attachments: "los adjuntos añadidos",
});

export function describePendingParts(parts = []) {
  const named = (Array.isArray(parts) ? parts : [])
    .map((part) => PART_LABELS[part])
    .filter(Boolean);

  return named.length > 1
    ? `${named.slice(0, -1).join(", ")} y ${named.at(-1)}`
    : named.join("");
}

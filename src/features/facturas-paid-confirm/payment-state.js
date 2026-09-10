"use strict";

/** Payment is a ledger fact. Document verification and provider acceptance are separate. */
export function getFinalization(factura = {}, now = Date.now()) {
  const raw = factura.payment?.finalization || factura.paymentFinalization || factura.finalization || {};
  const key = value => String(value || "").trim().toLowerCase();
  const status = key(raw.status), documentStatus = key(raw.document?.status), deliveryStatus = key(raw.delivery?.status);
  const heartbeat = Date.parse(raw.heartbeatAt || raw.startedAt || "");
  const remainingMs = Number.isFinite(heartbeat) ? Math.max(0, 300000 - (now - heartbeat)) : 0;
  return {raw,status,documentStatus,deliveryStatus,
    known: ["pending", "processing", "partial", "failed", "completed"].includes(status),
    completed: raw.schemaVersion === 2 && status === "completed" && documentStatus === "ready" && deliveryStatus === "sent",
    processing: status === "processing" && remainingMs > 0,
    remainingMs, documentReady: documentStatus === "ready", emailSent: deliveryStatus === "sent",
    emailSkipped: deliveryStatus === "skipped", blocked: deliveryStatus === "blocked",
    uncertain: deliveryStatus === "uncertain" || (Array.isArray(raw.delivery?.results) ? raw.delivery.results : []).some(r => ["sending", "uncertain"].includes(r.status)),
  };
}

/** A follow-up GET can reach another replica or an older server. Never discard
 * a committed command result for a missing or older finalization projection. */
export function reconcilePaymentResult(command, refreshed) {
  const unwrap = value => value?.factura || value?.item || value;
  const first = unwrap(command), second = unwrap(refreshed);
  if (!first) return second || null;
  const identity = value => String(value?.id || value?.facturaId || value?.invoiceId || "");
  if (!second || identity(first) !== identity(second)) return first;
  const a = getFinalization(first), b = getFinalization(second);
  if (a.known && !b.known) return first;
  const stamp = fin => Math.max(0, ...[fin.raw.heartbeatAt, fin.raw.completedAt, fin.raw.startedAt, fin.raw.document?.verifiedAt]
    .map(value => Date.parse(value || "")).filter(Number.isFinite));
  if (a.known && b.known && stamp(a) > stamp(b)) return first;
  if (a.completed && !b.completed && stamp(b) <= stamp(a)) return first;
  return second;
}

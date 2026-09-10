"use strict";

/** Payment is a ledger fact. Document verification and provider acceptance are separate. */
export function getFinalization(factura = {}, now = Date.now()) {
  const raw = factura.payment?.finalization || factura.paymentFinalization || factura.finalization || {};
  const key = value => String(value || "").trim().toLowerCase();
  const status = key(raw.status), documentStatus = key(raw.document?.status), deliveryStatus = key(raw.delivery?.status);
  const heartbeat = Date.parse(raw.heartbeatAt || raw.startedAt || "");
  const remainingMs = Number.isFinite(heartbeat) ? Math.max(0, 300000 - (now - heartbeat)) : 0;
  return {raw,status,documentStatus,deliveryStatus,
    completed: raw.schemaVersion === 2 && status === "completed" && documentStatus === "ready" && deliveryStatus === "sent",
    processing: status === "processing" && remainingMs > 0,
    remainingMs, documentReady: documentStatus === "ready", emailSent: deliveryStatus === "sent",
    emailSkipped: deliveryStatus === "skipped", blocked: deliveryStatus === "blocked",
    uncertain: deliveryStatus === "uncertain" || (Array.isArray(raw.delivery?.results) ? raw.delivery.results : []).some(r => ["sending", "uncertain"].includes(r.status)),
  };
}

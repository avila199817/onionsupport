"use strict";
import Http from "../../core/http.js";

const pathFor = id => {
  if (typeof id !== "string" || !id.trim() || id.length > 160) throw new Error("FACTURA_ID_REQUIRED");
  return `/api/facturas/${encodeURIComponent(id.trim())}/valoraciones`;
};
function checked(payload) {
  if (payload?.ok !== true || !payload.summary || typeof payload.facturaId !== "string") {
    throw new Error("No se ha podido confirmar el estado de las valoraciones.");
  }
  return payload;
}
export async function getFacturaReviews(id, { signal } = {}) {
  return checked(await Http.get(pathFor(id), { signal, timeout: 15000, cache: false, source: "views.facturas.reviews.read" }));
}
export async function requestFacturaReviews(id, { signal } = {}) {
  return checked(await Http.post(`${pathFor(id)}/solicitar`, {}, { signal, timeout: 15000, source: "views.facturas.reviews.request" }));
}

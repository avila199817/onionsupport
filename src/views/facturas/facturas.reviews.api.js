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

/* =========================================================
   RESUMEN POR TÉCNICO · se LEE, no se calcula aquí

   La media vive en el backend, sobre la atribución que `bindService` congeló en
   el vínculo. Este módulo no suma nada, no mira las facturas que la vista tenga
   cargadas y no acepta una identidad distinta de la que ha preguntado: si la
   respuesta habla de otro técnico, no es esta respuesta.
========================================================= */
const technicianPathFor = id => {
  if (typeof id !== "string" || !id.trim() || id.length > 160) throw new Error("TECHNICIAN_ID_REQUIRED");
  return `/api/facturas/tecnicos/${encodeURIComponent(id.trim())}/valoraciones`;
};
function checkedTechnician(payload, asked) {
  const count = payload?.count;
  const average = payload?.average ?? null;
  const max = payload?.max;
  const coherente =
    payload?.ok === true &&
    typeof payload.technicianId === "string" &&
    payload.technicianId === asked &&
    Number.isInteger(count) && count >= 0 &&
    /* La escala se acota: el modal dibuja una estrella por unidad. */
    Number.isInteger(max) && max >= 1 && max <= 10 &&
    /* Sin valoraciones no hay nota. Con valoraciones, la nota es un número
       dentro de la escala: un cero o un fuera de escala no son un promedio. */
    (count === 0
      ? average === null
      : Number.isFinite(average) && average > 0 && average <= max);
  if (!coherente) throw new Error("No se ha podido confirmar el resumen de valoraciones del técnico.");
  return Object.freeze({ technicianId: asked, count, average, max, scope: typeof payload.scope === "string" ? payload.scope : "" });
}
export async function getTechnicianReviewSummary(technicianId, { signal } = {}) {
  const path = technicianPathFor(technicianId);
  return checkedTechnician(await Http.get(path, { signal, timeout: 15000, cache: false, source: "views.facturas.reviews.technician" }), technicianId.trim());
}

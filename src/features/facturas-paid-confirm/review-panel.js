"use strict";
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const states = {
  not_requested: "Todavía no se ha solicitado la valoración.",
  pending: "Solicitud registrada; se enviará después de verificar la factura y su correo.",
  preparing: "Preparando la solicitud y su vinculación con el técnico.",
  sending: "Envío en curso; pendiente de confirmación del proveedor.",
  sent: "El proveedor ha aceptado el correo de valoraciones.",
  uncertain: "Resultado del envío pendiente de confirmación. No se reenviará a ciegas.",
  failed: "El proveedor ha confirmado un fallo; el sistema gestiona el siguiente intento.",
  blocked: "La solicitud necesita revisión antes de enviarse.",
  needs_review: "Revisión administrativa necesaria; el envío automático se ha detenido.",
  opted_out: "El cliente ha pedido no recibir solicitudes de valoración.",
  revoked: "La solicitud ya no está disponible porque el estado del servicio o pago ha cambiado.",
  expired: "La invitación ha caducado. No se envían recordatorios automáticos.",
};
const reasons = {
  REVIEW_TECHNICIAN_BINDING_REQUIRED: "Comprueba la asignación y el nombre del técnico en la incidencia.",
  REVIEW_SERVICE_BINDING_REQUIRED: "Comprueba las incidencias vinculadas a la factura.",
  REVIEW_CLIENT_BINDING_CONFLICT: "La incidencia y la factura no tienen una vinculación de cliente coherente.",
  REVIEW_RECIPIENT_MISSING: "Falta un correo válido de cliente.",
  REVIEW_CONFIGURATION_MISSING: "La configuración de invitaciones no está disponible.",
  REVIEW_ATTEMPTS_EXHAUSTED: "Se ha alcanzado el límite de intentos.",
};
/** Separate from payment finalization: review errors never change the paid result. */
export function renderReviewPanel({ data = null, loading = false, error = "", canRequest = false } = {}) {
  const summary = data?.summary;
  const status = summary?.status;
  const responses = Array.isArray(data?.services) ? data.services.filter(s => s?.response) : [];
  return `<section class="fpc-review-panel" aria-label="Valoraciones de este servicio" data-review-panel>
    <div class="fpc-note"><span aria-hidden="true">★</span><div>
      <strong>Valoraciones · Google y atención del técnico</strong>
      <p role="status">${esc(loading ? "Consultando valoraciones…" : states[status] || "Estado de valoraciones no disponible.")}</p>
      ${reasons[summary?.reason] ? `<p>${esc(reasons[summary.reason])}</p>` : ""}
      <small>La reseña en Google es pública; las respuestas sobre el técnico son privadas. Este apartado no registra pagos ni reenvía la factura.</small>
      ${error ? `<p role="alert">${esc(error)}</p>` : ""}
    </div></div>
    ${responses.map(s => `<div class="fpc-summary"><div class="fpc-summary-item fpc-summary-item--wide">
      <span>${esc(s.context?.serviceReference || s.serviceId)} · ${esc(s.context?.technicianDisplayName || "Técnico")}</span>
      <strong>${esc(s.response.ratings?.overall)} / 5 · Valoración privada</strong>
      ${s.response.comment ? `<p>${esc(s.response.comment)}</p>` : ""}
      ${s.response.requestContact ? "<strong>El cliente solicita contacto.</strong>" : ""}
    </div></div>`).join("")}
    <div class="fpc-actions">
      ${canRequest && status === "not_requested" ? `<button type="button" class="fpc-btn fpc-btn--secondary" data-fpc-action="request-reviews" ${loading ? "disabled" : ""}>Enviar solicitud de valoración</button>` : ""}
      <button type="button" class="fpc-btn fpc-btn--secondary" data-fpc-action="refresh-reviews" ${loading ? "disabled" : ""}>Actualizar valoraciones</button>
    </div>
  </section>`;
}

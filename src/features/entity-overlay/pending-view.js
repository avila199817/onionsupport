import { cleanText, escapeHtml } from "../../core/presentation-text.js";
export { cleanText };

/* The shared surface owns imports and loading failures only. Entity data
   and commands always render through the canonical domain controller. */
export function safeError(error) {
  return cleanText(error?.message || error?.data?.message || error?.code, "No se pudo cargar el detalle.")
    .replace(/([?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token|sas)=)([^&#\s]+)/gi, "$1***")
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***").slice(0, 500);
}

export function renderDetailPending({ type, id, error = "" }) {
  const title = error ? `No se pudo abrir ${type}` : "Cargando detalle…";
  return `<div class="entity-overlay-backdrop" data-entity-overlay-backdrop="true">
    <section class="${error ? "entity-overlay-generic-panel" : "entity-overlay-loading-panel"}"
      data-entity-overlay-panel="true" role="dialog" aria-modal="true"
      aria-label="${escapeHtml(title)}" tabindex="-1">
      ${error ? `<header class="entity-overlay-generic-header"><h2>${escapeHtml(title)}</h2>
        <button type="button" class="entity-overlay-close" data-entity-overlay-action="close" aria-label="Cerrar detalle">×</button></header>`
        : '<span class="entity-overlay-spinner" aria-hidden="true"></span><strong>Cargando detalle…</strong>'}
      <div class="entity-overlay-generic-body">
        ${error ? `<p class="entity-overlay-error" role="alert">${escapeHtml(error)}</p>` : `<span>${escapeHtml(id)}</span>`}
        <button type="button" class="entity-overlay-action-button" data-entity-overlay-action="${error ? "retry" : "close"}">${error ? "Reintentar" : "Cancelar"}</button>
      </div>
    </section>
  </div>`;
}

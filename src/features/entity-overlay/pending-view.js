import { cleanText } from "../../core/presentation-text.js";
import { escapeHtml } from "../../core/escape-html.js";
import { renderModalCloseButton, renderModalShell, renderModalState } from "./modal-host.js";
export { cleanText };

/* The shared surface owns imports and loading failures only. Entity data
   and commands always render through the canonical domain controller. */
/* Pending and failed detail sessions render through the same shell as every
   domain dialog; only the body state and the dispatcher actions are specific. */
export function renderDetailPending({ type, id, error = "" }) {
  const title = error ? `No se pudo abrir ${type}` : "Cargando detalle…";
  return renderModalShell({
    rootAttributes: { "data-entity-overlay-pending": error ? "error" : "loading" },
    overlayAttributes: { "data-entity-overlay-backdrop": "true" },
    panelAttributes: { "data-entity-overlay-panel": "true" },
    label: title,
    size: "compact",
    height: "auto",
    header: `<h2 class="ui-detail-modal-title" id="entity-overlay-pending-title">${escapeHtml(title)}</h2>${renderModalCloseButton({
      label: "Cerrar detalle", attributes: { "data-entity-overlay-action": "close" },
    })}`,
    body: renderModalState({
      kind: error ? "error" : "loading",
      title: error ? "No se pudo cargar el detalle" : "Cargando detalle…",
      message: error || id,
      action: { label: error ? "Reintentar" : "Cancelar", attributes: { "data-entity-overlay-action": error ? "retry" : "close" } },
    }),
  });
}

/* Canonical modal shell. One DOM structure for every private dialog:
   root → overlay → panel[role=dialog] → header / body / footer.

   The shell owns structure, ARIA, sizes and the close control. modal-lifecycle
   owns Escape, Tab, backdrop clicks, scroll lock and focus return; modal-host
   owns mounting and patching. Domains provide content, actions, data
   attributes for their identity and nothing structural. */
import { escapeHtml } from "../../core/presentation-text.js";

export const MODAL_SHELL_VERSION = "ui-modal-shell.v1";

export const MODAL_SHELL_SELECTORS = Object.freeze({
  root: "[data-modal-shell]",
  overlay: "[data-modal-overlay='true']",
  panel: "[data-modal-panel='true']",
  header: "[data-modal-header='true']",
  body: "[data-modal-body='true']",
  footer: "[data-modal-footer='true']",
  close: "[data-modal-close='true']",
  state: "[data-modal-state]",
});

/* Panel width tokens resolved by the structural stylesheet. */
export const MODAL_SIZES = Object.freeze(["detail", "wide", "form", "compact", "confirm"]);
/* fixed: the panel keeps its viewport height and the body scrolls.
   auto: the panel grows with its content up to the viewport. */
export const MODAL_HEIGHTS = Object.freeze(["fixed", "auto"]);
export const MODAL_STATES = Object.freeze(["loading", "error", "empty"]);

const CLOSE_ICON =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';

function text(value) {
  return String(value ?? "").trim();
}

function classList(...values) {
  return values.flat().map(text).filter(Boolean).join(" ");
}

function attributes(values = {}) {
  return Object.entries(values || {})
    .filter(([name, value]) => /^[a-zA-Z][\w:-]*$/u.test(name) && value !== undefined && value !== null && value !== false)
    .map(([name, value]) => (value === true ? ` ${name}` : ` ${name}="${escapeHtml(String(value))}"`))
    .join("");
}

function oneOf(value, allowed, fallback) {
  const candidate = text(value);
  return allowed.includes(candidate) ? candidate : fallback;
}

/* The only close control of the system. Domains pass their action attributes
   so their existing delegation keeps working; the shell decides the markup. */
export function renderModalCloseButton({ label = "Cerrar", className = "", attributes: extra = {} } = {}) {
  return `<button type="button" class="${classList("ui-detail-modal-close-btn", className)}" data-modal-close="true" aria-label="${escapeHtml(label)}"${attributes(extra)}>${CLOSE_ICON}</button>`;
}

/* Loading, error and empty surfaces shared by every dialog body. */
export function renderModalState({ kind = "loading", title = "", message = "", id = "", action = null } = {}) {
  const state = oneOf(kind, MODAL_STATES, "loading");
  const heading = text(title) || (state === "loading" ? "Cargando…" : state === "error" ? "No se pudo cargar" : "Sin contenido");
  const role = state === "error" ? "alert" : "status";
  const button = action && text(action.label)
    ? `<button type="button" class="${classList("ui-detail-modal-view-btn", action.className)}"${attributes(action.attributes)}>${escapeHtml(action.label)}</button>`
    : "";
  return `<div class="ui-detail-modal-state ui-detail-modal-state--${state}" data-modal-state="${state}"${id ? ` id="${escapeHtml(id)}"` : ""} role="${role}" aria-live="${state === "error" ? "assertive" : "polite"}"${state === "loading" ? ' aria-busy="true"' : ""}>
    ${state === "loading" ? '<span class="ui-detail-modal-spinner" aria-hidden="true"></span>' : ""}
    <strong class="ui-detail-modal-state-title">${escapeHtml(heading)}</strong>
    ${text(message) ? `<p class="ui-detail-modal-state-message">${escapeHtml(message)}</p>` : ""}
    ${button}
  </div>`;
}

/*
  renderModalShell(options) → HTML

  id / rootClass / rootAttributes      identity of the dialog root (data-* for the owner)
  overlayClass / overlayAttributes     owner markers on the backdrop layer
  panelId / panelClass / panelAttributes
  labelledBy | label                   ARIA name; describedBy optional
  size, height                         explicit structural variants
  submitting                           adds is-submitting to the panel
  prelude                              markup layered over the panel (confirmations, busy veils)
  header, body, footer                 content slots (strings); footer optional
  headerClass / bodyClass / footerClass / bodyAttributes
*/
export function renderModalShell({
  id = "", rootClass = "", rootAttributes = {},
  overlayClass = "", overlayAttributes = {},
  panelId = "", panelClass = "", panelAttributes = {},
  labelledBy = "", label = "", describedBy = "",
  size = "detail", height = "fixed", submitting = false,
  prelude = "", header = "", body = "", footer = "",
  headerClass = "", bodyClass = "", footerClass = "", bodyAttributes = {},
} = {}) {
  const ariaName = text(labelledBy)
    ? ` aria-labelledby="${escapeHtml(labelledBy)}"`
    : text(label) ? ` aria-label="${escapeHtml(label)}"` : "";
  return `<section${id ? ` id="${escapeHtml(id)}"` : ""} class="${classList("ui-detail-modal-root", rootClass)}" data-modal-shell="${MODAL_SHELL_VERSION}" data-modal-size="${oneOf(size, MODAL_SIZES, "detail")}" data-modal-height="${oneOf(height, MODAL_HEIGHTS, "fixed")}" data-open="true"${attributes(rootAttributes)}>
  <div class="${classList("ui-detail-modal-overlay", overlayClass)}" data-modal-overlay="true"${attributes(overlayAttributes)}>
    <div${panelId ? ` id="${escapeHtml(panelId)}"` : ""} class="${classList("ui-detail-modal-panel", panelClass, submitting ? "is-submitting" : "")}" role="dialog" aria-modal="true"${ariaName}${text(describedBy) ? ` aria-describedby="${escapeHtml(describedBy)}"` : ""} tabindex="-1" data-modal-panel="true"${attributes(panelAttributes)}>
      ${prelude || ""}
      <header class="${classList("ui-detail-modal-header", headerClass)}" data-modal-header="true">${header || ""}</header>
      <main class="${classList("ui-detail-modal-body", bodyClass)}" data-modal-body="true"${attributes(bodyAttributes)}>${body || ""}</main>
      ${footer ? `<footer class="${classList("ui-detail-modal-footer", footerClass)}" data-modal-footer="true">${footer}</footer>` : ""}
    </div>
  </div>
</section>`;
}

export default Object.freeze({
  version: MODAL_SHELL_VERSION,
  selectors: MODAL_SHELL_SELECTORS,
  sizes: MODAL_SIZES,
  heights: MODAL_HEIGHTS,
  states: MODAL_STATES,
  renderModalShell,
  renderModalCloseButton,
  renderModalState,
});

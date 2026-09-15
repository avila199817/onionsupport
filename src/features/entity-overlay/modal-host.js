/* Private dialog DOM: the canonical shell and its host.

   Shell: one DOM structure for every private dialog
   (root → overlay → panel[role=dialog|alertdialog] → header / body / footer), its ARIA,
   sizes, the close control and the loading/error/empty states. Domains
   provide content, actions and data attributes for their identity, nothing
   structural. Host: mounting, leasing and patching of that panel.

   EntityOverlay retains entity sessions and modal-lifecycle retains the only
   keyboard, backdrop, focus-return and scroll registry. Keeping every DOM
   rendering here keeps it out of the public consent dialogs' closure and in
   one shared chunk for all private dialogs. */
import { escapeHtml } from "../../core/escape-html.js";
import { restoreModalFocus } from "./modal-lifecycle.js";

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
export const MODAL_SIZES = Object.freeze(["detail", "wide", "form", "compact", "confirm", "stage"]);
/* fixed: the panel keeps its viewport height and the body scrolls.
   auto: the panel grows with its content up to the viewport. */
export const MODAL_HEIGHTS = Object.freeze(["fixed", "auto"]);
export const MODAL_STATES = Object.freeze(["loading", "error", "empty"]);
/* dialog by default; alertdialog for confirmations that interrupt a task. */
export const MODAL_ROLES = Object.freeze(["dialog", "alertdialog"]);

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
  role                                 dialog (default) | alertdialog
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
  labelledBy = "", label = "", describedBy = "", role = "dialog",
  size = "detail", height = "fixed", submitting = false,
  prelude = "", header = "", body = "", footer = "",
  headerClass = "", bodyClass = "", footerClass = "", bodyAttributes = {},
} = {}) {
  const ariaName = text(labelledBy)
    ? ` aria-labelledby="${escapeHtml(labelledBy)}"`
    : text(label) ? ` aria-label="${escapeHtml(label)}"` : "";
  return `<section${id ? ` id="${escapeHtml(id)}"` : ""} class="${classList("ui-detail-modal-root", rootClass)}" data-modal-shell="${MODAL_SHELL_VERSION}" data-modal-size="${oneOf(size, MODAL_SIZES, "detail")}" data-modal-height="${oneOf(height, MODAL_HEIGHTS, "fixed")}" data-open="true"${attributes(rootAttributes)}>
  <div class="${classList("ui-detail-modal-overlay", overlayClass)}" data-modal-overlay="true"${attributes(overlayAttributes)}>
    <div${panelId ? ` id="${escapeHtml(panelId)}"` : ""} class="${classList("ui-detail-modal-panel", panelClass, submitting ? "is-submitting" : "")}" role="${oneOf(role, MODAL_ROLES, "dialog")}" aria-modal="true"${ariaName}${text(describedBy) ? ` aria-describedby="${escapeHtml(describedBy)}"` : ""} tabindex="-1" data-modal-panel="true"${attributes(panelAttributes)}>
      ${prelude || ""}
      <header class="${classList("ui-detail-modal-header", headerClass)}" data-modal-header="true">${header || ""}</header>
      <main class="${classList("ui-detail-modal-body", bodyClass)}" data-modal-body="true"${attributes(bodyAttributes)}>${body || ""}</main>
      ${footer ? `<footer class="${classList("ui-detail-modal-footer", footerClass)}" data-modal-footer="true">${footer}</footer>` : ""}
    </div>
  </div>
</section>`;
}

export function createModalHost({
  id = "", selector = "", attributes = {},
  ownerDocument = () => globalThis.document,
  parent = (document) => document.body,
  owns = () => true, onMount, onRemove,
} = {}) {
  let host = null;

  function remove() {
    const current = host;
    if (!current || !owns(current)) return false;
    host = null;
    try { onRemove?.(current); }
    finally { current.replaceChildren(); current.remove(); }
    return true;
  }

  return Object.freeze({
    get: () => host,
    ensure() {
      if (host?.isConnected) return owns(host) ? host : null;
      if (host) remove();
      const document = typeof ownerDocument === "function" ? ownerDocument() : ownerDocument;
      const container = document && parent(document);
      if (!container?.isConnected) return null;
      // A later controller never adopts, clears or removes another owner's
      // portal. Its lease is the exact node created by this handle.
      if ((id && document.getElementById(id)) || (selector && document.querySelector(selector))) return null;
      host = document.createElement("div");
      if (id) host.id = id;
      for (const [name, value] of Object.entries(attributes)) host.setAttribute(name, String(value));
      container.appendChild(host);
      try { onMount?.(host); }
      catch (error) { remove(); throw error; }
      return host;
    },
    clear() {
      if (!host || !owns(host)) return false;
      host.replaceChildren();
      return true;
    },
    remove,
  });
}

function syncAttributes(current, next) {
  for (const { name } of [...current.attributes]) {
    if (!next.hasAttribute(name)) current.removeAttribute(name);
  }
  for (const { name, value } of [...next.attributes]) current.setAttribute(name, value);
}

function captureFocus(panel, attributes) {
  const active = panel.ownerDocument.activeElement;
  if (!active || !panel.contains(active)) return null;
  const keys = attributes.map((name) => [name, active.getAttribute(name)]).filter(([, value]) => value);
  return {
    panel: active === panel, keys,
    selection: Number.isInteger(active.selectionStart)
      ? [active.selectionStart, active.selectionEnd, active.selectionDirection]
      : null,
  };
}

function restoreFocus(panel, snapshot) {
  if (!snapshot) return;
  let target = snapshot.panel ? panel : null;
  for (const [attribute, value] of snapshot.keys) {
    if (target) break;
    target = [...panel.querySelectorAll(`[${attribute}]`)].find((node) => node.getAttribute(attribute) === value);
  }
  if (!target || target.disabled || target.getAttribute("aria-disabled") === "true") target = panel;
  if (!restoreModalFocus(target)) return;
  if (snapshot.selection && typeof target.setSelectionRange === "function") {
    const [start, end, direction] = snapshot.selection;
    const length = String(target.value || "").length;
    try { target.setSelectionRange(Math.min(start, length), Math.min(end, length), direction); }
    catch { /* Input types without text selection keep their restored focus. */ }
  }
}

// Patch only a matching owner shell. Forms, requests, slots and close guards
// remain domain-owned; replacing an explicit entity starts a fresh panel.
// The defaults are the canonical shell's own markers: a shell consumer passes
// nothing, a historical shell still names its selectors.
export function renderModalContent(host, html, {
  rootSelector = MODAL_SHELL_SELECTORS.root,
  overlaySelector = MODAL_SHELL_SELECTORS.overlay,
  panelSelector = MODAL_SHELL_SELECTORS.panel,
  identityAttribute = "", forceMount = false,
  focusAttributes = ["id", "name", "href"],
  scrollSelector = MODAL_SHELL_SELECTORS.body,
} = {}) {
  if (!host?.ownerDocument) return null;
  const template = host.ownerDocument.createElement("template");
  template.innerHTML = String(html || "").trim();
  const nextRoot = rootSelector && template.content.querySelector(rootSelector);
  const nextPanel = nextRoot?.querySelector(panelSelector);
  const currentRoot = rootSelector && host.querySelector(rootSelector);
  const currentPanel = currentRoot?.querySelector(panelSelector);
  const nextOverlay = overlaySelector && nextRoot?.querySelector(overlaySelector);
  const currentOverlay = overlaySelector && currentRoot?.querySelector(overlaySelector);
  const currentId = identityAttribute && currentRoot?.getAttribute(identityAttribute);
  const nextId = identityAttribute && nextRoot?.getAttribute(identityAttribute);
  const patch = !forceMount && currentRoot && currentPanel && nextRoot && nextPanel &&
    (!overlaySelector || (currentOverlay && nextOverlay)) &&
    !(currentId && nextId && currentId !== nextId);

  if (patch) {
    const focus = captureFocus(currentPanel, focusAttributes);
    const body = scrollSelector && currentPanel.querySelector(scrollSelector);
    const scroll = body && { top: body.scrollTop, left: body.scrollLeft };
    syncAttributes(currentRoot, nextRoot);
    if (currentOverlay) syncAttributes(currentOverlay, nextOverlay);
    syncAttributes(currentPanel, nextPanel);
    currentPanel.replaceChildren(...nextPanel.childNodes);
    const nextBody = scrollSelector && currentPanel.querySelector(scrollSelector);
    if (scroll && nextBody) { nextBody.scrollTop = scroll.top; nextBody.scrollLeft = scroll.left; }
    restoreFocus(currentPanel, focus);
    return { host, root: currentRoot, panel: currentPanel, patched: true };
  }
  host.replaceChildren(template.content);
  return { host, root: nextRoot || null, panel: nextPanel || null, patched: false };
}

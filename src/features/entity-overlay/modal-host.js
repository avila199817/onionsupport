/* Private dialog DOM plumbing. EntityOverlay retains entity sessions and
   modal-lifecycle retains the only keyboard, focus-return and scroll registry.
   Keeping DOM rendering here avoids loading it with public consent dialogs. */
import { restoreModalFocus } from "./modal-lifecycle.js";

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
export function renderModalContent(host, html, {
  rootSelector, overlaySelector, panelSelector,
  identityAttribute = "", forceMount = false,
  focusAttributes = ["id", "name", "href"],
  scrollSelector = ".ui-detail-modal-body",
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

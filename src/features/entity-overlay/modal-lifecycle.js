/* Shared interaction authority for entity overlays and domain dialogs.
   Rendering, requests, confirmation policy and routing remain with the owner. */

export const MODAL_FOCUSABLE_SELECTOR = [
  'a[href]', 'area[href]', 'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])', 'textarea:not([disabled])',
  'iframe', 'summary', 'audio[controls]', 'video[controls]', '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const documents = new WeakMap();

export function modalFocusableElements(panel) {
  if (!panel) return [];
  return [...panel.querySelectorAll(MODAL_FOCUSABLE_SELECTOR)].filter((node) =>
    !node.disabled && node.tabIndex >= 0 &&
    !node.closest('[hidden], [inert], [aria-hidden="true"], [aria-disabled="true"]') &&
    node.getClientRects().length > 0 &&
    panel.ownerDocument.defaultView.getComputedStyle(node).visibility !== 'hidden'
  );
}

export function focusModalElement(target) {
  if (!target?.isConnected || typeof target.focus !== 'function') return false;
  try { target.focus({ preventScroll: true }); return true; }
  catch { return false; }
}

export function restoreModalFocus(target) {
  const document = target?.ownerDocument || globalThis.document;
  const manager = document && documents.get(document);
  const panel = manager && panelOf(manager.entries.at(-1) || {});
  // Delayed owner callbacks must never pull focus out of a newer dialog.
  if (panel && !panel.contains(target)) return false;
  return focusModalElement(target);
}

function panelOf(entry) {
  try { return entry.getPanel?.() || null; } catch { return null; }
}

function claimClasses(manager, entry, classes) {
  const next = new Set(['modal-open', ...classes].filter(Boolean));
  for (const name of entry.classes) {
    if (next.has(name)) continue;
    const claim = manager.classes.get(name);
    claim.owners.delete(entry);
    if (!claim.owners.size) {
      manager.document.body.classList.toggle(name, claim.existed);
      manager.classes.delete(name);
    }
  }
  for (const name of next) {
    let claim = manager.classes.get(name);
    if (!claim) {
      claim = { existed: manager.document.body.classList.contains(name), owners: new Set() };
      manager.classes.set(name, claim);
    }
    claim.owners.add(entry);
    manager.document.body.classList.add(name);
  }
  entry.classes = next;
}

function release(manager, entry, restoreFocus) {
  const index = manager.entries.indexOf(entry);
  if (index < 0) return false;
  const wasTop = index === manager.entries.length - 1;
  manager.entries.splice(index, 1);
  entry.manager = null;
  for (const name of entry.classes) {
    const claim = manager.classes.get(name);
    claim.owners.delete(entry);
    if (!claim.owners.size) {
      manager.document.body.classList.toggle(name, claim.existed);
      manager.classes.delete(name);
    }
  }
  entry.classes.clear();
  if (!manager.entries.length) {
    manager.document.removeEventListener('keydown', manager.keydown);
    manager.observer?.disconnect();
    for (const [property, snapshot] of manager.styles) {
      if (snapshot.value) manager.document.body.style.setProperty(property, snapshot.value, snapshot.priority);
      else manager.document.body.style.removeProperty(property);
    }
    manager.styles.clear();
  }
  const opener = entry.opener;
  entry.opener = null;
  if (restoreFocus && wasTop) {
    const parentPanel = panelOf(manager.entries.at(-1) || {});
    if (!parentPanel || parentPanel.contains(opener)) focusModalElement(opener);
    else focusModalElement(modalFocusableElements(parentPanel)[0] || parentPanel);
  }
  return true;
}

function prune(manager) {
  // A detached domain view must not keep the whole site locked. Resolve the
  // current panel lazily so an owner's synchronous rerender remains valid.
  for (const entry of [...manager.entries]) {
    if (panelOf(entry)?.isConnected) continue;
    release(manager, entry, false);
    try { entry.onDetached?.(); } catch { /* Isolate a detached owner. */ }
  }
}

function keydown(manager, event) {
  if (event.defaultPrevented || event.isComposing || !['Escape', 'Tab'].includes(event.key)) return;
  prune(manager);
  const entry = manager.entries.at(-1);
  const panel = entry && panelOf(entry);
  if (!panel) return;
  if (event.key === 'Escape') {
    // Consume once even if the owner refuses closing while a request runs.
    event.preventDefault();
    event.stopImmediatePropagation();
    entry.onEscape?.(event);
    return;
  }
  const nodes = modalFocusableElements(panel);
  const active = manager.document.activeElement;
  const outside = !panel.contains(active) || active === panel;
  const target = !nodes.length ? panel
    : outside ? (event.shiftKey ? nodes.at(-1) : nodes[0])
    : event.shiftKey && active === nodes[0] ? nodes.at(-1)
    : !event.shiftKey && active === nodes.at(-1) ? nodes[0]
    : null;
  if (target) {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (target === panel && !panel.hasAttribute('tabindex')) panel.tabIndex = -1;
    focusModalElement(target);
  }
}

function managerFor(document) {
  let manager = documents.get(document);
  if (manager) return manager;
  manager = { document, entries: [], classes: new Map(), styles: new Map(), observer: null, keydown: null };
  manager.keydown = (event) => keydown(manager, event);
  const Observer = document.defaultView?.MutationObserver;
  if (Observer) manager.observer = new Observer(() => prune(manager));
  documents.set(document, manager);
  return manager;
}

export function createModalLifecycle({ getPanel, onEscape, bodyClasses = [], onDetached } = {}) {
  const entry = { getPanel, onEscape, onDetached, manager: null, classes: new Set(), opener: null };
  return Object.freeze({
    activate({ opener, classes = bodyClasses } = {}) {
      const panel = panelOf(entry);
      const document = panel?.ownerDocument;
      if (!panel?.isConnected || !document?.body) return false;
      if (entry.manager) {
        claimClasses(entry.manager, entry, classes);
        return true;
      }
      const manager = managerFor(document);
      if (!manager.entries.length) {
        for (const property of ['overflow', 'overscroll-behavior']) {
          manager.styles.set(property, {
            value: document.body.style.getPropertyValue(property),
            priority: document.body.style.getPropertyPriority(property),
          });
        }
        document.body.style.setProperty('overflow', 'hidden');
        document.body.style.setProperty('overscroll-behavior', 'contain');
        // Bubble allows an owner's combobox to consume Escape first.
        document.addEventListener('keydown', manager.keydown);
        manager.observer?.observe(document.body, { childList: true, subtree: true });
      }
      entry.manager = manager;
      entry.opener = opener === undefined ? document.activeElement : opener;
      manager.entries.push(entry);
      claimClasses(manager, entry, classes);
      return true;
    },
    deactivate({ restoreFocus = true } = {}) {
      return entry.manager ? release(entry.manager, entry, restoreFocus) : false;
    },
    isTop() { return Boolean(entry.manager?.entries.at(-1) === entry); },
    isActive() { return Boolean(entry.manager); },
  });
}

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

/* Attributes the MODAL STACK owns on a panel, not the template that renders it.
 *
 * While a panel is covered by a higher layer -- the attachment viewer over an incidencia,
 * a confirmation over a detail -- the stack marks it inert and aria-hidden so the layer
 * underneath cannot be reached by pointer, keyboard or assistive technology.
 *
 * A template render knows nothing about that: it emits the panel as it would look with no
 * layer above it. So a plain attribute sync, which removes whatever the incoming markup
 * lacks, TEARS THE ISOLATION OFF an owner that is still covered -- and the feature then puts
 * it back a frame later. In between, the covered modal is live again and the focus falls
 * through to the body.
 *
 * Both the shared host and the domain patchers skip these, so a re-render can never release
 * a panel the stack is still holding. Only the stack adds and removes them.
 */
const MODAL_STACK_HELD = "data-modal-stack-held";
const MODAL_STACK_PREVIOUS_ARIA_HIDDEN = "data-modal-stack-previous-aria-hidden";

const MODAL_STACK_OWNED_ATTRIBUTES = Object.freeze([
  "inert",
  "aria-hidden",
  MODAL_STACK_HELD,
  MODAL_STACK_PREVIOUS_ARIA_HIDDEN,
]);

function modalStackOwnsAttribute(name = "") {
  return MODAL_STACK_OWNED_ATTRIBUTES.includes(String(name));
}

/* ...but ONLY on a panel the stack is holding right now.
 *
 * `aria-hidden` is an ordinary content attribute nearly everywhere else -- a decorative
 * icon, a KPI card the template shows and hides -- so protecting it unconditionally would
 * freeze legitimate state and is a bug of its own. The stack marks the panel it covers, and
 * the marker is what scopes the protection: while it reads "true" the isolation is the
 * stack's; once the stack releases, the marker reads "false" and an ordinary sync may clear
 * everything, so no isolation marks survive a full close.
 */
function modalStackHoldsPanel(element = null) {
  return element?.getAttribute?.(MODAL_STACK_HELD) === "true";
}

export function modalStackProtects(element = null, name = "") {
  return modalStackHoldsPanel(element) && modalStackOwnsAttribute(name);
}

/* Taking and releasing the hold. ONE authority, used by every layer that covers a panel:
 * the attachment viewer over an incidencia and the payment confirmation over a factura are
 * the two today. Neither keeps its own copy of these rules.
 */
export function holdModalPanel(panel = null, { activeLayer = null } = {}) {
  if (!panel?.setAttribute) return false;

  /* Never isolate an ancestor of the layer that is now active: the new layer would make
     itself unreachable. A covering layer is a sibling of what it covers, not a child. */
  if (activeLayer && panel.contains?.(activeLayer)) return false;

  /* Already held. Re-asserting the same attributes is a mutation the rest of the app can
     observe, and asking for isolation we already have is how a content change starts
     looking like a reopen. */
  if (modalStackHoldsPanel(panel)) return true;

  if (!panel.getAttribute(MODAL_STACK_PREVIOUS_ARIA_HIDDEN)) {
    panel.setAttribute(
      MODAL_STACK_PREVIOUS_ARIA_HIDDEN,
      panel.getAttribute("aria-hidden") ?? "__missing__"
    );
  }

  panel.setAttribute("aria-hidden", "true");

  try {
    panel.inert = true;
  } catch {
    panel.setAttribute("inert", "");
  }

  panel.setAttribute(MODAL_STACK_HELD, "true");
  return true;
}

/* THE OPENER CAN BE REPLACED WHILE THE LAYER IS COVERING IT.
 *
 * A layer's opener lives inside the panel below it, and that panel may re-render while the
 * layer covers it: the control the user pressed is then a detached node, and returning focus
 * to it drops the focus on the body without a single error. So the layer hands over the
 * attributes that name its opener and the live equivalent is looked up inside the panel that
 * is being released -- and only then. Nothing is stolen back from anywhere else: this runs
 * when the layer itself closes, and only when its own opener is already gone.
 *
 * A candidate is accepted only when its identity is UNAMBIGUOUS in that panel. Two controls
 * sharing an attribute value is not a match, it is a guess, and the focus goes to the panel
 * instead of to the wrong button.
 */
export function liveModalOpener(opener = null, { within = null, identity = ["id", "name", "href"] } = {}) {
  if (!opener) return null;
  if (opener.isConnected) return opener;
  if (!within?.isConnected) return null;

  for (const name of identity) {
    const value = opener.getAttribute?.(name);
    if (!value) continue;
    const matches = [...within.querySelectorAll(`[${name}]`)].filter((node) => node.getAttribute(name) === value);
    if (matches.length === 1) return matches[0];
  }

  return null;
}

export function releaseModalPanel(panel = null) {
  if (!panel?.setAttribute) return false;

  const previous = panel.getAttribute(MODAL_STACK_PREVIOUS_ARIA_HIDDEN);

  try {
    panel.inert = false;
  } catch {
    panel.removeAttribute("inert");
  }

  panel.removeAttribute("inert");
  panel.setAttribute(MODAL_STACK_HELD, "false");

  /* The state before the layer arrived, restored exactly: an aria-hidden the owner had is
     put back, one it never had is removed rather than left reading "false". */
  if (previous === "__missing__" || !previous) {
    panel.removeAttribute("aria-hidden");
  } else {
    panel.setAttribute("aria-hidden", previous);
  }

  panel.removeAttribute(MODAL_STACK_PREVIOUS_ARIA_HIDDEN);
  return true;
}

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

function releaseClasses(manager, entry, keep = new Set()) {
  for (const name of entry.classes) {
    if (keep.has(name)) continue;
    const claim = manager.classes.get(name);
    claim.owners.delete(entry);
    if (!claim.owners.size) {
      manager.document.body.classList.toggle(name, claim.existed);
      manager.classes.delete(name);
    }
  }
}

function claimClasses(manager, entry, classes) {
  const next = new Set(['modal-open', ...classes].filter(Boolean));
  releaseClasses(manager, entry, next);
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
  releaseClasses(manager, entry);
  entry.classes.clear();
  if (!manager.entries.length) {
    for (const type of ['keydown', 'click']) manager.document.removeEventListener(type, manager.listener);
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

function backdropClick(manager, event) {
  if (event.defaultPrevented || event.button !== 0) return;
  prune(manager);
  const entry = manager.entries.at(-1);
  const panel = entry && panelOf(entry);
  // Only a click on the top dialog's own shell backdrop is a close request;
  // the owner keeps its close policy, exactly as with Escape.
  if (!panel || !entry.onBackdrop || event.target !== panel.parentElement?.closest("[data-modal-overlay='true']")) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  entry.onBackdrop(event);
}

function managerFor(document) {
  let manager = documents.get(document);
  if (manager) return manager;
  manager = { document, entries: [], classes: new Map(), styles: new Map(), observer: null, listener: null };
  manager.listener = (event) => (event.type === 'click' ? backdropClick(manager, event) : keydown(manager, event));
  const Observer = document.defaultView?.MutationObserver;
  if (Observer) manager.observer = new Observer(() => prune(manager));
  documents.set(document, manager);
  return manager;
}

export function createModalLifecycle({ getPanel, onEscape, onBackdrop, bodyClasses = [], onDetached } = {}) {
  const entry = { getPanel, onEscape, onBackdrop, onDetached, manager: null, classes: new Set(), opener: null };
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
        for (const type of ['keydown', 'click']) document.addEventListener(type, manager.listener);
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

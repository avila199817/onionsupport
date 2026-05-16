/* =========================================================
   Onion SPA - Sidebar Dropdown
   Archivo: src/ui/sidebar/dropdown.js

   SIDEBAR DROPDOWN · SIMPLE
   - dueño visual del menú de usuario
   - open / close / toggle / repair
   - a11y coherente
   - foco seguro al cerrar/abrir
   - tolera re-render DOM
   - no gobierna sidebar open/collapsed
========================================================= */

import {
  getElements,
  blurIfInside,
  focusFirstInteractive,
  sanitizeFooterTooltipState,
  isShellHidden,
  isRealShellHidden as isDomRealShellHidden,
} from "./dom.js";

import {
  USER_DROPDOWN_ID,
  USER_TOGGLE_ID,
  USER_DROPDOWN_LEGACY_ID,
  USER_TOGGLE_LEGACY_ID,
  SIDEBAR_EVENTS,
} from "./constants.js";

export const SIDEBAR_DROPDOWN_VERSION = "sidebar-dropdown-v17-simple";

const SOURCE = "SidebarDropdown";
const OWNER = "dropdown.js";
const LOG_PREFIX = "[SidebarDropdown]";

const DROPDOWN_ID = USER_DROPDOWN_ID || USER_DROPDOWN_LEGACY_ID || "userDropdown";
const TOGGLE_ID = USER_TOGGLE_ID || USER_TOGGLE_LEGACY_ID || "sidebarUserToggle";

const STATE_OPEN = "open";
const STATE_CLOSED = "closed";

const OPEN_CLASSES = Object.freeze(["open", "active", "is-open", "is-visible", "show", "visible", "expanded"]);
const TOGGLE_OPEN_CLASSES = Object.freeze(["active", "is-active", "is-open", "is-expanded"]);
const CONTAINER_OPEN_CLASSES = Object.freeze(["user-dropdown-open", "has-user-dropdown-open", "is-user-menu-open"]);
const INLINE_LOCKS = Object.freeze(["display", "visibility", "opacity", "pointer-events"]);

const INTERACTIVE_SELECTOR = [
  "a[href]",
  "button",
  "input",
  "select",
  "textarea",
  "[role='menuitem']",
  "[role='button']",
  "[tabindex]:not([tabindex='-1'])",
  "[data-dropdown-item]",
  ".dropdown-item",
].join(",");

const TOOLTIP_SELECTOR = "[title], [data-tooltip], [data-i18n-data-tooltip], [aria-describedby]";
const FOOTER_SELECTOR = ".sidebar-footer,[data-sidebar-footer='true'],[data-sidebar-footer]";

const EVENTS = Object.freeze({
  change: SIDEBAR_EVENTS?.dropdownChange || "sidebar:dropdown:change",
  blocked: SIDEBAR_EVENTS?.dropdownBlocked || "sidebar:dropdown:blocked",
  repaired: SIDEBAR_EVENTS?.dropdownRepaired || "sidebar:dropdown:repaired",
  open: SIDEBAR_EVENTS?.dropdownOpen || "sidebar:dropdown:open",
  close: SIDEBAR_EVENTS?.dropdownClose || "sidebar:dropdown:close",
  toggle: SIDEBAR_EVENTS?.dropdownToggle || "sidebar:dropdown:toggle",
  focusMoved: SIDEBAR_EVENTS?.dropdownFocusMoved || "sidebar:dropdown:focus-moved",
  stateForced: SIDEBAR_EVENTS?.dropdownStateForced || "sidebar:dropdown:state-forced",
});

let lastEmitSignature = "";
let lastEmitAt = 0;

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isFn(value) {
  return typeof value === "function";
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const out = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return out || fallback;
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function safeBoolean(value, fallback = false) {
  if (value === true || value === false) return value;
  if (value === 1 || value === "1") return true;
  if (value === 0 || value === "0") return false;

  const key = safeText(value, "").toLowerCase();
  if (["true", "yes", "si", "sí", "ok", "on", "open", "opened", "visible", "shown"].includes(key)) return true;
  if (["false", "no", "off", "closed", "close", "hidden", "hide"].includes(key)) return false;

  return Boolean(fallback);
}

function nowTs() {
  try {
    return Date.now();
  } catch {
    return 0;
  }
}

function safeIsoDate(ms = nowTs()) {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

function safeWarn(AppCore, ...args) {
  try {
    AppCore?.utils?.warn?.(LOG_PREFIX, ...args);
    return;
  } catch {}

  try {
    console.warn(LOG_PREFIX, ...args);
  } catch {}
}

function emitSignature(eventName = "", payload = {}) {
  const data = safeObject(payload);
  return [eventName, data.open, data.previousOpen, data.changed, data.reason, data.hasDropdown, data.hasToggle]
    .map(String)
    .join("|");
}

function safeEmit(AppCore, eventName = "", payload = {}, options = {}) {
  const name = safeText(eventName, "");
  if (!name) return false;

  const detail = {
    source: SOURCE,
    owner: OWNER,
    version: SIDEBAR_DROPDOWN_VERSION,
    at: safeIsoDate(),
    ts: nowTs(),
    ...safeObject(payload),
  };

  const signature = emitSignature(name, detail);
  const ts = nowTs();

  if (options.force !== true && signature === lastEmitSignature && ts - lastEmitAt < 24) return false;

  lastEmitSignature = signature;
  lastEmitAt = ts;

  let bus = false;

  try {
    if (isFn(AppCore?.events?.emit)) {
      bus = true;
      AppCore.events.emit(name, detail);
      return true;
    }
  } catch (error) {
    safeWarn(AppCore, `AppCore.events.emit("${name}") falló.`, error);
  }

  if (!bus && isBrowser() && typeof CustomEvent !== "undefined") {
    try {
      window.dispatchEvent(new CustomEvent(name, { detail }));
      return true;
    } catch {}
  }

  return false;
}

function afterPaint(callback) {
  if (!isFn(callback)) return;

  if (!isBrowser()) {
    try {
      callback();
    } catch {}
    return;
  }

  try {
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => callback()));
    return;
  } catch {}

  try {
    window.setTimeout(callback, 0);
  } catch {}
}

/* =========================================================
   DOM HELPERS
========================================================= */

function setAttr(element, name = "", value = "") {
  if (!element || !name) return false;

  try {
    element.setAttribute(name, String(value));
    return true;
  } catch {
    return false;
  }
}

function removeAttr(element, name = "") {
  if (!element || !name) return false;

  try {
    element.removeAttribute(name);
    return true;
  } catch {
    return false;
  }
}

function setDataset(element, key = "", value = "") {
  if (!element || !key) return false;

  try {
    if (value === null || value === undefined || value === "") delete element.dataset[key];
    else element.dataset[key] = String(value);
    return true;
  } catch {
    return false;
  }
}

function setHidden(element, hidden = false) {
  if (!element) return false;

  const value = Boolean(hidden);

  try {
    element.hidden = value;
  } catch {}

  try {
    if (value) element.setAttribute("hidden", "");
    else element.removeAttribute("hidden");
  } catch {}

  return true;
}

function toggleClass(element, className = "", enabled = false) {
  if (!element || !className) return false;

  try {
    element.classList.toggle(className, Boolean(enabled));
    return true;
  } catch {
    return false;
  }
}

function toggleClasses(element, classNames = [], enabled = false) {
  if (!element) return false;

  for (const className of classNames) toggleClass(element, className, enabled);
  return true;
}

function hasClass(element, className = "") {
  try {
    return Boolean(element?.classList?.contains?.(className));
  } catch {
    return false;
  }
}

function removeInlineLocks(element = null) {
  if (!element) return false;

  for (const property of INLINE_LOCKS) {
    try {
      element.style.removeProperty(property);
    } catch {}
  }

  return true;
}

function removeTooltipAttributes(element = null) {
  if (!element) return false;

  removeAttr(element, "title");
  removeAttr(element, "data-tooltip");
  removeAttr(element, "data-i18n-data-tooltip");
  removeAttr(element, "aria-describedby");

  return true;
}

function removeTooltipAttributesDeep(element = null) {
  if (!element) return false;

  removeTooltipAttributes(element);

  try {
    element.querySelectorAll(TOOLTIP_SELECTOR).forEach((node) => removeTooltipAttributes(node));
  } catch {}

  return true;
}

function ensureElementId(element = null, fallback = "") {
  if (!element) return "";

  const current = safeText(element.id, "");
  if (current) return current;

  const next = safeText(fallback, "");
  if (!next) return "";

  try {
    element.id = next;
  } catch {}

  return safeText(element.id, next);
}

function ensureDropdownId(dropdown = null) {
  return ensureElementId(dropdown, DROPDOWN_ID);
}

function ensureToggleId(toggle = null) {
  return ensureElementId(toggle, TOGGLE_ID);
}

function activeElement() {
  if (!isBrowser()) return null;

  try {
    return document.activeElement || null;
  } catch {
    return null;
  }
}

function contains(parent = null, child = null) {
  if (!parent || !child) return false;

  try {
    return parent === child || parent.contains(child);
  } catch {
    return false;
  }
}

function connected(element = null) {
  if (!element) return false;

  try {
    return element.isConnected !== false;
  } catch {
    return true;
  }
}

function disabled(element = null) {
  if (!element) return true;

  try {
    if (element.disabled === true) return true;
  } catch {}

  return Boolean(
    element.getAttribute?.("aria-disabled") === "true" ||
      element.hasAttribute?.("disabled") ||
      element.hasAttribute?.("inert") ||
      element.hidden === true
  );
}

function hardHidden(element = null) {
  if (!element) return true;

  try {
    return Boolean(
      element.hidden === true ||
        element.hasAttribute?.("hidden") ||
        element.hasAttribute?.("inert") ||
        element.getAttribute?.("aria-hidden") === "true"
    );
  } catch {
    return false;
  }
}

function sidebarFooter(toggle = null, dropdown = null, sidebar = null) {
  try {
    return toggle?.closest?.(FOOTER_SELECTOR) || dropdown?.closest?.(FOOTER_SELECTOR) || sidebar?.querySelector?.(FOOTER_SELECTOR) || null;
  } catch {
    return null;
  }
}

function computedSnapshot(element = null) {
  if (!element || !isBrowser()) return {};

  try {
    const style = window.getComputedStyle(element);
    return {
      display: style.display,
      visibility: style.visibility,
      opacity: style.opacity,
      pointerEvents: style.pointerEvents,
      zIndex: style.zIndex,
    };
  } catch {
    return {};
  }
}

/* =========================================================
   SHELL / STATE
========================================================= */

function realShellHidden(AppCore) {
  if (!isBrowser()) return false;

  try {
    return Boolean(isDomRealShellHidden(AppCore));
  } catch {
    return false;
  }
}

function dropdownBlocked(AppCore) {
  if (realShellHidden(AppCore)) return true;

  try {
    const domHidden = Boolean(isShellHidden(AppCore));
    if (!domHidden) return false;

    const { sidebar } = getElements(AppCore);
    return !(sidebar?.hidden === true);
  } catch {
    return false;
  }
}

function repairStaleSidebarHidden(AppCore) {
  if (realShellHidden(AppCore)) return false;

  const { sidebar, userToggle } = getElements(AppCore);
  let repaired = false;

  for (const node of [sidebar, userToggle]) {
    if (!node || node.hidden !== true) continue;

    try {
      node.hidden = false;
      node.removeAttribute("hidden");
      node.setAttribute("aria-hidden", "false");
      node.removeAttribute("inert");
      repaired = true;
    } catch {}
  }

  if (repaired) safeEmit(AppCore, EVENTS.stateForced, { reason: "stale-sidebar-hidden-repaired" }, { force: true });
  return repaired;
}

function ensureLocalState(localState) {
  if (!localState || typeof localState !== "object") return { dropdownOpen: false };
  if (typeof localState.dropdownOpen !== "boolean") localState.dropdownOpen = false;
  return localState;
}

function getDropdownOpen(localState) {
  return Boolean(ensureLocalState(localState).dropdownOpen);
}

function domDropdownOpen(AppCore) {
  const { userToggle, userDropdown } = getElements(AppCore);
  if (!userDropdown) return false;

  if (
    userDropdown.hidden === true ||
    userDropdown.getAttribute?.("aria-hidden") === "true" ||
    userDropdown.dataset?.state === STATE_CLOSED ||
    userDropdown.dataset?.open === "false"
  ) {
    return false;
  }

  return Boolean(
    userDropdown.dataset?.state === STATE_OPEN ||
      userDropdown.dataset?.open === "true" ||
      userToggle?.getAttribute?.("aria-expanded") === "true" ||
      OPEN_CLASSES.some((className) => hasClass(userDropdown, className))
  );
}

/* =========================================================
   A11Y / VISUAL SYNC
========================================================= */

function blurBeforeHide(dropdown = null, toggle = null, options = {}) {
  if (!dropdown) return false;

  const hadFocus = contains(dropdown, activeElement());
  let blurred = false;

  try {
    blurred = Boolean(blurIfInside(dropdown));
  } catch {}

  if (hadFocus && options.restoreFocus === true && toggle && connected(toggle) && !toggle.hidden && !disabled(toggle)) {
    try {
      toggle.focus?.({ preventScroll: true });
      safeEmit(options.AppCore || null, EVENTS.focusMoved, { reason: options.reason || "dropdown-close", target: "toggle" });
    } catch {}
  }

  return hadFocus || blurred;
}

function removeInert(dropdown = null) {
  if (!dropdown) return false;

  removeAttr(dropdown, "inert");

  try {
    dropdown.inert = false;
  } catch {}

  return true;
}

function syncDropdownItemsA11y(dropdown = null) {
  if (!dropdown) return false;

  try {
    dropdown.querySelectorAll(INTERACTIVE_SELECTOR).forEach((item) => {
      const tag = safeText(item.tagName, "").toLowerCase();
      const divider = hasClass(item, "dropdown-divider") || item.getAttribute?.("role") === "separator";

      if (divider) {
        setAttr(item, "role", "separator");
        return;
      }

      if (tag === "button" || tag === "a" || hasClass(item, "dropdown-item") || item.dataset?.dropdownItem !== undefined) {
        if (!item.getAttribute?.("role")) setAttr(item, "role", "menuitem");
      }

      if (tag === "button" && !item.getAttribute?.("type")) setAttr(item, "type", "button");
    });

    return true;
  } catch {
    return false;
  }
}

export function syncDropdownA11y(AppCore, open = false) {
  const isOpen = safeBoolean(open, false);
  const { sidebar, userToggle, userDropdown } = getElements(AppCore);
  const dropdownId = ensureDropdownId(userDropdown);
  const toggleId = ensureToggleId(userToggle);

  if (userToggle) {
    setAttr(userToggle, "aria-haspopup", "menu");
    setAttr(userToggle, "aria-expanded", String(isOpen));
    setAttr(userToggle, "type", "button");
    if (dropdownId) setAttr(userToggle, "aria-controls", dropdownId);
    setAttr(userToggle, "data-state", isOpen ? STATE_OPEN : STATE_CLOSED);
    setAttr(userToggle, "data-dropdown-open", String(isOpen));
    setDataset(userToggle, "state", isOpen ? STATE_OPEN : STATE_CLOSED);
    setDataset(userToggle, "dropdownOpen", String(isOpen));
    removeTooltipAttributes(userToggle);
  }

  if (userDropdown) {
    setAttr(userDropdown, "role", "menu");
    setAttr(userDropdown, "aria-hidden", String(!isOpen));
    setAttr(userDropdown, "data-state", isOpen ? STATE_OPEN : STATE_CLOSED);
    setAttr(userDropdown, "data-open", String(isOpen));
    if (toggleId) setAttr(userDropdown, "aria-labelledby", toggleId);
    setDataset(userDropdown, "state", isOpen ? STATE_OPEN : STATE_CLOSED);
    setDataset(userDropdown, "open", String(isOpen));
    syncDropdownItemsA11y(userDropdown);
    removeTooltipAttributes(userDropdown);
  }

  if (sidebar) {
    setAttr(sidebar, "data-user-dropdown-open", String(isOpen));
    setDataset(sidebar, "userDropdownOpen", String(isOpen));
  }

  try {
    sanitizeFooterTooltipState(AppCore);
  } catch {}

  return {
    open: isOpen,
    hasToggle: Boolean(userToggle),
    hasDropdown: Boolean(userDropdown),
  };
}

function syncContainers(AppCore, open = false) {
  const isOpen = safeBoolean(open, false);
  const { sidebar, userToggle, userDropdown } = getElements(AppCore);
  const footer = sidebarFooter(userToggle, userDropdown, sidebar);

  toggleClasses(sidebar, CONTAINER_OPEN_CLASSES, isOpen);
  toggleClasses(footer, CONTAINER_OPEN_CLASSES, isOpen);

  if (sidebar) {
    setAttr(sidebar, "data-user-dropdown-open", String(isOpen));
    setDataset(sidebar, "userDropdownOpen", String(isOpen));
  }

  if (footer) {
    setAttr(footer, "data-user-dropdown-open", String(isOpen));
    setAttr(footer, "data-state", isOpen ? STATE_OPEN : STATE_CLOSED);
    setDataset(footer, "userDropdownOpen", String(isOpen));
    setDataset(footer, "state", isOpen ? STATE_OPEN : STATE_CLOSED);
    removeTooltipAttributesDeep(footer);
  }

  return {
    hasSidebar: Boolean(sidebar),
    hasFooter: Boolean(footer),
  };
}

function canOpenDropdown(AppCore) {
  if (dropdownBlocked(AppCore)) return { ok: false, reason: "shell-hidden" };

  repairStaleSidebarHidden(AppCore);

  const { userToggle, userDropdown } = getElements(AppCore);

  if (!userDropdown) return { ok: false, reason: "dropdown-missing" };
  if (!userToggle) return { ok: false, reason: "toggle-missing" };
  if (disabled(userToggle)) return { ok: false, reason: "toggle-disabled" };
  if (hardHidden(userToggle)) return { ok: false, reason: "toggle-hidden" };

  return { ok: true, reason: "ok" };
}

function syncDropdownDom(AppCore, localState, open = false, options = {}) {
  const state = ensureLocalState(localState);
  const opts = safeObject(options);
  const requestedOpen = safeBoolean(open, false);
  const { userToggle, userDropdown } = getElements(AppCore);
  const guard = requestedOpen ? canOpenDropdown(AppCore) : { ok: true, reason: "closing" };
  const actualOpen = Boolean(requestedOpen && userDropdown && guard.ok);

  state.dropdownOpen = actualOpen;

  if (!userDropdown) {
    const a11y = syncDropdownA11y(AppCore, false);
    const containers = syncContainers(AppCore, false);

    return {
      open: false,
      requestedOpen,
      blocked: requestedOpen,
      blockReason: requestedOpen ? "dropdown-missing" : "",
      hasDropdown: false,
      hasToggle: Boolean(userToggle),
      hasSidebar: containers.hasSidebar,
      hasFooter: containers.hasFooter,
      a11y,
      state,
    };
  }

  ensureDropdownId(userDropdown);
  ensureToggleId(userToggle);
  removeInert(userDropdown);
  removeInlineLocks(userDropdown);

  if (actualOpen) {
    setHidden(userDropdown, false);
    setAttr(userDropdown, "aria-hidden", "false");
    toggleClasses(userDropdown, OPEN_CLASSES, true);
    setAttr(userDropdown, "data-state", STATE_OPEN);
    setAttr(userDropdown, "data-open", "true");
    setDataset(userDropdown, "state", STATE_OPEN);
    setDataset(userDropdown, "open", "true");
  } else {
    blurBeforeHide(userDropdown, userToggle, {
      AppCore,
      restoreFocus: opts.restoreFocus === true,
      reason: opts.reason || "close-dropdown",
    });

    toggleClasses(userDropdown, OPEN_CLASSES, false);
    setAttr(userDropdown, "aria-hidden", "true");
    setAttr(userDropdown, "data-state", STATE_CLOSED);
    setAttr(userDropdown, "data-open", "false");
    setDataset(userDropdown, "state", STATE_CLOSED);
    setDataset(userDropdown, "open", "false");
    setHidden(userDropdown, true);
  }

  removeTooltipAttributesDeep(userDropdown);

  if (userToggle) {
    toggleClasses(userToggle, TOGGLE_OPEN_CLASSES, actualOpen);
    setAttr(userToggle, "aria-expanded", String(actualOpen));
    setAttr(userToggle, "data-state", actualOpen ? STATE_OPEN : STATE_CLOSED);
    setAttr(userToggle, "data-dropdown-open", String(actualOpen));
    setDataset(userToggle, "state", actualOpen ? STATE_OPEN : STATE_CLOSED);
    setDataset(userToggle, "dropdownOpen", String(actualOpen));
    removeTooltipAttributes(userToggle);
  }

  const a11y = syncDropdownA11y(AppCore, actualOpen);
  const containers = syncContainers(AppCore, actualOpen);

  return {
    open: actualOpen,
    requestedOpen,
    blocked: requestedOpen && !actualOpen,
    blockReason: requestedOpen && !actualOpen ? guard.reason || "blocked" : "",
    hasDropdown: true,
    hasToggle: Boolean(userToggle),
    hasSidebar: containers.hasSidebar,
    hasFooter: containers.hasFooter,
    a11y,
    state,
  };
}

function emitLifecycle(AppCore, { open = false, previousOpen = false, changed = false, result = {}, reason = "" } = {}) {
  const payload = {
    open: Boolean(open),
    previousOpen: Boolean(previousOpen),
    changed: Boolean(changed),
    reason: safeText(reason, ""),
    requestedOpen: Boolean(result.requestedOpen),
    blocked: Boolean(result.blocked),
    blockReason: safeText(result.blockReason, ""),
    hasDropdown: Boolean(result.hasDropdown),
    hasToggle: Boolean(result.hasToggle),
    hasSidebar: Boolean(result.hasSidebar),
    hasFooter: Boolean(result.hasFooter),
  };

  safeEmit(AppCore, EVENTS.change, payload);

  if (result.blocked) safeEmit(AppCore, EVENTS.blocked, payload, { force: true });
  if (changed) safeEmit(AppCore, open ? EVENTS.open : EVENTS.close, payload, { force: true });

  return true;
}

/* =========================================================
   PUBLIC API
========================================================= */

export function setDropdownOpen(AppCore, localState, value, options = {}) {
  const state = ensureLocalState(localState);
  const opts = safeObject(options);
  const previousOpen = Boolean(state.dropdownOpen);
  const result = syncDropdownDom(AppCore, state, value, {
    restoreFocus: opts.restoreFocus === true,
    reason: opts.reason || "set-dropdown-open",
  });

  const nextOpen = Boolean(result.open);
  const changed = previousOpen !== nextOpen;

  state.dropdownOpen = nextOpen;

  if (nextOpen && opts.focusFirst === true) {
    afterPaint(() => {
      const { userDropdown } = getElements(AppCore);
      if (userDropdown && !userDropdown.hidden && state.dropdownOpen) focusFirstInteractive(userDropdown);
    });
  }

  if (changed || opts.forceEmit === true || result.blocked === true) {
    emitLifecycle(AppCore, {
      open: nextOpen,
      previousOpen,
      changed,
      result,
      reason: opts.reason || "set-dropdown-open",
    });
  }

  return nextOpen;
}

export function openDropdown(AppCore, localState, ensureSidebarOpenForUserMenu, options = {}) {
  const state = ensureLocalState(localState);
  const opts = safeObject(options);

  if (dropdownBlocked(AppCore)) {
    setDropdownOpen(AppCore, state, false, { reason: "shell-blocked" });
    safeEmit(AppCore, EVENTS.blocked, { reason: "shell-hidden", snapshot: getDropdownSnapshot(AppCore, state) }, { force: true });
    return false;
  }

  repairStaleSidebarHidden(AppCore);

  let sidebarOpened = false;

  if (isFn(ensureSidebarOpenForUserMenu)) {
    try {
      sidebarOpened = Boolean(ensureSidebarOpenForUserMenu({ reason: opts.reason || "open-dropdown" }));
    } catch {}
  }

  return setDropdownOpen(AppCore, state, true, {
    focusFirst: opts.focusFirst === true || sidebarOpened === true,
    reason: opts.reason || "open-dropdown",
    forceEmit: opts.forceEmit === true,
  });
}

export function closeDropdown(AppCore, localState, options = {}) {
  const state = ensureLocalState(localState);
  const opts = safeObject(options);

  if (opts.force !== true && !getDropdownOpen(state)) {
    syncDropdownDom(AppCore, state, false, {
      restoreFocus: opts.restoreFocus === true,
      reason: opts.reason || "close-dropdown:already-closed",
    });
    return false;
  }

  return setDropdownOpen(AppCore, state, false, {
    restoreFocus: opts.restoreFocus === true,
    reason: opts.reason || "close-dropdown",
    forceEmit: opts.forceEmit === true,
  });
}

export function toggleDropdown(AppCore, localState, ensureSidebarOpenForUserMenu, options = {}) {
  const state = ensureLocalState(localState);
  const opts = safeObject(options);

  if (dropdownBlocked(AppCore)) {
    closeDropdown(AppCore, state, { force: true, reason: "shell-blocked" });
    safeEmit(AppCore, EVENTS.blocked, { reason: "shell-hidden", snapshot: getDropdownSnapshot(AppCore, state) }, { force: true });
    return false;
  }

  const open = getDropdownOpen(state);

  safeEmit(AppCore, EVENTS.toggle, { open: !open, previousOpen: open }, { force: opts.forceEmit === true });

  if (open) {
    return closeDropdown(AppCore, state, {
      reason: opts.reason || "toggle-dropdown:close",
      restoreFocus: opts.restoreFocus === true,
      forceEmit: opts.forceEmit === true,
    });
  }

  return openDropdown(AppCore, state, ensureSidebarOpenForUserMenu, {
    ...opts,
    reason: opts.reason || "toggle-dropdown:open",
  });
}

export function repairDropdown(AppCore, localState = {}, options = {}) {
  const state = ensureLocalState(localState);
  const opts = safeObject(options);

  if (typeof localState.dropdownOpen !== "boolean") state.dropdownOpen = domDropdownOpen(AppCore);
  if (dropdownBlocked(AppCore)) state.dropdownOpen = false;

  const result = syncDropdownDom(AppCore, state, Boolean(state.dropdownOpen), {
    restoreFocus: false,
    reason: opts.reason || "repair-dropdown",
  });

  if (opts.emit !== false) {
    safeEmit(AppCore, EVENTS.repaired, {
      open: Boolean(state.dropdownOpen),
      result,
      snapshot: getDropdownSnapshot(AppCore, state),
    }, { force: opts.forceEmit === true });
  }

  return result;
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getDropdownSnapshot(AppCore, localState = {}) {
  const { sidebar, userToggle, userDropdown } = getElements(AppCore);
  const footer = sidebarFooter(userToggle, userDropdown, sidebar);
  const active = activeElement();

  return {
    version: SIDEBAR_DROPDOWN_VERSION,
    open: getDropdownOpen(localState),
    domOpen: domDropdownOpen(AppCore),
    shellHidden: (() => {
      try {
        return Boolean(isShellHidden(AppCore));
      } catch {
        return false;
      }
    })(),
    realShellHidden: realShellHidden(AppCore),
    shellBlocked: dropdownBlocked(AppCore),
    hasToggle: Boolean(userToggle),
    hasDropdown: Boolean(userDropdown),
    hasSidebar: Boolean(sidebar),
    hasFooter: Boolean(footer),
    activeInsideDropdown: contains(userDropdown, active),
    activeInsideToggle: contains(userToggle, active),
    activeElement: {
      tag: active?.tagName || "",
      id: active?.id || "",
      className: safeText(active?.className, ""),
    },
    toggle: {
      id: userToggle?.id || "",
      connected: connected(userToggle),
      className: safeText(userToggle?.className, ""),
      expanded: userToggle?.getAttribute?.("aria-expanded") || null,
      controls: userToggle?.getAttribute?.("aria-controls") || null,
      hasPopup: userToggle?.getAttribute?.("aria-haspopup") || null,
      dataState: userToggle?.dataset?.state || null,
      dataDropdownOpen: userToggle?.dataset?.dropdownOpen || null,
      hidden: Boolean(userToggle?.hidden),
      ariaHidden: userToggle?.getAttribute?.("aria-hidden") || null,
      inert: Boolean(userToggle?.hasAttribute?.("inert")),
      disabled: Boolean(userToggle?.disabled),
      hardHidden: Boolean(userToggle && hardHidden(userToggle)),
    },
    dropdown: {
      id: userDropdown?.id || "",
      connected: connected(userDropdown),
      className: safeText(userDropdown?.className, ""),
      hidden: Boolean(userDropdown?.hidden),
      ariaHidden: userDropdown?.getAttribute?.("aria-hidden") || null,
      dataState: userDropdown?.dataset?.state || null,
      dataOpen: userDropdown?.dataset?.open || null,
      role: userDropdown?.getAttribute?.("role") || null,
      ariaLabelledBy: userDropdown?.getAttribute?.("aria-labelledby") || null,
      inert: Boolean(userDropdown?.hasAttribute?.("inert")),
      inlineDisplay: userDropdown?.style?.display || "",
      inlinePointerEvents: userDropdown?.style?.pointerEvents || "",
      inlineVisibility: userDropdown?.style?.visibility || "",
      inlineOpacity: userDropdown?.style?.opacity || "",
      computed: computedSnapshot(userDropdown),
    },
    footer: {
      connected: connected(footer),
      className: safeText(footer?.className, ""),
      dataState: footer?.dataset?.state || null,
      dataUserDropdownOpen: footer?.dataset?.userDropdownOpen || null,
    },
    sidebar: {
      connected: connected(sidebar),
      className: safeText(sidebar?.className, ""),
      dataUserDropdownOpen: sidebar?.dataset?.userDropdownOpen || null,
      hidden: Boolean(sidebar?.hidden),
      ariaHidden: sidebar?.getAttribute?.("aria-hidden") || null,
      dataMode: sidebar?.dataset?.mode || null,
      dataOpen: sidebar?.dataset?.open || null,
      dataCollapsed: sidebar?.dataset?.collapsed || null,
    },
  };
}

export default {
  SIDEBAR_DROPDOWN_VERSION,

  syncDropdownA11y,
  setDropdownOpen,

  openDropdown,
  closeDropdown,
  toggleDropdown,

  repairDropdown,
  getDropdownSnapshot,
};

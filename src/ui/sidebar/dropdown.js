/* =========================================================
   Onion SPA - Sidebar Dropdown
   Archivo: src/ui/sidebar/dropdown.js

   FINAL EXTREME SYSTEM · USER DROPDOWN · A11Y SAFE · 11/10
   DATA-STATE CONTRACT · ZERO DOUBLE DISPATCH · RERENDER SAFE

   Responsabilidades:
   - Gestionar apertura / cierre del dropdown de usuario.
   - Sincronizar estado visual del dropdown.
   - Sincronizar atributos a11y.
   - Evitar warnings de aria-hidden al cerrar.
   - Abrir sidebar automáticamente antes de abrir dropdown.
   - Limpiar tooltips nativos/custom del footer.
   - Tolerar DOM re-renderizado.
   - No bloquear por sidebar.hidden stale tras login/router repair.
   - No abrir si la shell real está oculta.
   - Blur antes de ocultar.
   - role="menu" / role="menuitem" coherente.
   - data-state coherente: open / closed.
   - Compat CSS legacy: open / active / is-open / is-visible / show / visible / expanded.
   - safeEmit usa AppCore.events si existe; window solo fallback.
========================================================= */

import {
  getElements,
  blurIfInside,
  focusFirstInteractive,
  sanitizeFooterTooltipState,
  isShellHidden,
} from "./dom.js";

import {
  USER_DROPDOWN_ID,
  SIDEBAR_EVENTS,
} from "./constants.js";

/* =========================================================
   CONSTANTS
========================================================= */

const SOURCE = "SidebarDropdown";

const DROPDOWN_ID_FALLBACK =
  USER_DROPDOWN_ID ||
  "userDropdown";

const USER_TOGGLE_ID_FALLBACK =
  "sidebarUserToggle";

const OPEN_CLASSNAMES = Object.freeze([
  "open",
  "active",
  "is-open",
  "is-visible",
  "show",
  "visible",
  "expanded",
]);

const TOGGLE_OPEN_CLASSNAMES = Object.freeze([
  "active",
  "is-active",
  "is-open",
  "is-expanded",
]);

const CONTAINER_OPEN_CLASSNAMES = Object.freeze([
  "user-dropdown-open",
  "has-user-dropdown-open",
  "is-user-menu-open",
]);

const INLINE_LOCK_PROPERTIES = Object.freeze([
  "display",
  "visibility",
  "opacity",
  "pointer-events",
]);

const INTERACTIVE_ITEM_SELECTOR = [
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

const EVENT_DROPDOWN_CHANGE =
  "sidebar:dropdown:change";

const EVENT_DROPDOWN_BLOCKED =
  "sidebar:dropdown:blocked";

const EVENT_DROPDOWN_REPAIRED =
  "sidebar:dropdown:repaired";

const EVENT_DROPDOWN_OPEN =
  SIDEBAR_EVENTS?.dropdownOpen ||
  "sidebar:dropdown:open";

const EVENT_DROPDOWN_CLOSE =
  SIDEBAR_EVENTS?.dropdownClose ||
  "sidebar:dropdown:close";

const EVENT_DROPDOWN_TOGGLE =
  SIDEBAR_EVENTS?.dropdownToggle ||
  "sidebar:dropdown:toggle";

/* =========================================================
   SAFE HELPERS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function hasDocument() {
  return typeof document !== "undefined";
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }

  const text = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text || fallback;
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function isFunction(value) {
  return typeof value === "function";
}

function safeBoolean(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const key = value.trim().toLowerCase();

    if (["true", "1", "yes", "si", "sí", "ok", "on"].includes(key)) {
      return true;
    }

    if (["false", "0", "no", "off"].includes(key)) {
      return false;
    }
  }

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  return fallback;
}

function normalizeOpen(value) {
  return safeBoolean(value, Boolean(value));
}

function safeWarn(AppCore, ...args) {
  try {
    AppCore?.utils?.warn?.("[SidebarDropdown]", ...args);
  } catch {}

  try {
    console.warn("[SidebarDropdown]", ...args);
  } catch {}
}

/*
  No emitimos por AppCore.events Y window a la vez.
  Si el bus existe, usamos bus. Window solo fallback.
*/
function safeEmit(AppCore, eventName = "", payload = {}) {
  const name = safeText(eventName, "");

  if (!name) {
    return false;
  }

  try {
    if (isFunction(AppCore?.events?.emit)) {
      AppCore.events.emit(name, payload);
      return true;
    }
  } catch (error) {
    safeWarn(AppCore, `AppCore.events.emit("${name}") falló.`, error);
  }

  try {
    if (isBrowser() && typeof CustomEvent !== "undefined") {
      window.dispatchEvent(
        new CustomEvent(name, {
          detail: payload,
        })
      );

      return true;
    }
  } catch {}

  return false;
}

function afterPaint(callback) {
  if (!isFunction(callback)) {
    return;
  }

  if (!isBrowser()) {
    try {
      callback();
    } catch {}

    return;
  }

  try {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        try {
          callback();
        } catch {}
      });
    });

    return;
  } catch {}

  try {
    window.setTimeout(() => {
      try {
        callback();
      } catch {}
    }, 0);
  } catch {}
}

/* =========================================================
   DOM HELPERS
========================================================= */

function setAttr(element, name = "", value = "") {
  if (!element || !name) {
    return false;
  }

  try {
    element.setAttribute(name, String(value));
    return true;
  } catch {
    return false;
  }
}

function removeAttr(element, name = "") {
  if (!element || !name) {
    return false;
  }

  try {
    element.removeAttribute(name);
    return true;
  } catch {
    return false;
  }
}

function setDataset(element, key = "", value = "") {
  if (!element || !key) {
    return false;
  }

  try {
    if (value === null || value === undefined || value === "") {
      delete element.dataset[key];
      return true;
    }

    element.dataset[key] = String(value);
    return true;
  } catch {
    return false;
  }
}

function toggleAttr(element, name = "", enabled = false) {
  if (!element || !name) {
    return false;
  }

  try {
    element.toggleAttribute(name, Boolean(enabled));
    return true;
  } catch {
    return enabled
      ? setAttr(element, name, "")
      : removeAttr(element, name);
  }
}

function setHidden(element, hidden = false) {
  if (!element) {
    return false;
  }

  const shouldHide = Boolean(hidden);

  try {
    element.hidden = shouldHide;
  } catch {}

  toggleAttr(element, "hidden", shouldHide);

  return true;
}

function toggleClass(element, className = "", enabled = false) {
  if (!element || !className) {
    return false;
  }

  try {
    element.classList.toggle(className, Boolean(enabled));
    return true;
  } catch {
    return false;
  }
}

function toggleClasses(element, classNames = [], enabled = false) {
  if (!element) {
    return false;
  }

  for (const className of classNames) {
    toggleClass(element, className, enabled);
  }

  return true;
}

function removeInlineProperty(element, property = "") {
  if (!element || !property) {
    return false;
  }

  try {
    element.style.removeProperty(property);
    return true;
  } catch {
    return false;
  }
}

function cleanupLegacyInlineLocks(element = null) {
  if (!element) {
    return false;
  }

  for (const property of INLINE_LOCK_PROPERTIES) {
    removeInlineProperty(element, property);
  }

  return true;
}

function removeTooltipAttributes(element = null) {
  if (!element) {
    return false;
  }

  removeAttr(element, "title");
  removeAttr(element, "data-tooltip");
  removeAttr(element, "data-i18n-data-tooltip");
  removeAttr(element, "aria-describedby");

  return true;
}

function removeTooltipAttributesDeep(element = null) {
  if (!element) {
    return false;
  }

  removeTooltipAttributes(element);

  try {
    element
      .querySelectorAll(
        "[title], [data-tooltip], [data-i18n-data-tooltip], [aria-describedby]"
      )
      .forEach((node) => {
        removeTooltipAttributes(node);
      });
  } catch {}

  return true;
}

function ensureElementId(element = null, fallback = "") {
  if (!element) {
    return "";
  }

  const existingId = safeText(element.id, "");

  if (existingId) {
    return existingId;
  }

  const nextId = safeText(fallback, "");

  if (!nextId) {
    return "";
  }

  try {
    element.id = nextId;
  } catch {}

  return safeText(element.id, nextId);
}

function ensureDropdownId(userDropdown = null) {
  return ensureElementId(userDropdown, DROPDOWN_ID_FALLBACK);
}

function ensureToggleId(userToggle = null) {
  return ensureElementId(userToggle, USER_TOGGLE_ID_FALLBACK);
}

function getHtmlElement() {
  if (!hasDocument()) {
    return null;
  }

  try {
    return document.documentElement || null;
  } catch {
    return null;
  }
}

function getActiveElement() {
  if (!isBrowser()) {
    return null;
  }

  try {
    return document.activeElement || null;
  } catch {
    return null;
  }
}

function elementContains(parent = null, child = null) {
  if (!parent || !child) {
    return false;
  }

  try {
    return parent === child || parent.contains(child);
  } catch {
    return false;
  }
}

function isElementConnected(element = null) {
  if (!element) {
    return false;
  }

  try {
    return element.isConnected !== false;
  } catch {
    return true;
  }
}

function hasClass(element = null, className = "") {
  if (!element || !className) {
    return false;
  }

  try {
    return element.classList.contains(className);
  } catch {
    return false;
  }
}

function getSidebarFooter(userToggle = null, userDropdown = null, sidebar = null) {
  try {
    return (
      userToggle?.closest?.(".sidebar-footer,[data-sidebar-footer]") ||
      userDropdown?.closest?.(".sidebar-footer,[data-sidebar-footer]") ||
      sidebar?.querySelector?.(".sidebar-footer,[data-sidebar-footer]") ||
      null
    );
  } catch {
    return null;
  }
}

function getComputedSnapshot(element = null) {
  if (!element || !isBrowser()) {
    return {};
  }

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
   SHELL BLOCK RESOLUTION
========================================================= */

function isRealShellHidden(AppCore) {
  if (!isBrowser()) {
    return false;
  }

  const {
    body,
    appShell,
    shell,
    layout,
  } = getElements(AppCore);

  const html = getHtmlElement();

  /*
    No usamos sidebar.hidden como fuente fuerte.
    Puede quedar stale después de login/router repair.
  */
  return Boolean(
    AppCore?.state?.shellVisible === false ||
      AppCore?.state?.routeShellHidden === true ||
      AppCore?.state?.authScreen === true ||

      body?.classList?.contains?.("route-shell-hidden") ||
      body?.classList?.contains?.("auth-screen") ||
      body?.dataset?.shell === "hidden" ||
      body?.dataset?.shellVisible === "false" ||
      body?.dataset?.routeMode === "auth" ||

      html?.dataset?.shell === "hidden" ||
      html?.dataset?.shellVisible === "false" ||
      html?.dataset?.routeMode === "auth" ||

      appShell?.classList?.contains?.("route-shell-hidden") ||
      shell?.classList?.contains?.("route-shell-hidden") ||
      layout?.classList?.contains?.("route-shell-hidden") ||

      appShell?.hidden === true ||
      shell?.hidden === true ||
      layout?.hidden === true ||

      appShell?.getAttribute?.("aria-hidden") === "true" ||
      shell?.getAttribute?.("aria-hidden") === "true" ||
      layout?.getAttribute?.("aria-hidden") === "true"
  );
}

function isDropdownShellBlocked(AppCore) {
  if (isRealShellHidden(AppCore)) {
    return true;
  }

  /*
    Fallback defensivo:
    Si dom.js dice hidden solo por sidebar.hidden stale, NO bloqueamos.
  */
  try {
    const domHidden = Boolean(isShellHidden(AppCore));

    if (!domHidden) {
      return false;
    }

    const {
      sidebar,
      body,
      appShell,
      shell,
      layout,
    } = getElements(AppCore);

    const html = getHtmlElement();

    const realHiddenSignals =
      body?.classList?.contains?.("route-shell-hidden") ||
      body?.classList?.contains?.("auth-screen") ||
      body?.dataset?.shell === "hidden" ||
      body?.dataset?.shellVisible === "false" ||
      body?.dataset?.routeMode === "auth" ||

      html?.dataset?.shell === "hidden" ||
      html?.dataset?.shellVisible === "false" ||
      html?.dataset?.routeMode === "auth" ||

      appShell?.classList?.contains?.("route-shell-hidden") ||
      shell?.classList?.contains?.("route-shell-hidden") ||
      layout?.classList?.contains?.("route-shell-hidden") ||

      appShell?.hidden === true ||
      shell?.hidden === true ||
      layout?.hidden === true ||

      AppCore?.state?.shellVisible === false ||
      AppCore?.state?.routeShellHidden === true ||
      AppCore?.state?.authScreen === true;

    const onlySidebarHidden =
      sidebar?.hidden === true &&
      !realHiddenSignals;

    return !onlySidebarHidden;
  } catch {
    return false;
  }
}

function repairStaleSidebarHidden(AppCore) {
  if (isRealShellHidden(AppCore)) {
    return false;
  }

  const {
    sidebar,
  } = getElements(AppCore);

  if (!sidebar || sidebar.hidden !== true) {
    return false;
  }

  /*
    Reparación mínima:
    No tocamos open/collapsed. Eso es propiedad de state.js.
    Solo desbloqueamos un hidden stale que impediría abrir el menú.
  */
  try {
    sidebar.hidden = false;
    sidebar.setAttribute("aria-hidden", "false");
    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   LOCAL STATE
========================================================= */

function hasExplicitLocalDropdownState(localState) {
  return Boolean(
    localState &&
    typeof localState === "object" &&
    typeof localState.dropdownOpen === "boolean"
  );
}

function ensureLocalState(localState) {
  if (!localState || typeof localState !== "object") {
    return {
      dropdownOpen: false,
    };
  }

  if (typeof localState.dropdownOpen !== "boolean") {
    localState.dropdownOpen = false;
  }

  return localState;
}

function getDropdownOpen(localState) {
  return Boolean(ensureLocalState(localState).dropdownOpen);
}

function resolveDropdownOpenFromDom(AppCore) {
  const {
    userToggle,
    userDropdown,
  } = getElements(AppCore);

  if (!userDropdown) {
    return false;
  }

  if (
    userDropdown.hidden === true ||
    userDropdown.getAttribute?.("aria-hidden") === "true" ||
    userDropdown.dataset?.state === "closed" ||
    userDropdown.dataset?.open === "false"
  ) {
    return false;
  }

  if (
    userDropdown.dataset?.state === "open" ||
    userDropdown.dataset?.open === "true" ||
    userToggle?.getAttribute?.("aria-expanded") === "true" ||
    OPEN_CLASSNAMES.some((className) => hasClass(userDropdown, className))
  ) {
    return true;
  }

  return false;
}

/* =========================================================
   FOCUS / INERT
========================================================= */

function closeFocusedNodeBeforeHide(userDropdown = null, userToggle = null, options = {}) {
  if (!userDropdown) {
    return false;
  }

  const opts = safeObject(options);
  const active = getActiveElement();

  const hadFocusInside =
    elementContains(userDropdown, active);

  let blurred = false;

  try {
    blurred = Boolean(blurIfInside(userDropdown));
  } catch {
    blurred = false;
  }

  if (
    hadFocusInside &&
    opts.restoreFocus === true &&
    userToggle &&
    isElementConnected(userToggle) &&
    !userToggle.hidden
  ) {
    try {
      userToggle.focus?.({
        preventScroll: true,
      });
    } catch {}
  }

  return blurred || hadFocusInside;
}

function removeInert(userDropdown = null) {
  if (!userDropdown) {
    return false;
  }

  removeAttr(userDropdown, "inert");

  try {
    userDropdown.inert = false;
  } catch {}

  return true;
}

/* =========================================================
   DROPDOWN ITEMS A11Y
========================================================= */

function syncDropdownItemsA11y(userDropdown = null) {
  if (!userDropdown) {
    return false;
  }

  try {
    userDropdown
      .querySelectorAll(INTERACTIVE_ITEM_SELECTOR)
      .forEach((item) => {
        if (!item) return;

        const isDivider =
          hasClass(item, "dropdown-divider") ||
          item.getAttribute?.("role") === "separator";

        if (isDivider) {
          setAttr(item, "role", "separator");
          return;
        }

        const tag = safeText(item.tagName, "").toLowerCase();

        if (
          tag === "button" ||
          tag === "a" ||
          hasClass(item, "dropdown-item") ||
          item.dataset?.dropdownItem !== undefined
        ) {
          if (!item.getAttribute?.("role")) {
            setAttr(item, "role", "menuitem");
          }
        }

        if (tag === "button" && !item.getAttribute?.("type")) {
          setAttr(item, "type", "button");
        }
      });

    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   A11Y SYNC
========================================================= */

export function syncDropdownA11y(AppCore, open = false) {
  const isOpen = normalizeOpen(open);

  const {
    sidebar,
    userToggle,
    userDropdown,
  } = getElements(AppCore);

  const dropdownId = ensureDropdownId(userDropdown);
  const toggleId = ensureToggleId(userToggle);

  if (userToggle) {
    setAttr(userToggle, "aria-haspopup", "menu");
    setAttr(userToggle, "aria-expanded", String(isOpen));
    setAttr(userToggle, "type", "button");

    if (dropdownId) {
      setAttr(userToggle, "aria-controls", dropdownId);
    }

    setAttr(userToggle, "data-state", isOpen ? "open" : "closed");
    setAttr(userToggle, "data-dropdown-open", String(isOpen));

    setDataset(userToggle, "state", isOpen ? "open" : "closed");
    setDataset(userToggle, "dropdownOpen", String(isOpen));

    removeTooltipAttributes(userToggle);
  }

  if (userDropdown) {
    setAttr(userDropdown, "role", "menu");
    setAttr(userDropdown, "aria-hidden", String(!isOpen));
    setAttr(userDropdown, "data-state", isOpen ? "open" : "closed");
    setAttr(userDropdown, "data-open", String(isOpen));

    if (toggleId) {
      setAttr(userDropdown, "aria-labelledby", toggleId);
    }

    setDataset(userDropdown, "state", isOpen ? "open" : "closed");
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

/* =========================================================
   CONTAINER SYNC
========================================================= */

function syncDropdownContainers(AppCore, open = false) {
  const isOpen = normalizeOpen(open);

  const {
    sidebar,
    userToggle,
    userDropdown,
  } = getElements(AppCore);

  const footer = getSidebarFooter(userToggle, userDropdown, sidebar);

  toggleClasses(sidebar, CONTAINER_OPEN_CLASSNAMES, isOpen);
  toggleClasses(footer, CONTAINER_OPEN_CLASSNAMES, isOpen);

  if (sidebar) {
    setAttr(sidebar, "data-user-dropdown-open", String(isOpen));
    setDataset(sidebar, "userDropdownOpen", String(isOpen));
  }

  if (footer) {
    setAttr(footer, "data-user-dropdown-open", String(isOpen));
    setAttr(footer, "data-state", isOpen ? "open" : "closed");

    setDataset(footer, "userDropdownOpen", String(isOpen));
    setDataset(footer, "state", isOpen ? "open" : "closed");

    removeTooltipAttributesDeep(footer);
  }

  return {
    hasSidebar: Boolean(sidebar),
    hasFooter: Boolean(footer),
  };
}

/* =========================================================
   DOM SYNC
========================================================= */

function syncDropdownDom(AppCore, localState, open = false, options = {}) {
  const state = ensureLocalState(localState);
  const opts = safeObject(options);
  const requestedOpen = normalizeOpen(open);

  const {
    userToggle,
    userDropdown,
  } = getElements(AppCore);

  const actualOpen =
    requestedOpen &&
    Boolean(userDropdown) &&
    !isDropdownShellBlocked(AppCore);

  state.dropdownOpen = actualOpen;

  if (!userDropdown) {
    const a11y = syncDropdownA11y(AppCore, false);
    const containers = syncDropdownContainers(AppCore, false);

    return {
      open: false,
      requestedOpen,
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

  if (actualOpen) {
    removeInert(userDropdown);
    cleanupLegacyInlineLocks(userDropdown);

    setHidden(userDropdown, false);

    toggleClasses(userDropdown, OPEN_CLASSNAMES, true);

    setAttr(userDropdown, "aria-hidden", "false");
    setAttr(userDropdown, "data-state", "open");
    setAttr(userDropdown, "data-open", "true");

    setDataset(userDropdown, "state", "open");
    setDataset(userDropdown, "open", "true");
  } else {
    closeFocusedNodeBeforeHide(
      userDropdown,
      userToggle,
      {
        restoreFocus: opts.restoreFocus === true,
      }
    );

    removeInert(userDropdown);
    cleanupLegacyInlineLocks(userDropdown);

    toggleClasses(userDropdown, OPEN_CLASSNAMES, false);

    setAttr(userDropdown, "aria-hidden", "true");
    setAttr(userDropdown, "data-state", "closed");
    setAttr(userDropdown, "data-open", "false");

    setDataset(userDropdown, "state", "closed");
    setDataset(userDropdown, "open", "false");

    setHidden(userDropdown, true);
  }

  removeTooltipAttributesDeep(userDropdown);

  if (userToggle) {
    toggleClasses(userToggle, TOGGLE_OPEN_CLASSNAMES, actualOpen);

    setAttr(userToggle, "aria-expanded", String(actualOpen));
    setAttr(userToggle, "data-state", actualOpen ? "open" : "closed");
    setAttr(userToggle, "data-dropdown-open", String(actualOpen));

    setDataset(userToggle, "state", actualOpen ? "open" : "closed");
    setDataset(userToggle, "dropdownOpen", String(actualOpen));

    removeTooltipAttributes(userToggle);
  }

  const a11y = syncDropdownA11y(AppCore, actualOpen);
  const containers = syncDropdownContainers(AppCore, actualOpen);

  return {
    open: actualOpen,
    requestedOpen,
    hasDropdown: true,
    hasToggle: Boolean(userToggle),
    hasSidebar: containers.hasSidebar,
    hasFooter: containers.hasFooter,
    a11y,
    state,
  };
}

/* =========================================================
   EVENTS
========================================================= */

function emitDropdownLifecycle(AppCore, {
  open = false,
  previousOpen = false,
  changed = false,
  result = {},
  reason = "",
} = {}) {
  const payload = {
    source: SOURCE,

    open: Boolean(open),
    previousOpen: Boolean(previousOpen),
    changed: Boolean(changed),
    reason: safeText(reason, ""),

    requestedOpen: Boolean(result.requestedOpen),
    hasDropdown: Boolean(result.hasDropdown),
    hasToggle: Boolean(result.hasToggle),
    hasSidebar: Boolean(result.hasSidebar),
    hasFooter: Boolean(result.hasFooter),
  };

  safeEmit(AppCore, EVENT_DROPDOWN_CHANGE, payload);

  if (changed) {
    safeEmit(
      AppCore,
      open ? EVENT_DROPDOWN_OPEN : EVENT_DROPDOWN_CLOSE,
      payload
    );
  }

  return true;
}

/* =========================================================
   INTERNAL STATE WRITE
========================================================= */

export function setDropdownOpen(AppCore, localState, value, options = {}) {
  const state = ensureLocalState(localState);
  const opts = safeObject(options);

  const requestedOpen = normalizeOpen(value);
  const previousOpen = Boolean(state.dropdownOpen);

  const result = syncDropdownDom(
    AppCore,
    state,
    requestedOpen,
    {
      restoreFocus: opts.restoreFocus === true,
    }
  );

  const nextOpen = Boolean(result.open);
  const changed = previousOpen !== nextOpen;

  state.dropdownOpen = nextOpen;

  if (nextOpen && opts.focusFirst === true) {
    afterPaint(() => {
      const { userDropdown } = getElements(AppCore);

      if (
        userDropdown &&
        !userDropdown.hidden &&
        state.dropdownOpen
      ) {
        focusFirstInteractive(userDropdown);
      }
    });
  }

  if (changed || opts.forceEmit === true) {
    emitDropdownLifecycle(AppCore, {
      open: nextOpen,
      previousOpen,
      changed,
      result,
      reason: opts.reason || "set-dropdown-open",
    });
  }

  return nextOpen;
}

/* =========================================================
   PUBLIC ACTIONS
========================================================= */

export function openDropdown(
  AppCore,
  localState,
  ensureSidebarOpenForUserMenu,
  options = {}
) {
  const state = ensureLocalState(localState);
  const opts = safeObject(options);

  if (isDropdownShellBlocked(AppCore)) {
    setDropdownOpen(AppCore, state, false, {
      reason: "shell-blocked",
      forceEmit: false,
    });

    safeEmit(AppCore, EVENT_DROPDOWN_BLOCKED, {
      source: SOURCE,
      reason: "shell-hidden",
      snapshot: getDropdownSnapshot(AppCore, state),
    });

    return false;
  }

  repairStaleSidebarHidden(AppCore);

  let sidebarWasForcedOpen = false;

  if (isFunction(ensureSidebarOpenForUserMenu)) {
    try {
      sidebarWasForcedOpen = Boolean(
        ensureSidebarOpenForUserMenu()
      );
    } catch {
      sidebarWasForcedOpen = false;
    }
  }

  return setDropdownOpen(
    AppCore,
    state,
    true,
    {
      focusFirst:
        opts.focusFirst === true ||
        sidebarWasForcedOpen === true,

      reason:
        opts.reason ||
        "open-dropdown",

      forceEmit:
        opts.forceEmit === true,
    }
  );
}

export function closeDropdown(AppCore, localState, options = {}) {
  const state = ensureLocalState(localState);
  const opts = safeObject(options);

  if (
    opts.force !== true &&
    !getDropdownOpen(state)
  ) {
    syncDropdownDom(
      AppCore,
      state,
      false,
      {
        restoreFocus: opts.restoreFocus === true,
      }
    );

    return false;
  }

  return setDropdownOpen(
    AppCore,
    state,
    false,
    {
      restoreFocus:
        opts.restoreFocus === true,

      reason:
        opts.reason ||
        "close-dropdown",

      forceEmit:
        opts.forceEmit === true,
    }
  );
}

export function toggleDropdown(
  AppCore,
  localState,
  ensureSidebarOpenForUserMenu,
  options = {}
) {
  const state = ensureLocalState(localState);
  const opts = safeObject(options);

  if (isDropdownShellBlocked(AppCore)) {
    closeDropdown(AppCore, state, {
      force: true,
      reason: "shell-blocked",
    });

    safeEmit(AppCore, EVENT_DROPDOWN_BLOCKED, {
      source: SOURCE,
      reason: "shell-hidden",
      snapshot: getDropdownSnapshot(AppCore, state),
    });

    return false;
  }

  repairStaleSidebarHidden(AppCore);

  const currentlyOpen = getDropdownOpen(state);

  safeEmit(AppCore, EVENT_DROPDOWN_TOGGLE, {
    source: SOURCE,
    open: !currentlyOpen,
    previousOpen: currentlyOpen,
  });

  if (currentlyOpen) {
    return closeDropdown(AppCore, state, {
      reason:
        opts.reason ||
        "toggle-dropdown:close",

      restoreFocus:
        opts.restoreFocus === true,
    });
  }

  let sidebarWasForcedOpen = false;

  if (isFunction(ensureSidebarOpenForUserMenu)) {
    try {
      sidebarWasForcedOpen = Boolean(
        ensureSidebarOpenForUserMenu()
      );
    } catch {
      sidebarWasForcedOpen = false;
    }
  }

  return setDropdownOpen(
    AppCore,
    state,
    true,
    {
      focusFirst:
        opts.focusFirst === true ||
        sidebarWasForcedOpen === true,

      reason:
        opts.reason ||
        "toggle-dropdown:open",

      forceEmit:
        opts.forceEmit === true,
    }
  );
}

/* =========================================================
   REPAIR
========================================================= */

export function repairDropdown(AppCore, localState = {}, options = {}) {
  const hadExplicitState =
    hasExplicitLocalDropdownState(localState);

  const state =
    ensureLocalState(localState);

  const opts =
    safeObject(options);

  if (!hadExplicitState) {
    state.dropdownOpen = resolveDropdownOpenFromDom(AppCore);
  }

  if (isDropdownShellBlocked(AppCore)) {
    state.dropdownOpen = false;
  }

  const result = syncDropdownDom(
    AppCore,
    state,
    Boolean(state.dropdownOpen),
    {
      restoreFocus: false,
    }
  );

  if (opts.emit !== false) {
    safeEmit(AppCore, EVENT_DROPDOWN_REPAIRED, {
      source: SOURCE,
      open: Boolean(state.dropdownOpen),
      result,
      snapshot: getDropdownSnapshot(AppCore, state),
    });
  }

  return result;
}

/* =========================================================
   DEBUG
========================================================= */

export function getDropdownSnapshot(AppCore, localState = {}) {
  const {
    sidebar,
    userToggle,
    userDropdown,
  } = getElements(AppCore);

  const footer =
    getSidebarFooter(userToggle, userDropdown, sidebar);

  const activeElement =
    getActiveElement();

  return {
    open:
      getDropdownOpen(localState),

    domOpen:
      resolveDropdownOpenFromDom(AppCore),

    shellHidden: (() => {
      try {
        return Boolean(isShellHidden(AppCore));
      } catch {
        return false;
      }
    })(),

    realShellHidden:
      isRealShellHidden(AppCore),

    shellBlocked:
      isDropdownShellBlocked(AppCore),

    hasToggle:
      Boolean(userToggle),

    hasDropdown:
      Boolean(userDropdown),

    hasSidebar:
      Boolean(sidebar),

    hasFooter:
      Boolean(footer),

    activeInsideDropdown:
      elementContains(userDropdown, activeElement),

    activeInsideToggle:
      elementContains(userToggle, activeElement),

    activeElement: {
      tag:
        activeElement?.tagName || "",

      id:
        activeElement?.id || "",

      className:
        safeText(activeElement?.className, ""),
    },

    toggle: {
      id:
        userToggle?.id || "",

      connected:
        isElementConnected(userToggle),

      className:
        safeText(userToggle?.className, ""),

      expanded:
        userToggle?.getAttribute?.("aria-expanded") || null,

      controls:
        userToggle?.getAttribute?.("aria-controls") || null,

      hasPopup:
        userToggle?.getAttribute?.("aria-haspopup") || null,

      dataState:
        userToggle?.dataset?.state || null,

      dataDropdownOpen:
        userToggle?.dataset?.dropdownOpen || null,

      hidden:
        Boolean(userToggle?.hidden),

      ariaHidden:
        userToggle?.getAttribute?.("aria-hidden") || null,

      inert:
        Boolean(userToggle?.hasAttribute?.("inert")),

      disabled:
        Boolean(userToggle?.disabled),
    },

    dropdown: {
      id:
        userDropdown?.id || "",

      connected:
        isElementConnected(userDropdown),

      className:
        safeText(userDropdown?.className, ""),

      hidden:
        Boolean(userDropdown?.hidden),

      ariaHidden:
        userDropdown?.getAttribute?.("aria-hidden") || null,

      dataState:
        userDropdown?.dataset?.state || null,

      dataOpen:
        userDropdown?.dataset?.open || null,

      role:
        userDropdown?.getAttribute?.("role") || null,

      ariaLabelledBy:
        userDropdown?.getAttribute?.("aria-labelledby") || null,

      inert:
        Boolean(userDropdown?.hasAttribute?.("inert")),

      inlineDisplay:
        userDropdown?.style?.display || "",

      inlinePointerEvents:
        userDropdown?.style?.pointerEvents || "",

      inlineVisibility:
        userDropdown?.style?.visibility || "",

      inlineOpacity:
        userDropdown?.style?.opacity || "",

      computed:
        getComputedSnapshot(userDropdown),
    },

    footer: {
      connected:
        isElementConnected(footer),

      className:
        safeText(footer?.className, ""),

      dataState:
        footer?.dataset?.state || null,

      dataUserDropdownOpen:
        footer?.dataset?.userDropdownOpen || null,
    },

    sidebar: {
      connected:
        isElementConnected(sidebar),

      className:
        safeText(sidebar?.className, ""),

      dataUserDropdownOpen:
        sidebar?.dataset?.userDropdownOpen || null,

      hidden:
        Boolean(sidebar?.hidden),

      ariaHidden:
        sidebar?.getAttribute?.("aria-hidden") || null,

      dataMode:
        sidebar?.dataset?.mode || null,

      dataOpen:
        sidebar?.dataset?.open || null,

      dataCollapsed:
        sidebar?.dataset?.collapsed || null,
    },
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  syncDropdownA11y,
  setDropdownOpen,

  openDropdown,
  closeDropdown,
  toggleDropdown,

  repairDropdown,
  getDropdownSnapshot,
};

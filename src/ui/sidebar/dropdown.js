/* =========================================================
   Onion SPA - Sidebar Dropdown
   Archivo: src/ui/sidebar/dropdown.js

   FINAL EXTREME SYSTEM · USER DROPDOWN · A11Y SAFE · 10/10

   Responsabilidades:
   - gestionar apertura / cierre del dropdown de usuario
   - sincronizar estado visual del dropdown
   - sincronizar atributos a11y
   - evitar warnings de aria-hidden al cerrar
   - abrir sidebar automáticamente antes de abrir dropdown
   - limpiar tooltips nativos/custom del footer
   - tolerar DOM re-renderizado
   - cero throws accidentales

   HARDENING:
   - idempotente
   - no abre si shell real está oculto
   - no se bloquea por sidebar.hidden stale tras login/router repair
   - blur antes de ocultar para evitar aria-hidden focus warning
   - role/menu consistente
   - data-state coherente
   - soporte focus opcional tras abrir
   - sincroniza clases en sidebar/footer/toggle/dropdown
   - elimina inert accidental al abrir
   - neutraliza pointer-events colgado al abrir
   - soporta CSS legacy: open / active / is-open / is-visible / show / visible / expanded
   - safeEmit usa AppCore.events si existe; window solo fallback
   - snapshot debug ampliado
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

const DROPDOWN_ID_FALLBACK = USER_DROPDOWN_ID || "userDropdown";

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

const EVENT_DROPDOWN_CHANGE = "sidebar:dropdown:change";
const EVENT_DROPDOWN_BLOCKED = "sidebar:dropdown:blocked";
const EVENT_DROPDOWN_REPAIRED = "sidebar:dropdown:repaired";

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
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function hasDocument() {
  return typeof document !== "undefined";
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }

  const text = String(value).trim();

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
  if (typeof value === "boolean") return value;

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

function safeWarn(AppCore, ...args) {
  try {
    AppCore?.utils?.warn?.("[SidebarDropdown]", ...args);
  } catch {}

  try {
    console.warn("[SidebarDropdown]", ...args);
  } catch {}
}

/*
  Importante:
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
    safeWarn(
      AppCore,
      `AppCore.events.emit("${name}") falló.`,
      error
    );
  }

  try {
    if (
      isBrowser() &&
      typeof CustomEvent !== "undefined"
    ) {
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

function setAttr(element, name, value) {
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

function removeAttr(element, name) {
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
    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      delete element.dataset[key];
      return true;
    }

    element.dataset[key] = String(value);
    return true;
  } catch {
    return false;
  }
}

function toggleAttr(element, name, enabled = false) {
  if (!element || !name) {
    return false;
  }

  try {
    element.toggleAttribute(name, Boolean(enabled));
    return true;
  } catch {
    if (enabled) {
      return setAttr(element, name, "");
    }

    return removeAttr(element, name);
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

function toggleClass(element, className, enabled) {
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

function setStyleProperty(element, name, value = "") {
  if (!element || !name) {
    return false;
  }

  try {
    if (value === null || value === undefined || value === "") {
      element.style.removeProperty(name);
    } else {
      element.style.setProperty(name, String(value));
    }

    return true;
  } catch {
    return false;
  }
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

function ensureDropdownId(userDropdown = null) {
  if (!userDropdown) {
    return "";
  }

  const existingId = safeText(userDropdown.id, "");

  if (existingId) {
    return existingId;
  }

  try {
    userDropdown.id = DROPDOWN_ID_FALLBACK;
  } catch {}

  return safeText(userDropdown.id, DROPDOWN_ID_FALLBACK);
}

function normalizeOpen(value) {
  return Boolean(value);
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
    dom.js/isShellHidden() sí puede usarlo y, si queda stale tras login/router,
    bloquearía el dropdown aunque la shell real ya esté visible.
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
    Si dom.js dice hidden por algo que no sea sidebar.hidden stale,
    también bloqueamos.
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

    const onlySidebarHidden =
      sidebar?.hidden === true &&
      !(
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
        AppCore?.state?.authScreen === true
      );

    return !onlySidebarHidden;
  } catch {
    return false;
  }
}

/* =========================================================
   STATE HELPERS
========================================================= */

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

function closeFocusedNodeBeforeHide(userDropdown = null, userToggle = null, options = {}) {
  if (!userDropdown) {
    return false;
  }

  const opts = safeObject(options);
  const active = getActiveElement();

  /*
    Importante:
    Primero sacamos el foco del dropdown.
    Después ya podemos poner aria-hidden/hidden sin warning:
    "Blocked aria-hidden on an element because its descendant retained focus".
  */
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

function removeInertForOpen(userDropdown = null) {
  if (!userDropdown) {
    return false;
  }

  removeAttr(userDropdown, "inert");

  try {
    userDropdown.inert = false;
  } catch {}

  return true;
}

function disableInertForClose(userDropdown = null) {
  if (!userDropdown) {
    return false;
  }

  /*
    No dejamos inert en cerrado.
    hidden + aria-hidden ya bloquea y evita estados raros tras rerender.
  */
  removeAttr(userDropdown, "inert");

  try {
    userDropdown.inert = false;
  } catch {}

  return true;
}

function applyDropdownVisibilityStyles(userDropdown = null, open = false) {
  if (!userDropdown) {
    return false;
  }

  const isOpen = normalizeOpen(open);

  /*
    No forzamos display:block para no pelear con CSS del dropdown.
    En abierto sí neutralizamos estados inline legacy que pueden matarlo.
  */
  if (isOpen) {
    setStyleProperty(userDropdown, "pointer-events", "auto");
    setStyleProperty(userDropdown, "visibility", "visible");
    setStyleProperty(userDropdown, "opacity", "1");
  } else {
    setStyleProperty(userDropdown, "pointer-events", "");
    setStyleProperty(userDropdown, "visibility", "");
    setStyleProperty(userDropdown, "opacity", "");
  }

  return true;
}

/* =========================================================
   A11Y
========================================================= */

export function syncDropdownA11y(AppCore, open = false) {
  const isOpen = normalizeOpen(open);

  const {
    sidebar,
    userToggle,
    userDropdown,
  } = getElements(AppCore);

  const dropdownId = ensureDropdownId(userDropdown);

  if (userToggle) {
    setAttr(userToggle, "aria-haspopup", "menu");
    setAttr(userToggle, "aria-expanded", String(isOpen));

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

    setDataset(userDropdown, "state", isOpen ? "open" : "closed");
    setDataset(userDropdown, "open", String(isOpen));

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
   DOM SYNC
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
  }

  return {
    hasSidebar: Boolean(sidebar),
    hasFooter: Boolean(footer),
  };
}

function syncDropdownDom(AppCore, localState, open = false, options = {}) {
  const state = ensureLocalState(localState);
  const opts = safeObject(options);
  const isOpen = normalizeOpen(open);

  const {
    userToggle,
    userDropdown,
  } = getElements(AppCore);

  if (!userDropdown) {
    const a11y = syncDropdownA11y(AppCore, isOpen);
    const containers = syncDropdownContainers(AppCore, isOpen);

    return {
      open: isOpen,
      hasDropdown: false,
      hasToggle: Boolean(userToggle),
      hasSidebar: containers.hasSidebar,
      hasFooter: containers.hasFooter,
      a11y,
      state,
    };
  }

  ensureDropdownId(userDropdown);

  if (isOpen) {
    removeInertForOpen(userDropdown);
  } else {
    closeFocusedNodeBeforeHide(
      userDropdown,
      userToggle,
      {
        restoreFocus: opts.restoreFocus === true,
      }
    );

    disableInertForClose(userDropdown);
  }

  toggleClasses(userDropdown, OPEN_CLASSNAMES, isOpen);
  setHidden(userDropdown, !isOpen);

  setAttr(userDropdown, "aria-hidden", String(!isOpen));
  setAttr(userDropdown, "data-state", isOpen ? "open" : "closed");
  setAttr(userDropdown, "data-open", String(isOpen));

  setDataset(userDropdown, "state", isOpen ? "open" : "closed");
  setDataset(userDropdown, "open", String(isOpen));

  applyDropdownVisibilityStyles(userDropdown, isOpen);
  removeTooltipAttributesDeep(userDropdown);

  if (userToggle) {
    toggleClasses(userToggle, TOGGLE_OPEN_CLASSNAMES, isOpen);

    setAttr(userToggle, "aria-expanded", String(isOpen));
    setAttr(userToggle, "data-state", isOpen ? "open" : "closed");
    setAttr(userToggle, "data-dropdown-open", String(isOpen));

    setDataset(userToggle, "state", isOpen ? "open" : "closed");
    setDataset(userToggle, "dropdownOpen", String(isOpen));

    removeTooltipAttributes(userToggle);
  }

  const a11y = syncDropdownA11y(AppCore, isOpen);
  const containers = syncDropdownContainers(AppCore, isOpen);

  return {
    open: isOpen,
    hasDropdown: true,
    hasToggle: Boolean(userToggle),
    hasSidebar: containers.hasSidebar,
    hasFooter: containers.hasFooter,
    a11y,
    state,
  };
}

/* =========================================================
   EVENT EMIT
========================================================= */

function emitDropdownLifecycle(AppCore, {
  open = false,
  previousOpen = false,
  changed = false,
  result = {},
  reason = "",
} = {}) {
  const payload = {
    open: Boolean(open),
    previousOpen: Boolean(previousOpen),
    changed: Boolean(changed),
    reason: safeText(reason, ""),

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

  const nextOpen = normalizeOpen(value);
  const previousOpen = Boolean(state.dropdownOpen);
  const changed = previousOpen !== nextOpen;

  state.dropdownOpen = nextOpen;

  const result = syncDropdownDom(
    AppCore,
    state,
    nextOpen,
    {
      restoreFocus: opts.restoreFocus === true,
    }
  );

  if (
    nextOpen &&
    opts.focusFirst === true
  ) {
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

  if (
    changed ||
    opts.forceEmit === true
  ) {
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
      reason: "shell-hidden",
      snapshot: getDropdownSnapshot(AppCore, state),
    });

    return false;
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

  const result = setDropdownOpen(
    AppCore,
    state,
    true,
    {
      focusFirst:
        opts.focusFirst === true ||
        sidebarWasForcedOpen === true,
      reason: opts.reason || "open-dropdown",
      forceEmit: opts.forceEmit === true,
    }
  );

  return result;
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
      restoreFocus: opts.restoreFocus === true,
      reason: opts.reason || "close-dropdown",
      forceEmit: opts.forceEmit === true,
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
      reason: "shell-hidden",
      snapshot: getDropdownSnapshot(AppCore, state),
    });

    return false;
  }

  const currentlyOpen = getDropdownOpen(state);

  safeEmit(AppCore, EVENT_DROPDOWN_TOGGLE, {
    open: !currentlyOpen,
    previousOpen: currentlyOpen,
  });

  if (currentlyOpen) {
    return closeDropdown(AppCore, state, {
      reason: opts.reason || "toggle-dropdown:close",
      restoreFocus: opts.restoreFocus === true,
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
      reason: opts.reason || "toggle-dropdown:open",
      forceEmit: opts.forceEmit === true,
    }
  );
}

/* =========================================================
   REPAIR
========================================================= */

export function repairDropdown(AppCore, localState = {}, options = {}) {
  const state = ensureLocalState(localState);
  const opts = safeObject(options);

  if (isDropdownShellBlocked(AppCore)) {
    state.dropdownOpen = false;
  }

  const result =
    syncDropdownDom(
      AppCore,
      state,
      Boolean(state.dropdownOpen),
      {
        restoreFocus: false,
      }
    );

  if (opts.emit !== false) {
    safeEmit(AppCore, EVENT_DROPDOWN_REPAIRED, {
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

  const footer = getSidebarFooter(userToggle, userDropdown, sidebar);
  const activeElement = getActiveElement();

  return {
    open: getDropdownOpen(localState),

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

    hasToggle: Boolean(userToggle),
    hasDropdown: Boolean(userDropdown),
    hasSidebar: Boolean(sidebar),
    hasFooter: Boolean(footer),

    activeInsideDropdown:
      elementContains(userDropdown, activeElement),

    activeInsideToggle:
      elementContains(userToggle, activeElement),

    activeElement: {
      tag: activeElement?.tagName || "",
      id: activeElement?.id || "",
      className: activeElement?.className || "",
    },

    toggle: {
      id: userToggle?.id || "",
      connected: isElementConnected(userToggle),
      className: userToggle?.className || "",
      expanded: userToggle?.getAttribute?.("aria-expanded") || null,
      controls: userToggle?.getAttribute?.("aria-controls") || null,
      dataState: userToggle?.dataset?.state || null,
      dataDropdownOpen: userToggle?.dataset?.dropdownOpen || null,
      hidden: Boolean(userToggle?.hidden),
      ariaHidden: userToggle?.getAttribute?.("aria-hidden") || null,
      inert: Boolean(userToggle?.hasAttribute?.("inert")),
      disabled: Boolean(userToggle?.disabled),
    },

    dropdown: {
      id: userDropdown?.id || "",
      connected: isElementConnected(userDropdown),
      className: userDropdown?.className || "",
      hidden: Boolean(userDropdown?.hidden),
      ariaHidden: userDropdown?.getAttribute?.("aria-hidden") || null,
      dataState: userDropdown?.dataset?.state || null,
      dataOpen: userDropdown?.dataset?.open || null,
      role: userDropdown?.getAttribute?.("role") || null,
      inert: Boolean(userDropdown?.hasAttribute?.("inert")),
      inlinePointerEvents: userDropdown?.style?.pointerEvents || "",
      inlineVisibility: userDropdown?.style?.visibility || "",
      inlineOpacity: userDropdown?.style?.opacity || "",
      computed: getComputedSnapshot(userDropdown),
    },

    footer: {
      connected: isElementConnected(footer),
      className: footer?.className || "",
      dataState: footer?.dataset?.state || null,
      dataUserDropdownOpen: footer?.dataset?.userDropdownOpen || null,
    },

    sidebar: {
      connected: isElementConnected(sidebar),
      className: sidebar?.className || "",
      dataUserDropdownOpen: sidebar?.dataset?.userDropdownOpen || null,
      hidden: Boolean(sidebar?.hidden),
      ariaHidden: sidebar?.getAttribute?.("aria-hidden") || null,
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

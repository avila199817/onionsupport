/* =========================================================
   Onion SPA - Sidebar Dropdown
   Archivo: src/ui/sidebar/dropdown.js

   FINAL PRO SYSTEM · USER DROPDOWN · 10/10 HARDENED

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
   - no abre si shell está oculto
   - blur antes de ocultar para evitar aria-hidden focus warning
   - role/menu consistente
   - data-state coherente
   - soporte focus opcional tras abrir
   - sincroniza clases en sidebar/footer/toggle/dropdown
   - elimina inert accidental al abrir
   - fuerza pointer-events al abrir
   - soporta CSS legacy: open / active / is-open / is-visible / show / visible / expanded
   - snapshot debug ampliado
========================================================= */

import {
  getElements,
  blurIfInside,
  focusFirstInteractive,
  sanitizeFooterTooltipState,
  isShellHidden,
} from "./dom.js";

/* =========================================================
   CONSTANTS
========================================================= */

const DROPDOWN_ID_FALLBACK = "userDropdown";

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

/* =========================================================
   SAFE HELPERS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
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

function safeEmit(AppCore, eventName = "", payload = {}) {
  const name = safeText(eventName, "");

  if (!name) {
    return false;
  }

  let emitted = false;

  try {
    AppCore?.events?.emit?.(name, payload);
    emitted = true;
  } catch {}

  try {
    if (isBrowser()) {
      window.dispatchEvent(
        new CustomEvent(name, {
          detail: payload,
        })
      );

      emitted = true;
    }
  } catch {}

  return emitted;
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

  try {
    element.toggleAttribute("hidden", shouldHide);
  } catch {
    if (shouldHide) {
      setAttr(element, "hidden", "");
    } else {
      removeAttr(element, "hidden");
    }
  }

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

function closeFocusedNodeBeforeHide(userDropdown = null) {
  if (!userDropdown) {
    return false;
  }

  /*
    Importante:
    Primero sacamos el foco del dropdown.
    Después ya podemos poner aria-hidden/hidden sin warning:
    "Blocked aria-hidden on an element because its descendant retained focus".
  */
  return blurIfInside(userDropdown);
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

function applyDropdownVisibilityStyles(userDropdown = null, open = false) {
  if (!userDropdown) {
    return false;
  }

  const isOpen = normalizeOpen(open);

  /*
    No forzamos display:block en cerrado para no romper CSS.
    En abierto sí neutralizamos estados que pueden dejarlo muerto.
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

    removeTooltipAttributes(userToggle);
  }

  if (userDropdown) {
    setAttr(userDropdown, "role", "menu");
    setAttr(userDropdown, "aria-hidden", String(!isOpen));
    setAttr(userDropdown, "data-state", isOpen ? "open" : "closed");
    setAttr(userDropdown, "data-open", String(isOpen));

    removeTooltipAttributes(userDropdown);
  }

  if (sidebar) {
    setAttr(sidebar, "data-user-dropdown-open", String(isOpen));
  }

  sanitizeFooterTooltipState(AppCore);

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
  }

  if (footer) {
    setAttr(footer, "data-user-dropdown-open", String(isOpen));
    setAttr(footer, "data-state", isOpen ? "open" : "closed");
  }

  return {
    hasSidebar: Boolean(sidebar),
    hasFooter: Boolean(footer),
  };
}

function syncDropdownDom(AppCore, localState, open = false) {
  const state = ensureLocalState(localState);
  const isOpen = normalizeOpen(open);

  const {
    userToggle,
    userDropdown,
  } = getElements(AppCore);

  if (!userDropdown) {
    syncDropdownA11y(AppCore, isOpen);
    syncDropdownContainers(AppCore, isOpen);

    return {
      open: isOpen,
      hasDropdown: false,
      hasToggle: Boolean(userToggle),
      state,
    };
  }

  if (isOpen) {
    removeInertForOpen(userDropdown);
  } else {
    closeFocusedNodeBeforeHide(userDropdown);
  }

  toggleClasses(userDropdown, OPEN_CLASSNAMES, isOpen);
  setHidden(userDropdown, !isOpen);

  setAttr(userDropdown, "aria-hidden", String(!isOpen));
  setAttr(userDropdown, "data-state", isOpen ? "open" : "closed");
  setAttr(userDropdown, "data-open", String(isOpen));

  /*
    Cerrar:
    - aria-hidden true
    - hidden true
    - sin inert por defecto para evitar comportamientos raros en re-render.
    Si algún CSS o módulo quiere inert, que lo gestione fuera.
  */
  if (!isOpen) {
    removeAttr(userDropdown, "inert");

    try {
      userDropdown.inert = false;
    } catch {}
  }

  applyDropdownVisibilityStyles(userDropdown, isOpen);
  removeTooltipAttributes(userDropdown);

  if (userToggle) {
    toggleClasses(userToggle, TOGGLE_OPEN_CLASSNAMES, isOpen);

    setAttr(userToggle, "aria-expanded", String(isOpen));
    setAttr(userToggle, "data-state", isOpen ? "open" : "closed");
    setAttr(userToggle, "data-dropdown-open", String(isOpen));

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
   INTERNAL STATE WRITE
========================================================= */

export function setDropdownOpen(AppCore, localState, value, options = {}) {
  const state = ensureLocalState(localState);
  const opts = safeObject(options);

  const nextOpen = normalizeOpen(value);
  const previousOpen = Boolean(state.dropdownOpen);

  state.dropdownOpen = nextOpen;

  const result = syncDropdownDom(
    AppCore,
    state,
    nextOpen
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

  safeEmit(AppCore, "sidebar:dropdown:change", {
    open: nextOpen,
    previousOpen,
    changed: previousOpen !== nextOpen,
    hasDropdown: result.hasDropdown,
    hasToggle: result.hasToggle,
    hasSidebar: result.hasSidebar,
    hasFooter: result.hasFooter,
  });

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

  if (isShellHidden(AppCore)) {
    setDropdownOpen(AppCore, state, false);

    safeEmit(AppCore, "sidebar:dropdown:blocked", {
      reason: "shell-hidden",
      snapshot: getDropdownSnapshot(AppCore, state),
    });

    return false;
  }

  if (isFunction(ensureSidebarOpenForUserMenu)) {
    try {
      ensureSidebarOpenForUserMenu();
    } catch {}
  }

  return setDropdownOpen(
    AppCore,
    state,
    true,
    {
      focusFirst: opts.focusFirst === true,
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
    syncDropdownDom(AppCore, state, false);
    return false;
  }

  return setDropdownOpen(
    AppCore,
    state,
    false
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

  if (isShellHidden(AppCore)) {
    closeDropdown(AppCore, state, {
      force: true,
    });

    safeEmit(AppCore, "sidebar:dropdown:blocked", {
      reason: "shell-hidden",
      snapshot: getDropdownSnapshot(AppCore, state),
    });

    return false;
  }

  const currentlyOpen = getDropdownOpen(state);

  if (currentlyOpen) {
    return closeDropdown(AppCore, state);
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
    }
  );
}

/* =========================================================
   REPAIR
========================================================= */

export function repairDropdown(AppCore, localState = {}) {
  const state = ensureLocalState(localState);

  return syncDropdownDom(
    AppCore,
    state,
    Boolean(state.dropdownOpen)
  );
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
    shellHidden: isShellHidden(AppCore),

    hasToggle: Boolean(userToggle),
    hasDropdown: Boolean(userDropdown),
    hasSidebar: Boolean(sidebar),
    hasFooter: Boolean(footer),

    activeInsideDropdown: elementContains(userDropdown, activeElement),
    activeInsideToggle: elementContains(userToggle, activeElement),

    toggle: {
      id: userToggle?.id || "",
      className: userToggle?.className || "",
      expanded: userToggle?.getAttribute?.("aria-expanded") || null,
      controls: userToggle?.getAttribute?.("aria-controls") || null,
      dataState: userToggle?.dataset?.state || null,
      dataDropdownOpen: userToggle?.dataset?.dropdownOpen || null,
      hidden: Boolean(userToggle?.hidden),
      ariaHidden: userToggle?.getAttribute?.("aria-hidden") || null,
      inert: Boolean(userToggle?.hasAttribute?.("inert")),
    },

    dropdown: {
      id: userDropdown?.id || "",
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
    },

    footer: {
      className: footer?.className || "",
      dataState: footer?.dataset?.state || null,
      dataUserDropdownOpen: footer?.dataset?.userDropdownOpen || null,
    },

    sidebar: {
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

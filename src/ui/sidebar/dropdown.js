/* =========================================================
   Onion SPA - Sidebar Dropdown
   Archivo: src/ui/sidebar/dropdown.js

   FINAL PRO SYSTEM · USER DROPDOWN · 10/10

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
========================================================= */

import {
  getElements,
  blurIfInside,
  focusFirstInteractive,
  sanitizeFooterTooltipState,
  isShellHidden,
} from "./dom.js";

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

function safeEmit(AppCore, eventName = "", payload = {}) {
  const name = safeText(eventName, "");

  if (!name) {
    return false;
  }

  try {
    AppCore?.events?.emit?.(name, payload);
    return true;
  } catch {}

  try {
    if (isBrowser()) {
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
  if (typeof callback !== "function") {
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
      try {
        callback();
      } catch {}
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

function setHidden(element, hidden = false) {
  if (!element) {
    return false;
  }

  try {
    element.hidden = Boolean(hidden);
  } catch {}

  try {
    element.toggleAttribute("hidden", Boolean(hidden));
  } catch {}

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

  const generatedId = "userDropdown";

  try {
    userDropdown.id = generatedId;
  } catch {}

  return safeText(userDropdown.id, generatedId);
}

function normalizeOpen(value) {
  return Boolean(value);
}

/* =========================================================
   A11Y
========================================================= */

export function syncDropdownA11y(AppCore, open = false) {
  const isOpen = normalizeOpen(open);

  const {
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

    removeTooltipAttributes(userToggle);
  }

  if (userDropdown) {
    setAttr(userDropdown, "role", "menu");
    setAttr(userDropdown, "aria-hidden", String(!isOpen));
    setAttr(userDropdown, "data-state", isOpen ? "open" : "closed");

    removeTooltipAttributes(userDropdown);
  }

  sanitizeFooterTooltipState(AppCore);

  return {
    open: isOpen,
    hasToggle: Boolean(userToggle),
    hasDropdown: Boolean(userDropdown),
  };
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

function syncDropdownDom(AppCore, localState, open = false) {
  const isOpen = normalizeOpen(open);

  const {
    userToggle,
    userDropdown,
  } = getElements(AppCore);

  if (!userDropdown) {
    syncDropdownA11y(AppCore, isOpen);
    return {
      open: isOpen,
      hasDropdown: false,
      hasToggle: Boolean(userToggle),
    };
  }

  if (!isOpen) {
    closeFocusedNodeBeforeHide(userDropdown);
  }

  toggleClass(userDropdown, "open", isOpen);
  toggleClass(userDropdown, "active", isOpen);
  toggleClass(userDropdown, "is-open", isOpen);
  toggleClass(userDropdown, "is-visible", isOpen);

  setHidden(userDropdown, !isOpen);

  setAttr(userDropdown, "aria-hidden", String(!isOpen));
  setAttr(userDropdown, "data-state", isOpen ? "open" : "closed");

  removeTooltipAttributes(userDropdown);

  if (userToggle) {
    toggleClass(userToggle, "active", isOpen);
    toggleClass(userToggle, "is-active", isOpen);

    setAttr(userToggle, "aria-expanded", String(isOpen));
    setAttr(userToggle, "data-state", isOpen ? "open" : "closed");

    removeTooltipAttributes(userToggle);
  }

  syncDropdownA11y(AppCore, isOpen);

  return {
    open: isOpen,
    hasDropdown: true,
    hasToggle: Boolean(userToggle),
  };
}

/* =========================================================
   INTERNAL STATE WRITE
========================================================= */

export function setDropdownOpen(AppCore, localState, value, options = {}) {
  const state = ensureLocalState(localState);

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
    options.focusFirst === true
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

  if (isShellHidden(AppCore)) {
    setDropdownOpen(AppCore, state, false);
    return false;
  }

  if (typeof ensureSidebarOpenForUserMenu === "function") {
    try {
      ensureSidebarOpenForUserMenu();
    } catch {}
  }

  return setDropdownOpen(
    AppCore,
    state,
    true,
    {
      focusFirst: options.focusFirst === true,
    }
  );
}

export function closeDropdown(AppCore, localState, options = {}) {
  const state = ensureLocalState(localState);

  if (
    options.force !== true &&
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

  if (isShellHidden(AppCore)) {
    closeDropdown(AppCore, state, {
      force: true,
    });

    return false;
  }

  const currentlyOpen = getDropdownOpen(state);

  if (currentlyOpen) {
    return closeDropdown(AppCore, state);
  }

  let sidebarWasForcedOpen = false;

  if (typeof ensureSidebarOpenForUserMenu === "function") {
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
        options.focusFirst === true ||
        sidebarWasForcedOpen === true,
    }
  );
}

/* =========================================================
   DEBUG
========================================================= */

export function getDropdownSnapshot(AppCore, localState = {}) {
  const {
    userToggle,
    userDropdown,
  } = getElements(AppCore);

  return {
    open: getDropdownOpen(localState),
    shellHidden: isShellHidden(AppCore),

    hasToggle: Boolean(userToggle),
    hasDropdown: Boolean(userDropdown),

    toggleExpanded:
      userToggle?.getAttribute?.("aria-expanded") || null,

    dropdownHidden:
      Boolean(userDropdown?.hidden),

    dropdownAriaHidden:
      userDropdown?.getAttribute?.("aria-hidden") || null,

    dropdownState:
      userDropdown?.dataset?.state || null,
  };
}

export default {
  syncDropdownA11y,
  setDropdownOpen,

  openDropdown,
  closeDropdown,
  toggleDropdown,

  getDropdownSnapshot,
};

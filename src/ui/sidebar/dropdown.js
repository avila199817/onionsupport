/* =========================================================
   Onion Support - Sidebar Dropdown
   Archivo: /src/ui/sidebar/dropdown.js

   Responsabilidad:
   - Gestionar apertura/cierre del dropdown de cuenta del sidebar.
   - Abrir el sidebar antes de abrir el dropdown si está collapsed.
   - Sin crear DOM.
   - Sin navegar.
   - Sin hacer logout.
   - Sin leer Auth.
   - Sin leer Router.
   - Sin leer rutas.
   - Sin tocar AppCore directamente salvo pasarlo a state.js.
   - Sin emitir eventos.
   - Sin timers.
   - Sin duplicar lógica de sidebar.
   - Sin decidir permisos ni visibilidad.
   - Sólo DOM mínimo: aria, hidden, focus, outside click y Escape.
========================================================= */

import {
  SIDEBAR_SELECTORS,
} from "./constants.js";

import {
  getSidebarRoot,
  isBrowser,
  isElement,
} from "./dom.js";

import {
  getSidebarOpen,
  openSidebar as openRuntimeSidebar,
} from "./state.js";

export const SIDEBAR_DROPDOWN_VERSION = "sidebar.dropdown.v4";

const DROPDOWN_KEY = "account";

const TRIGGER_SELECTOR =
  SIDEBAR_SELECTORS.accountTrigger ||
  `[data-sidebar-dropdown-trigger="${DROPDOWN_KEY}"]`;

const MENU_SELECTOR =
  SIDEBAR_SELECTORS.accountMenu ||
  `[data-sidebar-dropdown-menu="${DROPDOWN_KEY}"]`;

const ITEM_SELECTOR =
  SIDEBAR_SELECTORS.dropdownItem ||
  "[data-sidebar-dropdown-item='true']";

const OPEN_CLASS = "is-account-menu-open";
const MENU_OPEN_CLASS = "is-open";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

let activeRoot = null;
let documentPointerHandler = null;
let documentKeyHandler = null;

const boundRoots = new WeakMap();
const boundRootOptions = new WeakMap();

/* =========================================================
   BASICS
========================================================= */

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isEvent(value) {
  return Boolean(value && typeof value === "object" && "target" in value);
}

function text(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function contains(parent = null, child = null) {
  try {
    return Boolean(parent && child && (parent === child || parent.contains(child)));
  } catch {
    return false;
  }
}

function eventElement(target = null) {
  if (!target) return null;
  return target.nodeType === 3 ? target.parentElement : target;
}

/* =========================================================
   DOM RESOLUTION
========================================================= */

function getTargetElement(value = null) {
  if (isEvent(value)) return eventElement(value.target);
  if (isElement(value)) return value;
  if (isElement(value?.target)) return value.target;
  if (isElement(value?.root)) return value.root;
  if (isElement(value?.trigger)) return value.trigger;
  if (isElement(value?.menu)) return value.menu;

  return null;
}

function resolveRoot(value = null) {
  if (!isBrowser()) return null;

  const target = getTargetElement(value);

  if (target) {
    const root = target.closest?.(SIDEBAR_SELECTORS.root);

    if (isElement(root)) return root;
  }

  return getSidebarRoot();
}

function getTrigger(root = null) {
  try {
    return root?.querySelector?.(TRIGGER_SELECTOR) || null;
  } catch {
    return null;
  }
}

function getMenu(root = null) {
  try {
    return root?.querySelector?.(MENU_SELECTOR) || null;
  } catch {
    return null;
  }
}

function isDisabledElement(node = null) {
  if (!isElement(node)) return true;

  return Boolean(
    node.hidden === true ||
      node.disabled === true ||
      node.getAttribute("aria-disabled") === "true" ||
      node.getAttribute("aria-hidden") === "true" ||
      node.closest?.("[hidden], [aria-hidden='true'], [aria-disabled='true'], [data-disabled='true']")
  );
}

function getFocusableItems(menu = null) {
  try {
    return Array.from(menu?.querySelectorAll?.(FOCUSABLE_SELECTOR) || [])
      .filter((node) => !isDisabledElement(node));
  } catch {
    return [];
  }
}

function focusNode(node = null) {
  if (isDisabledElement(node)) return false;

  try {
    node.focus({ preventScroll: true });
    return true;
  } catch {
    try {
      node.focus();
      return true;
    } catch {
      return false;
    }
  }
}

function focusFirstMenuItem(menu = null) {
  return focusNode(getFocusableItems(menu)[0] || null);
}

function focusTrigger(root = null) {
  return focusNode(getTrigger(root));
}

/* =========================================================
   SIDEBAR OPEN STATE
========================================================= */

function rootIsCollapsed(root = null) {
  if (!isElement(root)) return false;

  return Boolean(
    root.classList.contains("is-collapsed") ||
      root.dataset?.open === "false" ||
      root.dataset?.sidebarState === "collapsed" ||
      root.getAttribute("data-open") === "false" ||
      root.getAttribute("data-sidebar-state") === "collapsed"
  );
}

function ensureSidebarOpen(root = null, options = {}) {
  if (!isElement(root)) return false;

  if (!rootIsCollapsed(root) && getSidebarOpen() === true) {
    return true;
  }

  try {
    openRuntimeSidebar({
      root,
      AppCore: options.AppCore || null,
    });

    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   DROPDOWN STATE
========================================================= */

function isDropdownOpen(root = null) {
  const trigger = getTrigger(root);
  const menu = getMenu(root);

  return Boolean(
    root &&
      trigger &&
      menu &&
      trigger.getAttribute("aria-expanded") === "true" &&
      menu.hidden !== true
  );
}

function setRootDropdownState(root = null, open = false) {
  if (!isElement(root)) return false;

  const nextOpen = Boolean(open);

  try {
    if (nextOpen) {
      root.dataset.sidebarDropdownOpen = DROPDOWN_KEY;
      root.dataset.sidebarAccountDropdown = "open";
    } else {
      delete root.dataset.sidebarDropdownOpen;
      root.dataset.sidebarAccountDropdown = "closed";
    }

    root.classList.toggle(OPEN_CLASS, nextOpen);
    return true;
  } catch {
    return false;
  }
}

function setMenuItemsRole(menu = null) {
  if (!isElement(menu)) return false;

  try {
    menu.querySelectorAll(ITEM_SELECTOR).forEach((item) => {
      item.setAttribute("role", "menuitem");
    });

    return true;
  } catch {
    return false;
  }
}

function setDomState(root = null, open = false) {
  const trigger = getTrigger(root);
  const menu = getMenu(root);

  if (!isElement(root) || !isElement(trigger) || !isElement(menu)) {
    return false;
  }

  const nextOpen = Boolean(open);

  try {
    trigger.setAttribute("aria-haspopup", "menu");
    trigger.setAttribute("aria-expanded", nextOpen ? "true" : "false");
    trigger.dataset.sidebarDropdownState = nextOpen ? "open" : "closed";

    const menuId = text(menu.id, "");

    if (menuId) {
      trigger.setAttribute("aria-controls", menuId);
    }
  } catch {
    // noop
  }

  try {
    menu.hidden = !nextOpen;
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-hidden", nextOpen ? "false" : "true");
    menu.dataset.sidebarDropdownState = nextOpen ? "open" : "closed";
    menu.classList.toggle(MENU_OPEN_CLASS, nextOpen);
  } catch {
    // noop
  }

  setMenuItemsRole(menu);
  setRootDropdownState(root, nextOpen);

  return true;
}

function normalizeOptions(value = null, options = {}) {
  if (isEvent(value)) {
    return {
      ...options,
      event: value,
      target: eventElement(value.target),
    };
  }

  if (isElement(value)) {
    return {
      ...options,
      root: value,
      target: value,
    };
  }

  if (isObject(value)) {
    return {
      ...value,
      ...options,
    };
  }

  return isObject(options) ? options : {};
}

/* =========================================================
   GLOBAL HANDLERS
========================================================= */

function detachGlobalHandlers() {
  if (!isBrowser()) {
    activeRoot = null;
    documentPointerHandler = null;
    documentKeyHandler = null;
    return true;
  }

  try {
    if (documentPointerHandler) {
      document.removeEventListener("pointerdown", documentPointerHandler, true);
    }
  } catch {
    // noop
  }

  try {
    if (documentKeyHandler) {
      document.removeEventListener("keydown", documentKeyHandler);
    }
  } catch {
    // noop
  }

  activeRoot = null;
  documentPointerHandler = null;
  documentKeyHandler = null;

  return true;
}

function attachGlobalHandlers(root = null) {
  if (!isBrowser() || !isElement(root)) return false;

  if (activeRoot && activeRoot !== root) {
    closeDropdown({
      root: activeRoot,
      focus: false,
    });
  }

  if (activeRoot === root && documentPointerHandler && documentKeyHandler) {
    return true;
  }

  detachGlobalHandlers();

  documentPointerHandler = (event) => {
    const target = eventElement(event.target);

    if (contains(root, target)) return;

    closeDropdown({
      root,
      focus: false,
    });
  };

  documentKeyHandler = (event) => {
    if (event.key !== "Escape") return;

    event.preventDefault();

    closeDropdown({
      root,
      focus: true,
    });
  };

  try {
    document.addEventListener("pointerdown", documentPointerHandler, true);
    document.addEventListener("keydown", documentKeyHandler);
  } catch {
    detachGlobalHandlers();
    return false;
  }

  activeRoot = root;

  return true;
}

/* =========================================================
   A11Y
========================================================= */

export function syncDropdownA11y(value = null) {
  const root = resolveRoot(value);
  const trigger = getTrigger(root);
  const menu = getMenu(root);

  if (!isElement(root) || !isElement(trigger) || !isElement(menu)) {
    return {
      ok: false,
      enabled: false,
      open: false,
      reason: "dropdown-dom-missing",
    };
  }

  const open = isDropdownOpen(root);

  setDomState(root, open);

  return {
    ok: true,
    enabled: true,
    open,
    reason: "synced",
  };
}

/* =========================================================
   PUBLIC CONTROL
========================================================= */

export function setDropdownOpen(open = false, options = {}) {
  const opts = normalizeOptions(options);
  const root = resolveRoot(opts);

  if (!isElement(root)) return false;

  const nextOpen = Boolean(open);

  if (nextOpen) {
    ensureSidebarOpen(root, opts);
  }

  if (!setDomState(root, nextOpen)) return false;

  if (nextOpen) {
    attachGlobalHandlers(root);

    if (opts.focus === true) {
      focusFirstMenuItem(getMenu(root));
    }
  } else {
    if (activeRoot === root) {
      detachGlobalHandlers();
    }

    if (opts.focus === true) {
      focusTrigger(root);
    }
  }

  return true;
}

export function openDropdown(options = {}) {
  return setDropdownOpen(true, normalizeOptions(options));
}

export function closeDropdown(options = {}) {
  const opts = normalizeOptions(options);
  const root = resolveRoot(opts) || activeRoot;

  if (!isElement(root)) {
    detachGlobalHandlers();
    return true;
  }

  return setDropdownOpen(false, {
    ...opts,
    root,
  });
}

export function toggleDropdown(options = {}) {
  const opts = normalizeOptions(options);
  const root = resolveRoot(opts);

  if (!isElement(root)) return false;

  return setDropdownOpen(!isDropdownOpen(root), {
    ...opts,
    root,
  });
}

export function closeAllDropdowns() {
  if (activeRoot) {
    return closeDropdown({
      root: activeRoot,
      focus: false,
    });
  }

  detachGlobalHandlers();
  return true;
}

/* =========================================================
   BINDING
========================================================= */

export function bindSidebarDropdown(value = null) {
  const opts = normalizeOptions(value);
  const root = resolveRoot(opts);

  if (!isElement(root) || !isBrowser()) {
    return () => false;
  }

  boundRootOptions.set(root, opts);

  if (boundRoots.has(root)) {
    return boundRoots.get(root);
  }

  const onClick = (event) => {
    const target = eventElement(event.target);
    const trigger = target?.closest?.(TRIGGER_SELECTOR);
    const menu = getMenu(root);
    const rootOptions = boundRootOptions.get(root) || {};

    if (trigger && contains(root, trigger) && !isDisabledElement(trigger)) {
      event.preventDefault();
      event.stopPropagation();

      toggleDropdown({
        ...rootOptions,
        root,
        trigger,
        focus: true,
      });

      return;
    }

    const item = target?.closest?.(ITEM_SELECTOR);

    if (item && menu && contains(menu, item)) {
      closeDropdown({
        ...rootOptions,
        root,
        focus: false,
      });

      return;
    }

    if (
      isDropdownOpen(root) &&
      !contains(getTrigger(root), target) &&
      !contains(menu, target)
    ) {
      closeDropdown({
        ...rootOptions,
        root,
        focus: false,
      });
    }
  };

  try {
    root.addEventListener("click", onClick);
  } catch {
    boundRootOptions.delete(root);
    return () => false;
  }

  syncDropdownA11y(root);

  const cleanup = () => {
    try {
      root.removeEventListener("click", onClick);
    } catch {
      // noop
    }

    try {
      setDomState(root, false);
    } catch {
      // noop
    }

    if (activeRoot === root) {
      detachGlobalHandlers();
    }

    boundRoots.delete(root);
    boundRootOptions.delete(root);
    return true;
  };

  boundRoots.set(root, cleanup);

  return cleanup;
}

export const bind = bindSidebarDropdown;

export function unbindSidebarDropdown(value = null) {
  const root = resolveRoot(value);

  if (!isElement(root)) return false;

  const cleanup = boundRoots.get(root);

  if (!cleanup) return false;

  return cleanup();
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getDropdownSnapshot(value = null) {
  const root = resolveRoot(value);
  const trigger = getTrigger(root);
  const menu = getMenu(root);
  const open = isDropdownOpen(root);

  return {
    version: SIDEBAR_DROPDOWN_VERSION,

    enabled: Boolean(root && trigger && menu),
    open,
    bound: Boolean(root && boundRoots.has(root)),
    active: Boolean(root && activeRoot === root),

    hasRoot: Boolean(root),
    hasTrigger: Boolean(trigger),
    hasMenu: Boolean(menu),

    rootCollapsed: root ? rootIsCollapsed(root) : null,
    runtimeSidebarOpen: getSidebarOpen(),

    menuHidden: menu ? menu.hidden === true : null,
    triggerExpanded: trigger ? trigger.getAttribute("aria-expanded") : null,

    focusableItems: getFocusableItems(menu).length,

    policy: {
      dropdownOnly: true,
      opensSidebarBeforeDropdown: true,

      ownNavigation: false,
      ownLogout: false,
      ownAuth: false,
      ownRouter: false,
      ownDomCreate: false,
      ownPermissions: false,
      ownVisibility: false,
      ownTimers: false,
      ownEventsEmit: false,

      usesDomRootResolver: true,
      noLegacyRootSelectors: true,
      noRepairApi: true,

      closesOnOutsidePointer: true,
      closesOnEscape: true,
      closesWhenMenuItemClicked: true,
      doesNotHandleNavigationOrLogout: true,
    },
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  SIDEBAR_DROPDOWN_VERSION,

  syncDropdownA11y,
  setDropdownOpen,

  openDropdown,
  closeDropdown,
  closeAllDropdowns,
  toggleDropdown,

  bindSidebarDropdown,
  bind,
  unbindSidebarDropdown,

  getDropdownSnapshot,
};

/* =========================================================
   Onion Support - Sidebar Dropdown
   Archivo: /src/ui/sidebar/dropdown.js

   Responsabilidad:
   - Compat mínima del dropdown de usuario.
   - Sin imports.
   - Sin submódulos.
   - Sin shell repair.
   - Sin focus avanzado.
   - Sin CustomEvent.
   - Sin timers.
   - Sin magia negra.
   - El sidebar real vive en src/ui/sidebar/index.js.
========================================================= */

export const SIDEBAR_DROPDOWN_VERSION = "simple";

const SOURCE = "sidebar.dropdown";

const STATE_OPEN = "open";
const STATE_CLOSED = "closed";

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isFunction(value) {
  return typeof value === "function";
}

function text(value = "", fallback = "") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

function nowIso() {
  return new Date().toISOString();
}

function localStateOf(localState = null) {
  if (!isObject(localState)) {
    return {
      dropdownOpen: false,
    };
  }

  if (typeof localState.dropdownOpen !== "boolean") {
    localState.dropdownOpen = false;
  }

  return localState;
}

function emit(AppCore = null, eventName = "", payload = {}) {
  try {
    AppCore?.events?.emit?.(eventName, {
      source: SOURCE,
      version: SIDEBAR_DROPDOWN_VERSION,
      at: nowIso(),
      ...payload,
      token: null,
      accessToken: null,
      refreshToken: null,
    });

    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   DOM
========================================================= */

function query(selector = "", root = null) {
  if (!isBrowser() || !selector) return null;

  const scope = root || document;

  try {
    return scope.querySelector(selector);
  } catch {
    return null;
  }
}

function sidebarRoot(AppCore = null) {
  if (!isBrowser()) return null;

  return (
    AppCore?.dom?.sidebar ||
    AppCore?.dom?.sidebarRoot ||
    document.getElementById("app-sidebar") ||
    document.getElementById("sidebar") ||
    query("[data-sidebar-root]")
  );
}

function getToggle(AppCore = null) {
  const root = sidebarRoot(AppCore);

  return (
    AppCore?.dom?.userToggle ||
    query("[data-sidebar-user-toggle]", root) ||
    query("[data-user-toggle]", root) ||
    query("[aria-controls='userDropdown']", root) ||
    null
  );
}

function getDropdown(AppCore = null) {
  const root = sidebarRoot(AppCore);

  return (
    AppCore?.dom?.userDropdown ||
    query("[data-sidebar-user-dropdown]", root) ||
    query("[data-user-dropdown]", root) ||
    query("#userDropdown", root) ||
    query("#sidebarUserDropdown", root) ||
    null
  );
}

function getFooter(AppCore = null) {
  const root = sidebarRoot(AppCore);

  return (
    query("[data-sidebar-footer]", root) ||
    query(".sidebar-footer", root) ||
    null
  );
}

function setHidden(node = null, hidden = false) {
  if (!node) return false;

  try {
    node.hidden = Boolean(hidden);
    node.setAttribute("aria-hidden", hidden ? "true" : "false");
    return true;
  } catch {
    return false;
  }
}

function setData(node = null, key = "", value = "") {
  if (!node || !key) return false;

  try {
    if (value === null || value === undefined || value === "") {
      delete node.dataset[key];
    } else {
      node.dataset[key] = String(value);
    }

    return true;
  } catch {
    return false;
  }
}

function toggleClass(node = null, className = "", active = false) {
  if (!node || !className) return false;

  try {
    node.classList.toggle(className, Boolean(active));
    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   SHELL
========================================================= */

function shellHidden(AppCore = null) {
  const state = isObject(AppCore?.state) ? AppCore.state : {};
  const root = sidebarRoot(AppCore);

  return Boolean(
    state.chromeHidden ||
      state.shellHidden ||
      state.routeShellHidden ||
      state.authScreen ||
      state.routeMode === "auth" ||
      root?.hidden ||
      root?.getAttribute?.("aria-hidden") === "true"
  );
}

/* =========================================================
   SYNC
========================================================= */

export function syncDropdownA11y(AppCore = null, open = false) {
  const isOpen = Boolean(open);
  const toggle = getToggle(AppCore);
  const dropdown = getDropdown(AppCore);
  const root = sidebarRoot(AppCore);
  const footer = getFooter(AppCore);

  if (toggle) {
    try {
      toggle.setAttribute("aria-haspopup", "menu");
      toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");

      if (dropdown?.id) {
        toggle.setAttribute("aria-controls", dropdown.id);
      }

      toggle.dataset.state = isOpen ? STATE_OPEN : STATE_CLOSED;
      toggle.dataset.dropdownOpen = isOpen ? "true" : "false";
    } catch {
      // noop
    }
  }

  if (dropdown) {
    try {
      dropdown.setAttribute("role", "menu");
      dropdown.dataset.state = isOpen ? STATE_OPEN : STATE_CLOSED;
      dropdown.dataset.open = isOpen ? "true" : "false";
      setHidden(dropdown, !isOpen);
    } catch {
      // noop
    }
  }

  for (const node of [root, footer]) {
    toggleClass(node, "user-dropdown-open", isOpen);
    toggleClass(node, "has-user-dropdown-open", isOpen);
    setData(node, "userDropdownOpen", isOpen ? "true" : "false");
  }

  return {
    open: isOpen,
    hasToggle: Boolean(toggle),
    hasDropdown: Boolean(dropdown),
  };
}

export function setDropdownOpen(AppCore = null, localState = {}, value = false, options = {}) {
  const state = localStateOf(localState);
  const requestedOpen = Boolean(value);
  const previousOpen = Boolean(state.dropdownOpen);

  const blocked = requestedOpen && shellHidden(AppCore);
  const nextOpen = blocked ? false : requestedOpen;

  state.dropdownOpen = nextOpen;

  const result = syncDropdownA11y(AppCore, nextOpen);

  emit(AppCore, "sidebar:dropdown:change", {
    open: nextOpen,
    previousOpen,
    changed: previousOpen !== nextOpen,
    blocked,
    reason: options.reason || "set-dropdown-open",
    hasToggle: result.hasToggle,
    hasDropdown: result.hasDropdown,
  });

  return nextOpen;
}

export function openDropdown(AppCore = null, localState = {}, ensureSidebarOpenForUserMenu = null, options = {}) {
  if (shellHidden(AppCore)) {
    setDropdownOpen(AppCore, localState, false, {
      reason: "shell-hidden",
    });

    return false;
  }

  try {
    if (isFunction(ensureSidebarOpenForUserMenu)) {
      ensureSidebarOpenForUserMenu({
        reason: options.reason || "open-dropdown",
      });
    }
  } catch {
    // noop
  }

  return setDropdownOpen(AppCore, localState, true, {
    reason: options.reason || "open-dropdown",
  });
}

export function closeDropdown(AppCore = null, localState = {}, options = {}) {
  return setDropdownOpen(AppCore, localState, false, {
    reason: options.reason || "close-dropdown",
  });
}

export function toggleDropdown(AppCore = null, localState = {}, ensureSidebarOpenForUserMenu = null, options = {}) {
  const state = localStateOf(localState);

  if (state.dropdownOpen) {
    return closeDropdown(AppCore, state, {
      reason: options.reason || "toggle-dropdown:close",
    });
  }

  return openDropdown(AppCore, state, ensureSidebarOpenForUserMenu, {
    reason: options.reason || "toggle-dropdown:open",
  });
}

export function repairDropdown(AppCore = null, localState = {}, options = {}) {
  const state = localStateOf(localState);

  if (shellHidden(AppCore)) {
    state.dropdownOpen = false;
  }

  const result = syncDropdownA11y(AppCore, state.dropdownOpen);

  emit(AppCore, "sidebar:dropdown:repaired", {
    open: state.dropdownOpen,
    reason: options.reason || "repair-dropdown",
    hasToggle: result.hasToggle,
    hasDropdown: result.hasDropdown,
  });

  return result;
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getDropdownSnapshot(AppCore = null, localState = {}) {
  const state = localStateOf(localState);
  const toggle = getToggle(AppCore);
  const dropdown = getDropdown(AppCore);
  const root = sidebarRoot(AppCore);
  const footer = getFooter(AppCore);

  return {
    version: SIDEBAR_DROPDOWN_VERSION,

    open: Boolean(state.dropdownOpen),
    shellHidden: shellHidden(AppCore),

    hasToggle: Boolean(toggle),
    hasDropdown: Boolean(dropdown),
    hasSidebar: Boolean(root),
    hasFooter: Boolean(footer),

    toggle: {
      expanded: toggle?.getAttribute?.("aria-expanded") || "",
      state: toggle?.dataset?.state || "",
      dropdownOpen: toggle?.dataset?.dropdownOpen || "",
      hidden: Boolean(toggle?.hidden),
    },

    dropdown: {
      hidden: Boolean(dropdown?.hidden),
      ariaHidden: dropdown?.getAttribute?.("aria-hidden") || "",
      state: dropdown?.dataset?.state || "",
      open: dropdown?.dataset?.open || "",
    },

    policy: {
      compatOnly: true,
      noImports: true,
      noShellRepair: true,
      noFocusMagic: true,
      noCustomEvent: true,
      noTimers: true,
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
  toggleDropdown,

  repairDropdown,
  getDropdownSnapshot,
};

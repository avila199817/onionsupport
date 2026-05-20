/* =========================================================
   Onion Support - Sidebar DOM
   Archivo: /src/ui/sidebar/dom.js

   Responsabilidad:
   - Helpers DOM mínimos del sidebar.
   - Resolver mount/root real.
   - Priorizar root dentro de #sidebar-mount.
   - Montar/reemplazar sidebar dentro de #sidebar-mount.
   - Eliminar roots duplicados/stale tras cada montaje.
   - Ocultar/limpiar sidebar.
   - Sincronizar estado visual open/collapsed.
   - Cachear referencias básicas en AppCore.dom.
   - Cachear referencias estructurales del dropdown.
   - Cachear referencias diagnósticas de logo/avatar sin decidir lógica.
   - Sin Auth.
   - Sin Router.
   - Sin HTTP.
   - Sin Toast.
   - Sin template.
   - Sin eventos.
   - Sin comportamiento de dropdown.
   - Sin avatar logic.
   - Sin tooltips.
   - Sin fallback DOM.
   - Sin compat legacy innecesaria.
========================================================= */

import {
  SIDEBAR_CLASSES,
  SIDEBAR_MOUNT_ID,
  SIDEBAR_ROOT_ID,
  SIDEBAR_SELECTORS,
} from "./constants.js";

export const SIDEBAR_DOM_VERSION = "sidebar.dom.v6";

/* =========================================================
   BASICS
========================================================= */

export function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

export function isElement(value = null) {
  if (!value) return false;

  try {
    return value instanceof Element;
  } catch {
    return Boolean(
      value &&
        typeof value === "object" &&
        typeof value.querySelector === "function"
    );
  }
}

export function isConnected(value = null) {
  if (!isElement(value)) return false;

  try {
    return value.isConnected === true;
  } catch {
    try {
      return document.contains(value);
    } catch {
      return false;
    }
  }
}

export function text(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function scopeOf(scope = null) {
  if (!isBrowser()) return null;
  return isElement(scope) ? scope : document;
}

function matches(node = null, selector = "") {
  if (!isElement(node) || !selector) return false;

  try {
    return node.matches?.(selector) === true;
  } catch {
    return false;
  }
}

function uniqueElements(values = []) {
  return [...new Set(values.filter(isElement))];
}

/* =========================================================
   QUERY
========================================================= */

export function query(selector = "", scope = null) {
  const root = scopeOf(scope);

  if (!root || !selector) return null;

  try {
    if (isElement(root) && matches(root, selector)) {
      return root;
    }

    const node = root.querySelector(selector);
    return isElement(node) ? node : null;
  } catch {
    return null;
  }
}

export function queryAll(selector = "", scope = null) {
  const root = scopeOf(scope);

  if (!root || !selector) return [];

  try {
    const nodes = [...root.querySelectorAll(selector)].filter(isElement);

    if (isElement(root) && matches(root, selector)) {
      return [root, ...nodes.filter((node) => node !== root)];
    }

    return nodes;
  } catch {
    return [];
  }
}

export function byId(id = "") {
  if (!isBrowser() || !id) return null;

  try {
    const node = document.getElementById(id);
    return isElement(node) ? node : null;
  } catch {
    return null;
  }
}

/* =========================================================
   NODE MUTATION
========================================================= */

export function createElement(tag = "div", options = {}) {
  if (!isBrowser()) return null;

  const node = document.createElement(tag);
  const {
    className = "",
    textContent = "",
    attrs = {},
    dataset = {},
  } = options || {};

  if (className) {
    node.className = className;
  }

  if (textContent) {
    node.textContent = textContent;
  }

  for (const [key, value] of Object.entries(attrs || {})) {
    if (!key) continue;
    if (value === false || value === null || value === undefined) continue;

    try {
      node.setAttribute(key, String(value));
    } catch {
      // noop
    }
  }

  for (const [key, value] of Object.entries(dataset || {})) {
    if (!key) continue;
    if (value === false || value === null || value === undefined) continue;

    try {
      node.dataset[key] = String(value);
    } catch {
      // noop
    }
  }

  return node;
}

export function clearNode(node = null) {
  if (!isElement(node)) return false;

  try {
    node.replaceChildren();
    return true;
  } catch {
    try {
      node.textContent = "";
      return true;
    } catch {
      return false;
    }
  }
}

export function setHidden(node = null, hidden = false) {
  if (!isElement(node)) return false;

  const value = Boolean(hidden);

  try {
    node.hidden = value;
    node.setAttribute("aria-hidden", value ? "true" : "false");
    node.setAttribute("aria-busy", "false");

    if (SIDEBAR_CLASSES.hidden) {
      node.classList.toggle(SIDEBAR_CLASSES.hidden, value);
    }

    return true;
  } catch {
    return false;
  }
}

export function setDataset(node = null, key = "", value = "") {
  if (!isElement(node) || !key) return false;

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

export function setClass(node = null, className = "", enabled = false) {
  if (!isElement(node) || !className) return false;

  try {
    node.classList.toggle(className, Boolean(enabled));
    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   SIDEBAR ROOT / MOUNT
========================================================= */

export function isSidebarRoot(node = null) {
  if (!isElement(node)) return false;

  return Boolean(
    node.id === SIDEBAR_ROOT_ID ||
      node.dataset?.sidebarRoot === "true" ||
      matches(node, SIDEBAR_SELECTORS.root) ||
      matches(node, `.${SIDEBAR_CLASSES.root}`)
  );
}

export function getSidebarMount() {
  if (!isBrowser()) return null;

  return (
    byId(SIDEBAR_MOUNT_ID) ||
    query("[data-sidebar-mount='true']") ||
    query("[data-sidebar-mount]") ||
    null
  );
}

export function getSidebarRootFromMount(mount = null) {
  if (!isElement(mount)) return null;
  if (isSidebarRoot(mount)) return mount;

  return (
    query(SIDEBAR_SELECTORS.root, mount) ||
    query("[data-sidebar-root]", mount) ||
    null
  );
}

export function getSidebarRoot(scope = null) {
  if (!isBrowser()) return null;

  if (isElement(scope)) {
    return (
      getSidebarRootFromMount(scope) ||
      query(SIDEBAR_SELECTORS.root, scope) ||
      query("[data-sidebar-root]", scope) ||
      null
    );
  }

  const mount = getSidebarMount();
  const mountedRoot = getSidebarRootFromMount(mount);

  return (
    mountedRoot ||
    byId(SIDEBAR_ROOT_ID) ||
    query(SIDEBAR_SELECTORS.root) ||
    query("[data-sidebar-root]") ||
    null
  );
}

export function getAllSidebarRoots() {
  if (!isBrowser()) return [];

  return uniqueElements([
    ...queryAll(SIDEBAR_SELECTORS.root),
    ...queryAll("[data-sidebar-root]"),
    byId(SIDEBAR_ROOT_ID),
  ]);
}

export function removeDuplicateSidebarRoots(primary = null) {
  if (!isElement(primary)) return false;

  let changed = false;

  for (const node of getAllSidebarRoots()) {
    if (node === primary) continue;

    try {
      node.remove();
      changed = true;
    } catch {
      // noop
    }
  }

  return changed;
}

/* =========================================================
   MOUNT OPERATIONS
========================================================= */

function prepareSidebarRoot(root = null) {
  if (!isElement(root)) return null;

  try {
    root.id = SIDEBAR_ROOT_ID;
    root.dataset.sidebarRoot = "true";

    if (SIDEBAR_CLASSES.root) {
      root.classList.add(SIDEBAR_CLASSES.root);
    }

    if (SIDEBAR_CLASSES.appRoot) {
      root.classList.add(SIDEBAR_CLASSES.appRoot);
    }

    setHidden(root, false);

    return root;
  } catch {
    return null;
  }
}

export function mountSidebarRoot(nextRoot = null) {
  if (!isBrowser() || !isElement(nextRoot)) return null;

  const mount = getSidebarMount();

  if (!isElement(mount)) return null;

  const root = prepareSidebarRoot(nextRoot);

  if (!root) return null;

  try {
    removeDuplicateSidebarRoots(root);

    mount.replaceChildren(root);

    removeDuplicateSidebarRoots(root);

    return root;
  } catch {
    return null;
  }
}

export function hideSidebarRoot(root = getSidebarRoot()) {
  if (!isElement(root)) return false;

  setHidden(root, true);
  clearNode(root);

  return true;
}

export function removeSidebarRoot(root = getSidebarRoot()) {
  if (!isElement(root)) return false;

  try {
    root.remove();
    return true;
  } catch {
    return false;
  }
}

export function setSidebarOpenState(root = getSidebarRoot(), open = true) {
  if (!isElement(root)) return false;

  const value = Boolean(open);

  try {
    root.dataset.open = value ? "true" : "false";
    root.dataset.sidebarState = value ? "open" : "collapsed";

    if (SIDEBAR_CLASSES.open) {
      root.classList.toggle(SIDEBAR_CLASSES.open, value);
    }

    if (SIDEBAR_CLASSES.collapsed) {
      root.classList.toggle(SIDEBAR_CLASSES.collapsed, !value);
    }

    const toggle = query(SIDEBAR_SELECTORS.toggle, root);

    if (toggle) {
      toggle.setAttribute("aria-expanded", value ? "true" : "false");
      toggle.setAttribute(
        "aria-label",
        value ? "Cerrar barra lateral" : "Abrir barra lateral"
      );
      toggle.dataset.state = value ? "open" : "collapsed";

      const label = query(".sidebar-toggle-label", toggle);

      if (label) {
        label.textContent = value ? "Cerrar barra lateral" : "Abrir barra lateral";
      }
    }

    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   SIDEBAR REFS
========================================================= */

export function getSidebarRefs(root = getSidebarRoot()) {
  const sidebar = isElement(root) ? root : getSidebarRoot();

  const brandLogo = sidebar
    ? query("[data-sidebar-brand-logo]", sidebar)
    : null;

  const brandLogoImg = sidebar
    ? query("[data-sidebar-brand-logo-img]", sidebar)
    : null;

  const userAvatar = sidebar
    ? query("[data-sidebar-user-avatar]", sidebar)
    : null;

  const userAvatarImg = sidebar
    ? query("[data-sidebar-avatar-img]", sidebar)
    : null;

  const userAvatarFallback = sidebar
    ? query("[data-sidebar-avatar-fallback]", sidebar)
    : null;

  return {
    root: sidebar,

    header: sidebar ? query(SIDEBAR_SELECTORS.header, sidebar) : null,
    nav: sidebar ? query(SIDEBAR_SELECTORS.nav, sidebar) : null,
    footer: sidebar ? query(SIDEBAR_SELECTORS.footer, sidebar) : null,
    user: sidebar ? query(SIDEBAR_SELECTORS.user, sidebar) : null,

    brand: sidebar ? query(SIDEBAR_SELECTORS.brand, sidebar) : null,
    brandLogo,
    brandLogoImg,

    toggle: sidebar ? query(SIDEBAR_SELECTORS.toggle, sidebar) : null,
    logout: sidebar ? query(SIDEBAR_SELECTORS.logout, sidebar) : null,

    userAvatar,
    userAvatarImg,
    userAvatarFallback,

    dropdown: sidebar ? query(SIDEBAR_SELECTORS.accountDropdown, sidebar) : null,
    dropdownTrigger: sidebar ? query(SIDEBAR_SELECTORS.accountTrigger, sidebar) : null,
    dropdownMenu: sidebar ? query(SIDEBAR_SELECTORS.accountMenu, sidebar) : null,
    dropdownItems: sidebar ? queryAll(SIDEBAR_SELECTORS.dropdownItem, sidebar) : [],

    links: sidebar ? queryAll(SIDEBAR_SELECTORS.link, sidebar) : [],
    navLinks: sidebar ? queryAll(SIDEBAR_SELECTORS.navLink, sidebar) : [],
  };
}

function ensureDomBag(AppCore = null) {
  if (!AppCore || typeof AppCore !== "object") return null;

  try {
    AppCore.dom =
      AppCore.dom && typeof AppCore.dom === "object" ? AppCore.dom : {};

    return AppCore.dom;
  } catch {
    return null;
  }
}

export function cacheSidebarDom(AppCore = null, root = getSidebarRoot()) {
  const dom = ensureDomBag(AppCore);

  if (!dom) return null;

  const refs = getSidebarRefs(root);

  try {
    dom.sidebar = refs.root;
    dom.sidebarRoot = refs.root;
    dom.sidebarMount = getSidebarMount();

    dom.sidebarHeader = refs.header;
    dom.sidebarNav = refs.nav;
    dom.sidebarFooter = refs.footer;
    dom.sidebarUser = refs.user;
    dom.sidebarBrand = refs.brand;
    dom.sidebarBrandLogo = refs.brandLogo;
    dom.sidebarBrandLogoImg = refs.brandLogoImg;
    dom.sidebarToggle = refs.toggle;
    dom.sidebarLogout = refs.logout;

    dom.sidebarUserAvatar = refs.userAvatar;
    dom.sidebarUserAvatarImg = refs.userAvatarImg;
    dom.sidebarUserAvatarFallback = refs.userAvatarFallback;

    dom.sidebarDropdown = refs.dropdown;
    dom.sidebarDropdownTrigger = refs.dropdownTrigger;
    dom.sidebarDropdownMenu = refs.dropdownMenu;
    dom.sidebarDropdownItems = refs.dropdownItems;

    dom.__sidebarDomVersion = SIDEBAR_DOM_VERSION;
  } catch {
    // noop
  }

  return refs;
}

export function clearSidebarDomCache(AppCore = null) {
  const dom = ensureDomBag(AppCore);

  if (!dom) return false;

  try {
    delete dom.sidebar;
    delete dom.sidebarRoot;
    delete dom.sidebarMount;

    delete dom.sidebarHeader;
    delete dom.sidebarNav;
    delete dom.sidebarFooter;
    delete dom.sidebarUser;
    delete dom.sidebarBrand;
    delete dom.sidebarBrandLogo;
    delete dom.sidebarBrandLogoImg;
    delete dom.sidebarToggle;
    delete dom.sidebarLogout;

    delete dom.sidebarUserAvatar;
    delete dom.sidebarUserAvatarImg;
    delete dom.sidebarUserAvatarFallback;

    delete dom.sidebarDropdown;
    delete dom.sidebarDropdownTrigger;
    delete dom.sidebarDropdownMenu;
    delete dom.sidebarDropdownItems;

    delete dom.__sidebarDomVersion;

    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   ACTIVE LINK
========================================================= */

export function setActiveLink(link = null, active = false) {
  if (!isElement(link)) return false;

  const value = Boolean(active);

  try {
    if (SIDEBAR_CLASSES.active) {
      link.classList.toggle(SIDEBAR_CLASSES.active, value);
    }

    link.dataset.active = value ? "true" : "false";

    if (value) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }

    return true;
  } catch {
    return false;
  }
}

export function clearActiveLinks(root = getSidebarRoot()) {
  const refs = getSidebarRefs(root);

  for (const link of refs.navLinks) {
    setActiveLink(link, false);
  }

  return true;
}

/* =========================================================
   FOCUS HELPERS
========================================================= */

export function blurInside(root = null) {
  if (!isBrowser() || !isElement(root)) return false;

  try {
    const active = document.activeElement;

    if (active && active !== document.body && root.contains(active)) {
      active.blur();
      return true;
    }
  } catch {
    // noop
  }

  return false;
}

export function focusFirst(root = null) {
  if (!isElement(root)) return false;

  const target = query(
    "a[href], button:not([disabled]), [tabindex]:not([tabindex='-1'])",
    root
  );

  if (!target) return false;

  try {
    target.focus({ preventScroll: true });
    return true;
  } catch {
    try {
      target.focus();
      return true;
    } catch {
      return false;
    }
  }
}

/* =========================================================
   SNAPSHOT
========================================================= */

function nodeSnapshot(node = null) {
  if (!isElement(node)) {
    return {
      exists: false,
    };
  }

  return {
    exists: true,
    id: node.id || "",
    tag: node.tagName?.toLowerCase?.() || "",
    hidden: Boolean(node.hidden),
    ariaHidden: node.getAttribute("aria-hidden") || "",
    ariaBusy: node.getAttribute("aria-busy") || "",
    className: text(node.className, ""),
  };
}

function imageSnapshot(img = null) {
  if (!isElement(img)) {
    return {
      exists: false,
      hasSrc: false,
    };
  }

  return {
    exists: true,
    hasSrc: Boolean(img.getAttribute("src")),
    hidden: Boolean(img.hidden),
    loading: img.getAttribute("loading") || "",
    decoding: img.getAttribute("decoding") || "",
  };
}

export function getSidebarDomSnapshot(root = getSidebarRoot()) {
  const refs = getSidebarRefs(root);

  return {
    version: SIDEBAR_DOM_VERSION,

    hasDocument: isBrowser(),
    mounted: isConnected(refs.root),

    root: nodeSnapshot(refs.root),
    mount: nodeSnapshot(getSidebarMount()),

    parts: {
      header: nodeSnapshot(refs.header),
      nav: nodeSnapshot(refs.nav),
      footer: nodeSnapshot(refs.footer),
      user: nodeSnapshot(refs.user),
      brand: nodeSnapshot(refs.brand),
      brandLogo: nodeSnapshot(refs.brandLogo),
      brandLogoImg: imageSnapshot(refs.brandLogoImg),
      toggle: nodeSnapshot(refs.toggle),
      logout: nodeSnapshot(refs.logout),

      userAvatar: nodeSnapshot(refs.userAvatar),
      userAvatarImg: imageSnapshot(refs.userAvatarImg),
      userAvatarFallback: nodeSnapshot(refs.userAvatarFallback),

      dropdown: nodeSnapshot(refs.dropdown),
      dropdownTrigger: nodeSnapshot(refs.dropdownTrigger),
      dropdownMenu: nodeSnapshot(refs.dropdownMenu),
    },

    counts: {
      links: refs.links.length,
      navLinks: refs.navLinks.length,
      dropdownItems: refs.dropdownItems.length,
    },

    policy: {
      domOnly: true,
      realMountOnly: true,
      prioritizesMountRoot: true,
      replacesMountChildren: true,
      removesDuplicateRoots: true,

      cachesLogoRefs: true,
      cachesAvatarRefsForDiagnosticsOnly: true,
      noAvatarLogic: true,

      noAuth: true,
      noRouter: true,
      noHttp: true,
      noToast: true,
      noTemplate: true,
      noEvents: true,
      noDropdownBehavior: true,
      noTooltips: true,
      noFallbackDom: true,
    },
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  SIDEBAR_DOM_VERSION,

  isBrowser,
  isElement,
  isConnected,
  text,

  query,
  queryAll,
  byId,

  createElement,
  clearNode,
  setHidden,
  setDataset,
  setClass,

  isSidebarRoot,
  getSidebarMount,
  getSidebarRoot,
  getSidebarRootFromMount,
  getAllSidebarRoots,
  removeDuplicateSidebarRoots,

  mountSidebarRoot,
  hideSidebarRoot,
  removeSidebarRoot,
  setSidebarOpenState,

  getSidebarRefs,
  cacheSidebarDom,
  clearSidebarDomCache,

  setActiveLink,
  clearActiveLinks,

  blurInside,
  focusFirst,

  getSidebarDomSnapshot,
};

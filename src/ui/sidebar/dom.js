/* =========================================================
   Onion Support - Sidebar DOM
   Archivo: /src/ui/sidebar/dom.js

   Responsabilidad:
   - Helpers DOM mínimos del sidebar.
   - Resolver mount/root.
   - Montar/reemplazar sidebar.
   - Ocultar/limpiar sidebar.
   - Cachear referencias básicas en AppCore.dom.
   - Sin Auth.
   - Sin Router.
   - Sin HTTP.
   - Sin Toast.
   - Sin template.
   - Sin eventos.
   - Sin dropdown.
   - Sin tooltips.
   - Sin compat legacy innecesaria.
========================================================= */

import {
  SIDEBAR_CLASSES,
  SIDEBAR_MOUNT_ID,
  SIDEBAR_ROOT_ID,
  SIDEBAR_SELECTORS,
} from "./constants.js";

export const SIDEBAR_DOM_VERSION = "sidebar.dom.v1";

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
  const output = String(value ?? "").trim();
  return output || fallback;
}

/* =========================================================
   QUERY
========================================================= */

export function query(selector = "", scope = null) {
  if (!isBrowser() || !selector) return null;

  const root = isConnected(scope) ? scope : document;

  try {
    const node = root.querySelector(selector);
    return isConnected(node) ? node : null;
  } catch {
    return null;
  }
}

export function queryAll(selector = "", scope = null) {
  if (!isBrowser() || !selector) return [];

  const root = isConnected(scope) ? scope : document;

  try {
    return [...root.querySelectorAll(selector)].filter(isConnected);
  } catch {
    return [];
  }
}

export function byId(id = "") {
  if (!isBrowser() || !id) return null;

  try {
    const node = document.getElementById(id);
    return isConnected(node) ? node : null;
  } catch {
    return null;
  }
}

/* =========================================================
   NODE MUTATION
========================================================= */

export function createElement(tag = "div", options = {}) {
  const node = document.createElement(tag);
  const {
    className = "",
    textContent = "",
    attrs = {},
    dataset = {},
  } = options || {};

  if (className) node.className = className;
  if (textContent) node.textContent = textContent;

  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === false || value === null || value === undefined) continue;
    node.setAttribute(key, String(value));
  }

  for (const [key, value] of Object.entries(dataset || {})) {
    if (value === false || value === null || value === undefined) continue;
    node.dataset[key] = String(value);
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
    node.classList.toggle(SIDEBAR_CLASSES.hidden, value);
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
      node.matches?.(`.${SIDEBAR_CLASSES.root}`)
  );
}

export function getSidebarMount() {
  if (!isBrowser()) return null;

  return (
    byId(SIDEBAR_MOUNT_ID) ||
    query("[data-sidebar-mount]") ||
    byId(SIDEBAR_ROOT_ID) ||
    query("[data-sidebar-root]")
  );
}

export function getSidebarRoot(scope = null) {
  if (!isBrowser()) return null;

  const scopedRoot = isConnected(scope)
    ? query(SIDEBAR_SELECTORS.root, scope)
    : null;

  return (
    scopedRoot ||
    byId(SIDEBAR_ROOT_ID) ||
    query("[data-sidebar-root]") ||
    null
  );
}

export function getSidebarRootFromMount(mount = null) {
  if (!isElement(mount)) return null;

  if (isSidebarRoot(mount)) return mount;

  return query(SIDEBAR_SELECTORS.root, mount);
}

export function getAllSidebarRoots() {
  if (!isBrowser()) return [];

  return queryAll(SIDEBAR_SELECTORS.root);
}

export function removeDuplicateSidebarRoots(primary = null) {
  if (!isBrowser() || !isElement(primary)) return false;

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

export function mountSidebarRoot(nextRoot = null) {
  if (!isBrowser() || !isElement(nextRoot)) return null;

  const mount = getSidebarMount();

  if (!mount) return null;

  try {
    if (isSidebarRoot(mount)) {
      mount.replaceWith(nextRoot);
    } else {
      mount.replaceChildren(nextRoot);
    }

    nextRoot.id = nextRoot.id || SIDEBAR_ROOT_ID;
    nextRoot.dataset.sidebarRoot = "true";
    nextRoot.classList.add(SIDEBAR_CLASSES.root, SIDEBAR_CLASSES.appRoot);
    nextRoot.hidden = false;
    nextRoot.setAttribute("aria-hidden", "false");

    removeDuplicateSidebarRoots(nextRoot);

    return nextRoot;
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

  root.dataset.open = value ? "true" : "false";
  root.classList.toggle(SIDEBAR_CLASSES.open, value);
  root.classList.toggle(SIDEBAR_CLASSES.collapsed, !value);

  const toggle = query(SIDEBAR_SELECTORS.toggle, root);

  if (toggle) {
    toggle.setAttribute("aria-expanded", value ? "true" : "false");
    toggle.setAttribute(
      "aria-label",
      value ? "Cerrar navegación" : "Abrir navegación"
    );
  }

  return true;
}

/* =========================================================
   SIDEBAR REFS
========================================================= */

export function getSidebarRefs(root = getSidebarRoot()) {
  const sidebar = isElement(root) ? root : getSidebarRoot();

  return {
    root: sidebar,
    header: query(SIDEBAR_SELECTORS.header, sidebar),
    nav: query(SIDEBAR_SELECTORS.nav, sidebar),
    footer: query(SIDEBAR_SELECTORS.footer, sidebar),
    user: query(SIDEBAR_SELECTORS.user, sidebar),
    brand: query(SIDEBAR_SELECTORS.brand, sidebar),
    toggle: query(SIDEBAR_SELECTORS.toggle, sidebar),
    logout: query(SIDEBAR_SELECTORS.logout, sidebar),
    links: queryAll(SIDEBAR_SELECTORS.link, sidebar),
    navLinks: queryAll(SIDEBAR_SELECTORS.navLink, sidebar),
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
    dom.sidebarToggle = refs.toggle;
    dom.sidebarLogout = refs.logout;

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
    delete dom.sidebarToggle;
    delete dom.sidebarLogout;
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
    link.classList.toggle(SIDEBAR_CLASSES.active, value);
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
   FOCUS
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
    return false;
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
    className: text(node.className, ""),
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
      toggle: nodeSnapshot(refs.toggle),
      logout: nodeSnapshot(refs.logout),
    },
    counts: {
      links: refs.links.length,
      navLinks: refs.navLinks.length,
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

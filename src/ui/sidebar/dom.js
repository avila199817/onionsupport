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
   - Hacer mutaciones DOM idempotentes cuando sea posible.
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

export const SIDEBAR_DOM_VERSION = "sidebar.dom.v8.idempotent-writes";

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
   IDEMPOTENT MUTATION HELPERS
========================================================= */

function setAttributeIfChanged(node = null, name = "", value = "") {
  if (!isElement(node) || !name) return false;

  const next = String(value ?? "");

  try {
    if (node.getAttribute(name) === next) return false;

    node.setAttribute(name, next);
    return true;
  } catch {
    return false;
  }
}

function removeAttributeIfPresent(node = null, name = "") {
  if (!isElement(node) || !name) return false;

  try {
    if (!node.hasAttribute(name)) return false;

    node.removeAttribute(name);
    return true;
  } catch {
    return false;
  }
}

function setTextIfChanged(node = null, value = "") {
  if (!isElement(node)) return false;

  const next = String(value ?? "");

  try {
    if (node.textContent === next) return false;

    node.textContent = next;
    return true;
  } catch {
    return false;
  }
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
    node.className = String(className);
  }

  if (textContent) {
    node.textContent = String(textContent);
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
    if (!node.childNodes.length && !node.textContent) {
      return false;
    }

    node.replaceChildren();
    return true;
  } catch {
    try {
      if (!node.textContent) return false;

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
  let changed = false;

  try {
    if (node.hidden !== value) {
      node.hidden = value;
      changed = true;
    }

    changed = setAttributeIfChanged(node, "aria-hidden", value ? "true" : "false") || changed;
    changed = setAttributeIfChanged(node, "aria-busy", "false") || changed;

    if (SIDEBAR_CLASSES.hidden) {
      const hasClass = node.classList.contains(SIDEBAR_CLASSES.hidden);

      if (hasClass !== value) {
        node.classList.toggle(SIDEBAR_CLASSES.hidden, value);
        changed = true;
      }
    }

    return changed;
  } catch {
    return false;
  }
}

export function setDataset(node = null, key = "", value = "") {
  if (!isElement(node) || !key) return false;

  try {
    if (value === null || value === undefined || value === "") {
      if (!Object.prototype.hasOwnProperty.call(node.dataset, key)) {
        return false;
      }

      delete node.dataset[key];
      return true;
    }

    const next = String(value);

    if (node.dataset[key] === next) return false;

    node.dataset[key] = next;
    return true;
  } catch {
    return false;
  }
}

export function setClass(node = null, className = "", enabled = false) {
  if (!isElement(node) || !className) return false;

  try {
    const value = Boolean(enabled);

    if (node.classList.contains(className) === value) {
      return false;
    }

    node.classList.toggle(className, value);
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
    if (root.id !== SIDEBAR_ROOT_ID) {
      root.id = SIDEBAR_ROOT_ID;
    }

    if (root.dataset.sidebarRoot !== "true") {
      root.dataset.sidebarRoot = "true";
    }

    if (SIDEBAR_CLASSES.root && !root.classList.contains(SIDEBAR_CLASSES.root)) {
      root.classList.add(SIDEBAR_CLASSES.root);
    }

    if (SIDEBAR_CLASSES.appRoot && !root.classList.contains(SIDEBAR_CLASSES.appRoot)) {
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
    /*
      Limpieza previa:
      elimina roots antiguos que estén fuera del nuevo árbol antes de sustituir.
    */
    removeDuplicateSidebarRoots(root);

    if (
      mount.childNodes.length !== 1 ||
      mount.firstElementChild !== root
    ) {
      mount.replaceChildren(root);
    }

    /*
      Limpieza posterior:
      garantiza root único tras el montaje real.
    */
    removeDuplicateSidebarRoots(root);

    return root;
  } catch {
    return null;
  }
}

export function hideSidebarRoot(root = getSidebarRoot()) {
  if (!isElement(root)) return false;

  const hiddenChanged = setHidden(root, true);
  const cleared = clearNode(root);

  return hiddenChanged || cleared;
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
  let changed = false;

  try {
    changed = setDataset(root, "open", value ? "true" : "false") || changed;
    changed = setDataset(root, "sidebarState", value ? "open" : "collapsed") || changed;

    changed = setClass(root, SIDEBAR_CLASSES.open, value) || changed;
    changed = setClass(root, SIDEBAR_CLASSES.collapsed, !value) || changed;

    const toggle = query(SIDEBAR_SELECTORS.toggle, root);

    if (toggle) {
      const labelText = value ? "Cerrar barra lateral" : "Abrir barra lateral";

      changed = setAttributeIfChanged(toggle, "aria-expanded", value ? "true" : "false") || changed;
      changed = setAttributeIfChanged(toggle, "aria-label", labelText) || changed;
      changed = setDataset(toggle, "state", value ? "open" : "collapsed") || changed;

      const label = query(".sidebar-toggle-label", toggle);

      if (label) {
        changed = setTextIfChanged(label, labelText) || changed;
      }
    }

    return changed;
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
  let changed = false;

  try {
    changed = setClass(link, SIDEBAR_CLASSES.active, value) || changed;
    changed = setDataset(link, "active", value ? "true" : "false") || changed;

    if (value) {
      changed = setAttributeIfChanged(link, "aria-current", "page") || changed;
    } else {
      changed = removeAttributeIfPresent(link, "aria-current") || changed;
    }

    return changed;
  } catch {
    return false;
  }
}

export function clearActiveLinks(root = getSidebarRoot()) {
  const refs = getSidebarRefs(root);

  let changed = false;

  for (const link of refs.navLinks) {
    changed = setActiveLink(link, false) || changed;
  }

  return changed;
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

      idempotentHiddenWrites: true,
      idempotentDatasetWrites: true,
      idempotentClassWrites: true,
      idempotentOpenStateWrites: true,

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

      snapshotRedacted: true,
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

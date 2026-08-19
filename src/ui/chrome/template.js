/* =========================================================
   Onion Support - App Chrome Template
   Archivo: /src/ui/chrome/template.js

   APP CHROME TEMPLATE V2

   Responsabilidad:
   - Mantener un único root visual para Topbar + Sidebar.
   - Preparar los mounts antes de que main.js pinte la UI.
   - Crear el backdrop y el único trigger móvil del Topbar.
   - Exponer refs y estado ARIA/visual idempotente.
   - Sin Router, Auth, HTTP, Store ni lógica de dominio.
========================================================= */

export const APP_CHROME_TEMPLATE_VERSION =
  "app-chrome.template.v2-single-layout-authority";

const SELECTOR = Object.freeze({
  shell: "#app-shell, [data-app-shell='true']",
  chrome: "#app-chrome, [data-app-chrome='true']",
  sidebarMount: "#sidebar-mount, [data-sidebar-mount='true']",
  topbarMount: "#topbar-mount, [data-topbar-mount='true']",
  sidebar: "#app-sidebar, [data-sidebar-root='true']",
  topbar: "#app-topbar, [data-topbar-root='true']",
  toggle: "[data-topbar-menu-toggle='true']",
  backdrop: "[data-app-chrome-backdrop='true']",
});

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function query(selector = "", root = null) {
  if (!isBrowser() || !selector) return null;

  try {
    return (root || document).querySelector(selector);
  } catch {
    return null;
  }
}

function el(tag = "div", className = "", attrs = {}) {
  const node = document.createElement(tag);
  if (className) node.className = className;

  for (const [name, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    node.setAttribute(name, value === true ? "true" : String(value));
  }

  return node;
}

function setAttr(node, name, value) {
  if (!node || !name) return false;
  const next = String(value);
  if (node.getAttribute(name) === next) return false;
  node.setAttribute(name, next);
  return true;
}

function setData(node, name, value) {
  if (!node?.dataset || !name) return false;
  const next = String(value);
  if (node.dataset[name] === next) return false;
  node.dataset[name] = next;
  return true;
}

function setHidden(node, hidden = false) {
  if (!node) return false;
  const next = hidden === true;
  if (node.hidden === next) return false;
  node.hidden = next;
  return true;
}

function createChromeRoot() {
  return el("div", "app-chrome", {
    id: "app-chrome",
    "data-app-chrome": "true",
    "data-chrome-version": APP_CHROME_TEMPLATE_VERSION,
    "data-navigation-state": "closed",
    "aria-hidden": "false",
  });
}

function createBackdrop() {
  return el("div", "app-chrome-backdrop", {
    "aria-hidden": "true",
    "data-app-chrome-backdrop": "true",
    "data-state": "closed",
  });
}

function createMenuToggle() {
  const button = el("button", "topbar-menu-toggle", {
    type: "button",
    hidden: "true",
    "aria-label": "Abrir navegación",
    "aria-controls": "app-sidebar",
    "aria-expanded": "false",
    "aria-hidden": "true",
    "data-topbar-menu-toggle": "true",
    "data-mobile-nav-trigger": "true",
    "data-state": "closed",
  });

  const icon = el("span", "topbar-menu-toggle-icon", {
    "aria-hidden": "true",
    "data-topbar-menu-toggle-icon": "true",
  });

  for (let index = 1; index <= 3; index += 1) {
    icon.appendChild(
      el("span", "topbar-menu-toggle-line", {
        "data-topbar-menu-toggle-line": String(index),
      })
    );
  }

  button.hidden = true;
  button.appendChild(icon);
  return button;
}

function ensureRoot() {
  const shell = query(SELECTOR.shell);
  if (!shell) return null;

  let chrome = query(SELECTOR.chrome, shell);
  if (!chrome) {
    chrome = createChromeRoot();
    const main = query("#main-content, [data-main-content='true']", shell);
    shell.insertBefore(chrome, main || null);
  }

  setData(chrome, "chromeVersion", APP_CHROME_TEMPLATE_VERSION);
  return chrome;
}

function ensureMounts(chrome) {
  if (!chrome) return false;

  const topbarMount = query(SELECTOR.topbarMount);
  const sidebarMount = query(SELECTOR.sidebarMount);

  /*
    Este módulo carga antes de main.js. Los mounts todavía están vacíos,
    por lo que se agrupan una sola vez antes del primer render visual.
  */
  if (topbarMount && topbarMount.parentElement !== chrome) {
    chrome.appendChild(topbarMount);
  }

  let backdrop = query(SELECTOR.backdrop, chrome);
  if (!backdrop) {
    backdrop = createBackdrop();
    chrome.appendChild(backdrop);
  }

  if (sidebarMount && sidebarMount.parentElement !== chrome) {
    chrome.appendChild(sidebarMount);
  }

  return true;
}

function ensureToggle(chrome) {
  const topbar = query(SELECTOR.topbar, chrome || document);
  if (!topbar) return null;

  let toggle = query(SELECTOR.toggle, topbar);
  if (!toggle) {
    toggle = createMenuToggle();
    topbar.insertBefore(toggle, topbar.firstChild || null);
  }

  return toggle;
}

export function getAppChromeTemplateRefs(root = null) {
  if (!isBrowser()) {
    return Object.freeze({
      chrome: null,
      sidebarMount: null,
      sidebar: null,
      topbarMount: null,
      topbar: null,
      menuToggle: null,
      backdrop: null,
    });
  }

  const chrome =
    root?.matches?.(SELECTOR.chrome)
      ? root
      : query(SELECTOR.chrome);

  return {
    chrome,
    sidebarMount: query(SELECTOR.sidebarMount, chrome || document),
    sidebar: query(SELECTOR.sidebar, chrome || document),
    topbarMount: query(SELECTOR.topbarMount, chrome || document),
    topbar: query(SELECTOR.topbar, chrome || document),
    menuToggle: query(SELECTOR.toggle, chrome || document),
    backdrop: query(SELECTOR.backdrop, chrome || document),
  };
}

export function ensureAppChromeTemplate() {
  if (!isBrowser()) return getAppChromeTemplateRefs();

  const chrome = ensureRoot();
  if (!chrome) return getAppChromeTemplateRefs();

  ensureMounts(chrome);
  ensureToggle(chrome);
  return getAppChromeTemplateRefs(chrome);
}

export function setAppChromeTemplateState({
  mobile = false,
  visible = false,
  open = false,
} = {}) {
  const refs = ensureAppChromeTemplate();
  const navigationOpen = mobile && visible && open;
  const triggerVisible = mobile && visible;
  const state = navigationOpen ? "open" : "closed";

  if (refs.chrome) {
    setData(refs.chrome, "mobileMode", mobile ? "true" : "false");
    setData(refs.chrome, "navigationState", state);
    setData(refs.chrome, "navigationVisible", visible ? "true" : "false");
  }

  if (refs.menuToggle) {
    setHidden(refs.menuToggle, !triggerVisible);
    setAttr(refs.menuToggle, "aria-hidden", triggerVisible ? "false" : "true");
    setAttr(refs.menuToggle, "aria-expanded", navigationOpen ? "true" : "false");
    setAttr(
      refs.menuToggle,
      "aria-label",
      navigationOpen ? "Cerrar navegación" : "Abrir navegación"
    );
    setData(refs.menuToggle, "state", state);
  }

  if (refs.backdrop) {
    setAttr(refs.backdrop, "aria-hidden", navigationOpen ? "false" : "true");
    setData(refs.backdrop, "state", state);
    setData(refs.backdrop, "open", navigationOpen ? "true" : "false");
  }

  return refs;
}

export const AppChromeTemplate = Object.freeze({
  version: APP_CHROME_TEMPLATE_VERSION,
  ensure: ensureAppChromeTemplate,
  getRefs: getAppChromeTemplateRefs,
  setState: setAppChromeTemplateState,
});

export default AppChromeTemplate;

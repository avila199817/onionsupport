/* =========================================================
   Onion Support - App Chrome Template
   Archivo: /src/ui/chrome/template.js

   Responsabilidad:
   - Agrupar Topbar y Sidebar bajo un único root visual estable.
   - Crear el backdrop glass del drawer móvil.
   - Insertar un único trigger de navegación dentro del Topbar real.
   - Exponer refs y sincronizar únicamente atributos visuales/ARIA.
   - Sin SidebarUI, Router, Auth, HTTP, Store ni lógica de dominio.
========================================================= */

export const APP_CHROME_TEMPLATE_VERSION =
  "app-chrome.template.v1-unified-mobile-drawer";

const APP_SHELL_SELECTOR = "#app-shell, [data-app-shell='true']";
const CHROME_ROOT_SELECTOR = "#app-chrome, [data-app-chrome='true']";
const SIDEBAR_MOUNT_SELECTOR = "#sidebar-mount, [data-sidebar-mount='true']";
const TOPBAR_MOUNT_SELECTOR = "#topbar-mount, [data-topbar-mount='true']";
const SIDEBAR_ROOT_SELECTOR = "#app-sidebar, [data-sidebar-root='true']";
const TOPBAR_ROOT_SELECTOR = "#app-topbar, [data-topbar-root='true']";
const MENU_TOGGLE_SELECTOR = "[data-topbar-menu-toggle='true']";
const BACKDROP_SELECTOR = "[data-app-chrome-backdrop='true']";

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

function createElement(tag = "div", options = {}) {
  const node = document.createElement(tag);

  if (options.className) {
    node.className = options.className;
  }

  for (const [name, value] of Object.entries(options.attrs || {})) {
    if (value === null || value === undefined || value === false) continue;
    node.setAttribute(name, value === true ? "true" : String(value));
  }

  return node;
}

function setAttr(node = null, name = "", value = "") {
  if (!node || !name) return false;

  const next = String(value);
  if (node.getAttribute(name) === next) return false;

  node.setAttribute(name, next);
  return true;
}

function setData(node = null, name = "", value = "") {
  if (!node?.dataset || !name) return false;

  const next = String(value);
  if (node.dataset[name] === next) return false;

  node.dataset[name] = next;
  return true;
}

function setHidden(node = null, hidden = false) {
  if (!node) return false;

  const next = hidden === true;
  if (node.hidden === next) return false;

  node.hidden = next;
  return true;
}

function createMenuIcon() {
  const icon = createElement("span", {
    className: "topbar-menu-toggle-icon",
    attrs: {
      "aria-hidden": "true",
      "data-topbar-menu-toggle-icon": "true",
    },
  });

  for (let index = 0; index < 3; index += 1) {
    icon.appendChild(
      createElement("span", {
        className: "topbar-menu-toggle-line",
        attrs: {
          "data-topbar-menu-toggle-line": String(index + 1),
        },
      })
    );
  }

  return icon;
}

export function createTopbarMenuToggle() {
  if (!isBrowser()) return null;

  const button = createElement("button", {
    className: "topbar-menu-toggle",
    attrs: {
      type: "button",
      hidden: "true",
      "aria-label": "Abrir navegación",
      "aria-controls": "app-sidebar",
      "aria-expanded": "false",
      "data-topbar-menu-toggle": "true",
      "data-mobile-nav-trigger": "true",
      "data-state": "closed",
    },
  });

  button.hidden = true;
  button.appendChild(createMenuIcon());

  return button;
}

export function createChromeBackdrop() {
  if (!isBrowser()) return null;

  return createElement("div", {
    className: "app-chrome-backdrop",
    attrs: {
      "aria-hidden": "true",
      "data-app-chrome-backdrop": "true",
      "data-state": "closed",
    },
  });
}

function ensureChromeRoot() {
  const appShell = query(APP_SHELL_SELECTOR);
  if (!appShell) return null;

  let chrome = query(CHROME_ROOT_SELECTOR, appShell);

  if (!chrome) {
    chrome = createElement("div", {
      className: "app-chrome",
      attrs: {
        id: "app-chrome",
        "data-app-chrome": "true",
        "data-chrome-version": APP_CHROME_TEMPLATE_VERSION,
        "data-navigation-state": "closed",
        "aria-hidden": "false",
      },
    });

    const main = query("#main-content, [data-main-content='true']", appShell);
    appShell.insertBefore(chrome, main || null);
  }

  setData(chrome, "chromeVersion", APP_CHROME_TEMPLATE_VERSION);
  return chrome;
}

function ensureChromeChildren(chrome = null) {
  if (!chrome) return false;

  const sidebarMount = query(SIDEBAR_MOUNT_SELECTOR);
  const topbarMount = query(TOPBAR_MOUNT_SELECTOR);

  if (topbarMount && topbarMount.parentElement !== chrome) {
    chrome.appendChild(topbarMount);
  }

  let backdrop = query(BACKDROP_SELECTOR, chrome);
  if (!backdrop) {
    backdrop = createChromeBackdrop();
    if (backdrop) chrome.appendChild(backdrop);
  }

  if (sidebarMount && sidebarMount.parentElement !== chrome) {
    chrome.appendChild(sidebarMount);
  }

  return true;
}

function ensureTopbarMenuToggle(chrome = null) {
  const topbar = query(TOPBAR_ROOT_SELECTOR, chrome || document);
  if (!topbar) return null;

  let toggle = query(MENU_TOGGLE_SELECTOR, topbar);
  if (toggle) return toggle;

  toggle = createTopbarMenuToggle();
  if (!toggle) return null;

  topbar.insertBefore(toggle, topbar.firstChild || null);
  return toggle;
}

export function ensureAppChromeTemplate() {
  if (!isBrowser()) return getAppChromeTemplateRefs();

  const chrome = ensureChromeRoot();
  if (!chrome) return getAppChromeTemplateRefs();

  ensureChromeChildren(chrome);
  ensureTopbarMenuToggle(chrome);

  return getAppChromeTemplateRefs(chrome);
}

export function getAppChromeTemplateRefs(root = null) {
  if (!isBrowser()) {
    return {
      chrome: null,
      sidebarMount: null,
      sidebar: null,
      topbarMount: null,
      topbar: null,
      menuToggle: null,
      backdrop: null,
    };
  }

  const chrome =
    root?.matches?.(CHROME_ROOT_SELECTOR)
      ? root
      : query(CHROME_ROOT_SELECTOR);

  return {
    chrome,
    sidebarMount: query(SIDEBAR_MOUNT_SELECTOR, chrome || document),
    sidebar: query(SIDEBAR_ROOT_SELECTOR, chrome || document),
    topbarMount: query(TOPBAR_MOUNT_SELECTOR, chrome || document),
    topbar: query(TOPBAR_ROOT_SELECTOR, chrome || document),
    menuToggle: query(MENU_TOGGLE_SELECTOR, chrome || document),
    backdrop: query(BACKDROP_SELECTOR, chrome || document),
  };
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

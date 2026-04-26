/* =========================================================
   Onion SPA - Topbar Sidebar Bridge
   Archivo: src/ui/topbar/topbar.sidebar.js

   FULL PRO SAAS PANEL · EXTREME MODE · 10/10

   Responsabilidades:
   - integrar TopbarUI con SidebarUI
   - gestionar toggle mobile del sidebar
   - sincronizar estado aria del botón mobile
   - mantener limpio el offset visual del topbar
   - no pisar layout con inline styles permanentes
   - cerrar estado mobile al pasar a desktop
   - tolerar varias APIs de SidebarUI
   - emitir eventos de sincronización
========================================================= */

import {
  TOPBAR_SEARCH_CONFIG,
  isMobileViewport,
} from "./topbar.helpers.js";

/* =========================================================
   CONSTANTS
========================================================= */

const BODY_SIDEBAR_OPEN_CLASS = "sidebar-open";
const BODY_SIDEBAR_CLOSING_CLASS = "sidebar-closing";

const SIDEBAR_OPEN_CLASSES = [
  "open",
  "is-open",
  "sidebar-open",
];

const SIDEBAR_MOBILE_CLASSES = [
  "is-mobile",
  "mobile-open",
];

const MOBILE_TOGGLE_ACTIVE_CLASS = "is-active";

/* =========================================================
   SAFE HELPERS
========================================================= */

function safeCall(fn, ...args) {
  if (typeof fn !== "function") return undefined;

  try {
    return fn(...args);
  } catch {
    return undefined;
  }
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value).trim();
  return text || fallback;
}

function isElement(value) {
  return Boolean(value && value.nodeType === 1);
}

function getBody() {
  return document.body || document.documentElement;
}

function getSidebarId(sidebar) {
  if (!sidebar) return "sidebar";

  const existing = safeText(sidebar.id, "");

  if (existing) return existing;

  try {
    sidebar.id = "sidebar";
    return sidebar.id;
  } catch {
    return "sidebar";
  }
}

function emitSidebarEvent(AppCore, eventName = "", payload = {}) {
  const name = safeText(eventName, "");

  if (!name) return false;

  try {
    AppCore?.events?.emit?.(name, payload);
    return true;
  } catch {
    /* fallback below */
  }

  try {
    window.dispatchEvent(
      new CustomEvent(name, {
        detail: payload,
      })
    );
    return true;
  } catch {
    return false;
  }
}

function nextFrame(fn) {
  window.setTimeout(() => {
    safeCall(fn);
  }, 0);
}

/* =========================================================
   SIDEBAR MODULE RESOLUTION
========================================================= */

export function getSidebarModule(AppCore) {
  try {
    const modules = AppCore?.modules;

    if (modules?.get && typeof modules.get === "function") {
      const candidates = [
        "SidebarUI",
        "sidebar",
        "Sidebar",
        "sidebarUI",
        "ui:sidebar",
      ];

      for (const name of candidates) {
        const found = modules.get(name);
        if (found) return found;
      }
    }

    if (modules && typeof modules === "object") {
      const candidates = [
        modules.SidebarUI,
        modules.Sidebar,
        modules.sidebar,
        modules.sidebarUI,
      ];

      for (const found of candidates) {
        if (found) return found;
      }
    }

    if (AppCore?.sidebar) {
      return AppCore.sidebar;
    }

    if (window?.OnionSidebarUI) {
      return window.OnionSidebarUI;
    }

    if (window?.SidebarUI) {
      return window.SidebarUI;
    }

    return null;
  } catch {
    return null;
  }
}

function callSidebarAction(sidebarModule, action = "") {
  if (!sidebarModule) return false;

  const actionMap = {
    open: [
      "openSidebar",
      "openMobileSidebar",
      "openMobile",
      "open",
    ],
    close: [
      "closeSidebar",
      "closeMobileSidebar",
      "closeMobile",
      "close",
    ],
    toggle: [
      "toggleSidebar",
      "toggleMobileSidebar",
      "toggleMobile",
      "toggle",
    ],
  };

  const names = actionMap[action] || [];

  for (const name of names) {
    const fn = sidebarModule?.[name];

    if (typeof fn !== "function") continue;

    safeCall(fn.bind(sidebarModule));
    return true;
  }

  return false;
}

/* =========================================================
   VIEWPORT
========================================================= */

function isMobileOnlyContext() {
  return isMobileViewport(
    TOPBAR_SEARCH_CONFIG.mobileBreakpoint
  );
}

/* =========================================================
   OFFSET CLEANUP
========================================================= */

export function syncFixedTopbarOffset(getDom) {
  const { topbar } = getDom();

  if (!topbar) return false;

  /*
    El layout lo gobierna CSS con:
    inset-inline-start: var(--app-sidebar-current-width)

    Aquí solo limpiamos residuos inline de estados antiguos.
  */
  topbar.style.left = "";
  topbar.style.right = "";
  topbar.style.width = "";
  topbar.style.insetInlineStart = "";
  topbar.style.insetInlineEnd = "";
  topbar.style.marginLeft = "";
  topbar.style.marginRight = "";

  return true;
}

/* =========================================================
   STATE DETECTION
========================================================= */

export function getSidebarMobileOpenState(sidebar) {
  const body = getBody();

  const bodyOpen = Boolean(
    body?.classList?.contains?.(BODY_SIDEBAR_OPEN_CLASS)
  );

  const sidebarOpen = Boolean(
    sidebar &&
      SIDEBAR_OPEN_CLASSES.some((className) =>
        sidebar.classList?.contains?.(className)
      )
  );

  const dataOpen = Boolean(
    sidebar &&
      [
        "open",
        "opened",
        "true",
      ].includes(safeText(sidebar.dataset?.state, "").toLowerCase())
  );

  const ariaOpen = Boolean(
    sidebar &&
      sidebar.getAttribute?.("aria-hidden") === "false"
  );

  return Boolean(bodyOpen || sidebarOpen || dataOpen || ariaOpen);
}

/* =========================================================
   RAW VISUAL STATE
========================================================= */

function applySidebarVisualState(sidebar, open = false) {
  const body = getBody();

  if (sidebar) {
    SIDEBAR_OPEN_CLASSES.forEach((className) => {
      sidebar.classList.toggle(className, Boolean(open));
    });

    if (isMobileOnlyContext()) {
      SIDEBAR_MOBILE_CLASSES.forEach((className) => {
        sidebar.classList.toggle(className, Boolean(open));
      });
    } else {
      SIDEBAR_MOBILE_CLASSES.forEach((className) => {
        sidebar.classList.remove(className);
      });
    }

    try {
      sidebar.dataset.state = open ? "open" : "closed";
      sidebar.setAttribute("aria-hidden", String(!open));
    } catch {
      /* noop */
    }
  }

  body?.classList?.toggle?.(BODY_SIDEBAR_OPEN_CLASS, Boolean(open));

  if (!open) {
    body?.classList?.remove?.(BODY_SIDEBAR_CLOSING_CLASS);
  }

  return true;
}

function forceCloseSidebarVisualState(getDom) {
  const { sidebar } = getDom();

  applySidebarVisualState(sidebar, false);
  setMobileToggleState(getDom);
  syncFixedTopbarOffset(getDom);

  return true;
}

/* =========================================================
   MOBILE TOGGLE STATE
========================================================= */

export function setMobileToggleState(getDom) {
  const { mobileToggle, sidebar } = getDom();

  if (!mobileToggle) return false;

  const isDesktop = !isMobileOnlyContext();
  const isOpen = !isDesktop && getSidebarMobileOpenState(sidebar);
  const sidebarId = getSidebarId(sidebar);

  mobileToggle.setAttribute("aria-expanded", String(isOpen));
  mobileToggle.setAttribute("aria-controls", sidebarId);
  mobileToggle.setAttribute(
    "aria-label",
    isOpen ? "Cerrar navegación" : "Abrir navegación"
  );

  mobileToggle.dataset.state = isOpen ? "open" : "closed";
  mobileToggle.classList.toggle(MOBILE_TOGGLE_ACTIVE_CLASS, isOpen);

  /*
    Mejor hidden que display manual:
    - CSS sigue gobernando estilos.
    - En desktop el botón desaparece del árbol interactivo.
  */
  mobileToggle.hidden = isDesktop;

  try {
    mobileToggle.setAttribute(
      "data-tooltip",
      isOpen ? "Cerrar navegación" : "Abrir navegación"
    );
    mobileToggle.removeAttribute("title");
  } catch {
    /* noop */
  }

  return true;
}

/* =========================================================
   PUBLIC ACTIONS
========================================================= */

export function openSidebarMobile({
  AppCore,
  getDom,
}) {
  if (!isMobileOnlyContext()) {
    forceCloseSidebarVisualState(getDom);
    return false;
  }

  const sidebarModule = getSidebarModule(AppCore);
  const handledByModule = callSidebarAction(sidebarModule, "open");

  if (!handledByModule) {
    const { sidebar } = getDom();

    if (!sidebar) {
      setMobileToggleState(getDom);
      syncFixedTopbarOffset(getDom);
      return false;
    }

    applySidebarVisualState(sidebar, true);
  }

  nextFrame(() => {
    setMobileToggleState(getDom);
    syncFixedTopbarOffset(getDom);

    emitSidebarEvent(AppCore, "sidebar:state:synced", {
      open: true,
      source: "topbar",
    });
  });

  return true;
}

export function closeSidebarMobile({
  AppCore,
  getDom,
}) {
  if (!isMobileOnlyContext()) {
    forceCloseSidebarVisualState(getDom);
    return false;
  }

  const sidebarModule = getSidebarModule(AppCore);
  const handledByModule = callSidebarAction(sidebarModule, "close");

  if (!handledByModule) {
    const { sidebar } = getDom();

    if (!sidebar) {
      setMobileToggleState(getDom);
      syncFixedTopbarOffset(getDom);
      return false;
    }

    applySidebarVisualState(sidebar, false);
  }

  nextFrame(() => {
    setMobileToggleState(getDom);
    syncFixedTopbarOffset(getDom);

    emitSidebarEvent(AppCore, "sidebar:state:synced", {
      open: false,
      source: "topbar",
    });
  });

  return true;
}

export function toggleSidebarMobile({
  AppCore,
  getDom,
}) {
  if (!isMobileOnlyContext()) {
    forceCloseSidebarVisualState(getDom);
    return false;
  }

  const { sidebar } = getDom();
  const currentlyOpen = getSidebarMobileOpenState(sidebar);
  const nextOpen = !currentlyOpen;

  const sidebarModule = getSidebarModule(AppCore);
  const handledByModule = callSidebarAction(sidebarModule, "toggle");

  if (!handledByModule) {
    if (!sidebar) {
      setMobileToggleState(getDom);
      syncFixedTopbarOffset(getDom);
      return false;
    }

    applySidebarVisualState(sidebar, nextOpen);
  }

  nextFrame(() => {
    /*
      Si SidebarUI gestiona internamente su estado, releemos el DOM.
    */
    const dom = getDom();
    const realOpen = getSidebarMobileOpenState(dom.sidebar);

    setMobileToggleState(getDom);
    syncFixedTopbarOffset(getDom);

    emitSidebarEvent(AppCore, "sidebar:state:synced", {
      open: realOpen,
      source: "topbar",
    });
  });

  return true;
}

/* =========================================================
   VIEWPORT RESIZE
========================================================= */

export function handleViewportResize(getDom, closeSidebarMobileFn) {
  const desktop = !isMobileOnlyContext();

  if (desktop) {
    /*
      Al pasar a desktop, cerramos cualquier residuo mobile.
      No usamos closeSidebarMobileFn porque esa función puede no cerrar
      si detecta desktop; aquí queremos limpieza visual forzada.
    */
    forceCloseSidebarVisualState(getDom);
    return true;
  }

  /*
    En mobile solo sincronizamos el botón y offsets.
  */
  void closeSidebarMobileFn;

  setMobileToggleState(getDom);
  syncFixedTopbarOffset(getDom);

  return true;
}

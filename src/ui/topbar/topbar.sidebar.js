/* =========================================================
   Onion SPA - Topbar Sidebar Bridge
   Archivo: src/ui/topbar/topbar.sidebar.js

   FINAL PRO SYSTEM · TOPBAR SIDEBAR BRIDGE · DESKTOP SAFE · NO STORM · 10/10

   Responsabilidades:
   - integrar TopbarUI con SidebarUI
   - gestionar toggle mobile del sidebar
   - sincronizar estado aria del botón mobile
   - mantener limpio el offset visual del topbar
   - no pisar layout con inline styles permanentes
   - cerrar estado mobile al pasar a desktop
   - tolerar varias APIs de SidebarUI
   - emitir eventos de sincronización sin duplicar tormentas

   FIX CRÍTICO REAL:
   - en desktop NO se pone aria-hidden="true" al sidebar
   - en desktop solo se limpian residuos mobile
   - en desktop NO se toca sidebar-collapsed
   - en desktop NO se bloquean clicks del menú lateral
   - mobile closed sí puede usar aria-hidden="true"
   - no emite AppCore.events + window a la vez
   - si SidebarUI gestiona la acción, no duplicamos sidebar:state:synced
   - toggle mobile prioriza métodos mobile antes que toggleSidebar desktop
   - guards browser completos para SSR / boot parcial
========================================================= */

import {
  TOPBAR_SEARCH_CONFIG,
  isMobileViewport,
} from "./topbar.helpers.js";

/* =========================================================
   CONSTANTS
========================================================= */

const BODY_SIDEBAR_OPEN_CLASS =
  "sidebar-open";

const BODY_SIDEBAR_CLOSING_CLASS =
  "sidebar-closing";

const BODY_ROUTE_SHELL_HIDDEN_CLASS =
  "route-shell-hidden";

const SIDEBAR_OPEN_CLASSES =
  Object.freeze([
    "open",
    "is-open",
    "sidebar-open",
  ]);

const SIDEBAR_MOBILE_CLASSES =
  Object.freeze([
    "is-mobile",
    "mobile-open",
  ]);

const MOBILE_TOGGLE_ACTIVE_CLASS =
  "is-active";

const DEFAULT_SIDEBAR_ID =
  "sidebar";

const SYNC_EVENT_NAME =
  "sidebar:state:synced";

const TOPBAR_SYNC_EVENT_NAME =
  "topbar:sidebar:mobile-synced";

/* =========================================================
   SAFE HELPERS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function isFunction(value) {
  return typeof value === "function";
}

function safeCall(fn, ...args) {
  if (!isFunction(fn)) {
    return undefined;
  }

  try {
    return fn(...args);
  } catch {
    return undefined;
  }
}

function safeText(value, fallback = "") {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const text =
    String(value).trim();

  return text || fallback;
}

function isElement(value) {
  return Boolean(
    value &&
    value.nodeType === 1
  );
}

function getBody() {
  if (!isBrowser()) {
    return null;
  }

  return (
    document.body ||
    document.documentElement ||
    null
  );
}

function getHtml() {
  if (!isBrowser()) {
    return null;
  }

  return document.documentElement || null;
}

function nextFrame(fn) {
  if (!isFunction(fn)) {
    return false;
  }

  if (!isBrowser()) {
    safeCall(fn);
    return true;
  }

  try {
    window.requestAnimationFrame(() => {
      safeCall(fn);
    });

    return true;
  } catch {}

  try {
    window.setTimeout(() => {
      safeCall(fn);
    }, 0);

    return true;
  } catch {
    safeCall(fn);
    return true;
  }
}

function getMobileBreakpoint() {
  return (
    Number(TOPBAR_SEARCH_CONFIG?.mobileBreakpoint) ||
    1024
  );
}

/* =========================================================
   EVENTS
========================================================= */

function emitSidebarEvent(AppCore, eventName = "", payload = {}) {
  const name =
    safeText(eventName, "");

  if (!name) {
    return false;
  }

  try {
    if (isFunction(AppCore?.events?.emit)) {
      AppCore.events.emit(
        name,
        payload
      );

      return true;
    }
  } catch {}

  try {
    if (isBrowser()) {
      window.dispatchEvent(
        new CustomEvent(name, {
          detail:
            payload,
        })
      );

      return true;
    }
  } catch {}

  return false;
}

function emitMobileSync(AppCore, payload = {}, options = {}) {
  const finalPayload = {
    source:
      "topbar",

    bridge:
      "topbar.sidebar",

    ...payload,
  };

  emitSidebarEvent(
    AppCore,
    TOPBAR_SYNC_EVENT_NAME,
    finalPayload
  );

  if (options.legacy === true) {
    emitSidebarEvent(
      AppCore,
      SYNC_EVENT_NAME,
      finalPayload
    );
  }

  return true;
}

/* =========================================================
   SIDEBAR MODULE RESOLUTION
========================================================= */

export function getSidebarModule(AppCore) {
  const moduleNames = [
    "SidebarUI",
    "sidebar",
    "Sidebar",
    "sidebarUI",
    "ui:sidebar",
  ];

  try {
    const modules =
      AppCore?.modules;

    if (
      modules?.get &&
      isFunction(modules.get)
    ) {
      for (const name of moduleNames) {
        const found =
          modules.get(name);

        if (found) {
          return found;
        }
      }
    }

    if (
      modules &&
      typeof modules === "object"
    ) {
      const candidates = [
        modules.SidebarUI,
        modules.Sidebar,
        modules.sidebar,
        modules.sidebarUI,
      ];

      for (const found of candidates) {
        if (found) {
          return found;
        }
      }
    }

    if (AppCore?.sidebar) {
      return AppCore.sidebar;
    }

    if (
      isBrowser() &&
      window?.OnionSidebarUI
    ) {
      return window.OnionSidebarUI;
    }

    if (
      isBrowser() &&
      window?.SidebarUI
    ) {
      return window.SidebarUI;
    }

    return null;
  } catch {
    return null;
  }
}

function callSidebarAction(sidebarModule, action = "", payload = {}) {
  if (!sidebarModule) {
    return false;
  }

  /*
    Orden intencionado:
    - primero APIs mobile
    - después aliases genéricos
    - toggleSidebar suele ser collapse desktop; por eso queda al final
  */
  const actionMap = {
    open: [
      "openMobileSidebar",
      "openSidebarMobile",
      "openMobile",
      "openSidebar",
      "open",
    ],

    close: [
      "closeMobileSidebar",
      "closeSidebarMobile",
      "closeMobile",
      "closeSidebar",
      "close",
    ],

    toggle: [
      "toggleMobileSidebar",
      "toggleSidebarMobile",
      "toggleMobile",
      "toggleSidebar",
      "toggle",
    ],
  };

  const names =
    actionMap[action] || [];

  for (const name of names) {
    const fn =
      sidebarModule?.[name];

    if (!isFunction(fn)) {
      continue;
    }

    try {
      const result =
        fn.call(
          sidebarModule,
          {
            source:
              "topbar",

            mobile:
              true,

            ...payload,
          }
        );

      /*
        false explícito = no gestionado.
        undefined suele ser éxito en APIs UI.
      */
      return result !== false;
    } catch {}
  }

  return false;
}

/* =========================================================
   VIEWPORT
========================================================= */

function isMobileOnlyContext() {
  try {
    return Boolean(
      isMobileViewport(
        getMobileBreakpoint()
      )
    );
  } catch {}

  if (!isBrowser()) {
    return false;
  }

  try {
    return window.innerWidth < getMobileBreakpoint();
  } catch {
    return false;
  }
}

function isDesktopContext() {
  return !isMobileOnlyContext();
}

/* =========================================================
   DOM RESOLUTION
========================================================= */

function safeGetDom(getDom) {
  try {
    if (isFunction(getDom)) {
      return getDom() || {};
    }
  } catch {}

  return {};
}

function getSidebarId(sidebar) {
  if (!isElement(sidebar)) {
    return DEFAULT_SIDEBAR_ID;
  }

  const existing =
    safeText(sidebar.id, "");

  if (existing) {
    return existing;
  }

  try {
    sidebar.id =
      DEFAULT_SIDEBAR_ID;

    return sidebar.id;
  } catch {
    return DEFAULT_SIDEBAR_ID;
  }
}

function isRouteShellHidden() {
  const body =
    getBody();

  const html =
    getHtml();

  return Boolean(
    body?.classList?.contains?.(BODY_ROUTE_SHELL_HIDDEN_CLASS) ||
    html?.classList?.contains?.(BODY_ROUTE_SHELL_HIDDEN_CLASS) ||
    body?.dataset?.shell === "hidden" ||
    html?.dataset?.shell === "hidden"
  );
}

/* =========================================================
   OFFSET CLEANUP
========================================================= */

export function syncFixedTopbarOffset(getDom) {
  const {
    topbar,
  } = safeGetDom(getDom);

  if (!isElement(topbar)) {
    return false;
  }

  try {
    topbar.style.left = "";
    topbar.style.right = "";
    topbar.style.width = "";
    topbar.style.insetInlineStart = "";
    topbar.style.insetInlineEnd = "";
    topbar.style.marginLeft = "";
    topbar.style.marginRight = "";
  } catch {}

  return true;
}

/* =========================================================
   DESKTOP / MOBILE VISUAL STATE
========================================================= */

function restoreDesktopSidebarAccessibility(sidebar) {
  if (!isElement(sidebar)) {
    return false;
  }

  /*
    Clave:
    En desktop el sidebar visible NO puede quedar con aria-hidden="true",
    porque sidebar/events.js bloquea clicks en padres [aria-hidden='true'].
  */
  if (
    !isRouteShellHidden() &&
    sidebar.hidden !== true
  ) {
    try {
      sidebar.setAttribute(
        "aria-hidden",
        "false"
      );
    } catch {}

    try {
      sidebar.removeAttribute("inert");
    } catch {}
  }

  try {
    sidebar.dataset.mode =
      "desktop";

    sidebar.dataset.mobileOpen =
      "false";

    /*
      No tocamos data-collapsed ni body.sidebar-collapsed.
      Solo declaramos que el sidebar de desktop existe/está disponible.
    */
    if (!isRouteShellHidden()) {
      sidebar.dataset.open =
        "true";
    }

    if (
      safeText(sidebar.dataset.state, "") === "closed" ||
      safeText(sidebar.dataset.state, "") === "open"
    ) {
      sidebar.dataset.state =
        "desktop";
    }
  } catch {}

  return true;
}

function clearMobileSidebarResidue(sidebar) {
  const body =
    getBody();

  try {
    body?.classList?.remove?.(
      BODY_SIDEBAR_OPEN_CLASS,
      BODY_SIDEBAR_CLOSING_CLASS
    );
  } catch {}

  if (!isElement(sidebar)) {
    return false;
  }

  try {
    SIDEBAR_MOBILE_CLASSES.forEach((className) => {
      sidebar.classList.remove(className);
    });

    /*
      Estas clases representan apertura mobile en este bridge.
      No tocamos sidebar-collapsed.
    */
    SIDEBAR_OPEN_CLASSES.forEach((className) => {
      sidebar.classList.remove(className);
    });
  } catch {}

  restoreDesktopSidebarAccessibility(sidebar);

  return true;
}

function applySidebarVisualState(sidebar, open = false) {
  const body =
    getBody();

  const nextOpen =
    Boolean(open);

  /*
    En desktop nunca usamos este método para "cerrar" el sidebar.
    Cerrar mobile en desktop = limpiar residuos mobile + restaurar accesibilidad.
  */
  if (isDesktopContext()) {
    clearMobileSidebarResidue(sidebar);
    return true;
  }

  if (isElement(sidebar)) {
    try {
      SIDEBAR_OPEN_CLASSES.forEach((className) => {
        sidebar.classList.toggle(
          className,
          nextOpen
        );
      });

      SIDEBAR_MOBILE_CLASSES.forEach((className) => {
        sidebar.classList.toggle(
          className,
          nextOpen
        );
      });
    } catch {}

    try {
      sidebar.dataset.mode =
        "mobile";

      sidebar.dataset.state =
        nextOpen ? "open" : "closed";

      sidebar.dataset.open =
        String(nextOpen);

      sidebar.dataset.mobileOpen =
        String(nextOpen);

      sidebar.setAttribute(
        "aria-hidden",
        String(!nextOpen)
      );

      if (nextOpen) {
        sidebar.removeAttribute("inert");
      }
    } catch {}
  }

  try {
    body?.classList?.toggle?.(
      BODY_SIDEBAR_OPEN_CLASS,
      nextOpen
    );

    if (!nextOpen) {
      body?.classList?.remove?.(
        BODY_SIDEBAR_CLOSING_CLASS
      );
    }
  } catch {}

  return true;
}

function forceCloseSidebarVisualState(getDom) {
  const {
    sidebar,
  } = safeGetDom(getDom);

  /*
    FIX:
    Antes esto hacía applySidebarVisualState(sidebar, false),
    dejando aria-hidden="true" en desktop.
  */
  clearMobileSidebarResidue(sidebar);

  setMobileToggleState(getDom);
  syncFixedTopbarOffset(getDom);

  return true;
}

/* =========================================================
   STATE DETECTION
========================================================= */

export function getSidebarMobileOpenState(sidebar) {
  /*
    En desktop no existe estado mobile abierto.
    Esto evita que data-state/open legacy haga creer al topbar
    que el sidebar mobile está abierto.
  */
  if (isDesktopContext()) {
    return false;
  }

  const body =
    getBody();

  const bodyOpen =
    Boolean(
      body?.classList?.contains?.(
        BODY_SIDEBAR_OPEN_CLASS
      )
    );

  const sidebarOpen =
    Boolean(
      isElement(sidebar) &&
      SIDEBAR_OPEN_CLASSES.some((className) =>
        sidebar.classList?.contains?.(className)
      )
    );

  const mobileClassOpen =
    Boolean(
      isElement(sidebar) &&
      SIDEBAR_MOBILE_CLASSES.some((className) =>
        sidebar.classList?.contains?.(className)
      )
    );

  const dataOpen =
    Boolean(
      isElement(sidebar) &&
      [
        "open",
        "opened",
        "true",
      ].includes(
        safeText(
          sidebar.dataset?.state,
          ""
        ).toLowerCase()
      )
    );

  const dataMobileOpen =
    Boolean(
      isElement(sidebar) &&
      safeText(
        sidebar.dataset?.mobileOpen,
        ""
      ).toLowerCase() === "true"
    );

  const ariaOpen =
    Boolean(
      isElement(sidebar) &&
      sidebar.getAttribute?.("aria-hidden") === "false" &&
      (
        bodyOpen ||
        sidebarOpen ||
        mobileClassOpen ||
        dataOpen ||
        dataMobileOpen
      )
    );

  return Boolean(
    bodyOpen ||
    sidebarOpen ||
    mobileClassOpen ||
    dataOpen ||
    dataMobileOpen ||
    ariaOpen
  );
}

/* =========================================================
   MOBILE TOGGLE STATE
========================================================= */

export function setMobileToggleState(getDom) {
  const {
    mobileToggle,
    sidebar,
  } = safeGetDom(getDom);

  if (!isElement(mobileToggle)) {
    return false;
  }

  const isDesktop =
    isDesktopContext();

  const isOpen =
    !isDesktop &&
    getSidebarMobileOpenState(sidebar);

  const sidebarId =
    getSidebarId(sidebar);

  try {
    mobileToggle.setAttribute(
      "aria-expanded",
      String(isOpen)
    );

    mobileToggle.setAttribute(
      "aria-controls",
      sidebarId
    );

    mobileToggle.setAttribute(
      "aria-label",
      isOpen
        ? "Cerrar navegación"
        : "Abrir navegación"
    );

    mobileToggle.dataset.state =
      isOpen ? "open" : "closed";

    mobileToggle.classList.toggle(
      MOBILE_TOGGLE_ACTIVE_CLASS,
      isOpen
    );

    mobileToggle.hidden =
      isDesktop;

    mobileToggle.setAttribute(
      "data-tooltip",
      isOpen
        ? "Cerrar navegación"
        : "Abrir navegación"
    );

    mobileToggle.removeAttribute("title");
  } catch {}

  return true;
}

/* =========================================================
   POST ACTION SYNC
========================================================= */

function postMobileActionSync({
  AppCore,
  getDom,
  requestedOpen = false,
  handledByModule = false,
  reason = "mobile-action",
} = {}) {
  nextFrame(() => {
    const dom =
      safeGetDom(getDom);

    const realOpen =
      getSidebarMobileOpenState(
        dom.sidebar
      );

    setMobileToggleState(getDom);
    syncFixedTopbarOffset(getDom);

    emitMobileSync(
      AppCore,
      {
        open:
          realOpen,

        requestedOpen:
          Boolean(requestedOpen),

        handledByModule:
          Boolean(handledByModule),

        reason,
      },
      {
        legacy:
          !handledByModule,
      }
    );
  });

  return true;
}

/* =========================================================
   PUBLIC ACTIONS
========================================================= */

export function openSidebarMobile({
  AppCore,
  getDom,
} = {}) {
  if (isDesktopContext()) {
    forceCloseSidebarVisualState(getDom);
    return false;
  }

  const {
    sidebar,
  } = safeGetDom(getDom);

  const alreadyOpen =
    getSidebarMobileOpenState(sidebar);

  if (alreadyOpen) {
    setMobileToggleState(getDom);
    syncFixedTopbarOffset(getDom);

    return true;
  }

  const sidebarModule =
    getSidebarModule(AppCore);

  const handledByModule =
    callSidebarAction(
      sidebarModule,
      "open",
      {
        open:
          true,
      }
    );

  if (!handledByModule) {
    if (!isElement(sidebar)) {
      setMobileToggleState(getDom);
      syncFixedTopbarOffset(getDom);
      return false;
    }

    applySidebarVisualState(
      sidebar,
      true
    );
  }

  postMobileActionSync({
    AppCore,
    getDom,
    requestedOpen:
      true,
    handledByModule,
    reason:
      "open",
  });

  return true;
}

export function closeSidebarMobile({
  AppCore,
  getDom,
} = {}) {
  if (isDesktopContext()) {
    forceCloseSidebarVisualState(getDom);
    return false;
  }

  const {
    sidebar,
  } = safeGetDom(getDom);

  const alreadyClosed =
    !getSidebarMobileOpenState(sidebar);

  if (alreadyClosed) {
    setMobileToggleState(getDom);
    syncFixedTopbarOffset(getDom);

    return true;
  }

  const sidebarModule =
    getSidebarModule(AppCore);

  const handledByModule =
    callSidebarAction(
      sidebarModule,
      "close",
      {
        open:
          false,
      }
    );

  if (!handledByModule) {
    if (!isElement(sidebar)) {
      setMobileToggleState(getDom);
      syncFixedTopbarOffset(getDom);
      return false;
    }

    applySidebarVisualState(
      sidebar,
      false
    );
  }

  postMobileActionSync({
    AppCore,
    getDom,
    requestedOpen:
      false,
    handledByModule,
    reason:
      "close",
  });

  return true;
}

export function toggleSidebarMobile({
  AppCore,
  getDom,
} = {}) {
  if (isDesktopContext()) {
    forceCloseSidebarVisualState(getDom);
    return false;
  }

  const {
    sidebar,
  } = safeGetDom(getDom);

  const currentlyOpen =
    getSidebarMobileOpenState(sidebar);

  const nextOpen =
    !currentlyOpen;

  const sidebarModule =
    getSidebarModule(AppCore);

  const handledByExplicitMethod =
    callSidebarAction(
      sidebarModule,
      nextOpen ? "open" : "close",
      {
        open:
          nextOpen,
      }
    );

  const handledByModule =
    handledByExplicitMethod ||
    callSidebarAction(
      sidebarModule,
      "toggle",
      {
        open:
          nextOpen,
      }
    );

  if (!handledByModule) {
    if (!isElement(sidebar)) {
      setMobileToggleState(getDom);
      syncFixedTopbarOffset(getDom);
      return false;
    }

    applySidebarVisualState(
      sidebar,
      nextOpen
    );
  }

  postMobileActionSync({
    AppCore,
    getDom,
    requestedOpen:
      nextOpen,
    handledByModule,
    reason:
      "toggle",
  });

  return true;
}

/* =========================================================
   VIEWPORT RESIZE
========================================================= */

export function handleViewportResize(getDom, closeSidebarMobileFn) {
  if (isDesktopContext()) {
    /*
      Desktop:
      - limpia residuos mobile
      - restaura aria-hidden="false"
      - NO toca sidebar-collapsed
      - NO invoca closeSidebarMobileFn
    */
    forceCloseSidebarVisualState(getDom);
    return true;
  }

  /*
    Mobile:
    - no cerramos automáticamente
    - solo sincronizamos botón/offset
  */
  void closeSidebarMobileFn;

  setMobileToggleState(getDom);
  syncFixedTopbarOffset(getDom);

  return true;
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  getSidebarModule,

  syncFixedTopbarOffset,
  getSidebarMobileOpenState,

  setMobileToggleState,

  openSidebarMobile,
  closeSidebarMobile,
  toggleSidebarMobile,

  handleViewportResize,
};

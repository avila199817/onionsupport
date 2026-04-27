/* =========================================================
   Onion SPA - Topbar Sidebar Bridge
   Archivo: src/ui/topbar/topbar.sidebar.js

   FINAL PRO SYSTEM · TOPBAR SIDEBAR BRIDGE · NO STORM · 10/10

   Responsabilidades:
   - integrar TopbarUI con SidebarUI
   - gestionar toggle mobile del sidebar
   - sincronizar estado aria del botón mobile
   - mantener limpio el offset visual del topbar
   - no pisar layout con inline styles permanentes
   - cerrar estado mobile al pasar a desktop
   - tolerar varias APIs de SidebarUI
   - emitir eventos de sincronización sin duplicar tormentas

   FIX CRÍTICO:
   - no emite AppCore.events + window a la vez
   - si SidebarUI gestiona la acción, no duplicamos sidebar:state:synced
   - toggle mobile prioriza métodos mobile antes que toggleSidebar desktop
   - guards browser completos para SSR / boot parcial
   - no toca sidebar-collapsed en desktop
   - cleanup visual mobile forzado al pasar a desktop
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

const SIDEBAR_OPEN_CLASSES = Object.freeze([
  "open",
  "is-open",
  "sidebar-open",
]);

const SIDEBAR_MOBILE_CLASSES = Object.freeze([
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

function isObject(value) {
  return (
    value !== null &&
    typeof value === "object"
  );
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

  /*
    Evento específico del topbar: siempre seguro.
    No debería participar en loops de SidebarUI.
  */
  emitSidebarEvent(
    AppCore,
    TOPBAR_SYNC_EVENT_NAME,
    finalPayload
  );

  /*
    Evento legacy compartido:
    solo cuando el topbar ha aplicado fallback visual.
    Si SidebarUI ejecutó la acción, SidebarUI debe emitir su propio evento.
  */
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
    Importante:
    - mobile primero.
    - toggleSidebar suele ser desktop collapse en muchos sidebars.
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
        undefined suele ser éxito en APIs DOM/UI.
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

  /*
    El layout lo gobierna CSS:
    - variables globales
    - app-shell
    - sidebar width

    Aquí solo limpiamos residuos inline legacy.
  */
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
   STATE DETECTION
========================================================= */

export function getSidebarMobileOpenState(sidebar) {
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

  const ariaOpen =
    Boolean(
      isElement(sidebar) &&
      sidebar.getAttribute?.("aria-hidden") === "false" &&
      (
        bodyOpen ||
        sidebarOpen ||
        mobileClassOpen ||
        dataOpen
      )
    );

  return Boolean(
    bodyOpen ||
    sidebarOpen ||
    mobileClassOpen ||
    dataOpen ||
    ariaOpen
  );
}

/* =========================================================
   RAW VISUAL STATE
========================================================= */

function applySidebarVisualState(sidebar, open = false) {
  const body =
    getBody();

  const nextOpen =
    Boolean(open);

  if (isElement(sidebar)) {
    try {
      SIDEBAR_OPEN_CLASSES.forEach((className) => {
        sidebar.classList.toggle(
          className,
          nextOpen
        );
      });

      if (isMobileOnlyContext()) {
        SIDEBAR_MOBILE_CLASSES.forEach((className) => {
          sidebar.classList.toggle(
            className,
            nextOpen
          );
        });
      } else {
        SIDEBAR_MOBILE_CLASSES.forEach((className) => {
          sidebar.classList.remove(className);
        });
      }
    } catch {}

    try {
      sidebar.dataset.state =
        nextOpen ? "open" : "closed";

      sidebar.setAttribute(
        "aria-hidden",
        String(!nextOpen)
      );
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

  applySidebarVisualState(
    sidebar,
    false
  );

  setMobileToggleState(getDom);
  syncFixedTopbarOffset(getDom);

  return true;
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
    !isMobileOnlyContext();

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

    /*
      Mejor hidden que display inline:
      - CSS sigue mandando.
      - en desktop desaparece del árbol interactivo.
    */
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
        /*
          Si SidebarUI ha gestionado la acción, no duplicamos su evento legacy.
          Si hemos aplicado fallback visual desde Topbar, sí emitimos legacy.
        */
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
  if (!isMobileOnlyContext()) {
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
  if (!isMobileOnlyContext()) {
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
  if (!isMobileOnlyContext()) {
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

  /*
    Preferimos open/close explícito.
    toggle genérico puede ser collapse desktop.
  */
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
  const desktop =
    !isMobileOnlyContext();

  if (desktop) {
    /*
      Al pasar a desktop:
      - cerramos residuos mobile
      - NO tocamos sidebar-collapsed
      - NO invocamos closeSidebarMobileFn porque puede depender de mobile
    */
    forceCloseSidebarVisualState(getDom);
    return true;
  }

  /*
    En mobile no cerramos automáticamente.
    Solo sincronizamos ARIA/offset.
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

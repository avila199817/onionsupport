/* =========================================================
   Onion SPA - Sidebar Events
   Archivo: src/ui/sidebar/events.js

   FINAL STABLE SYSTEM · MANUAL SIDEBAR ONLY · ROLE EVENTS HARDENED

   Responsabilidades:
   - bind de eventos DOM del sidebar
   - bind de eventos core/auth/router
   - sidebar manual: nunca abrir/cerrar por navegación
   - cerrar dropdown en navegación
   - recalcular usuario / roles tras login/logout/restore/session/user change
   - bloquear clicks sobre elementos hidden/inert/admin ocultos
   - fallback local si AppCore.cleanup no existe
   - cleanup idempotente por scope
   - tolerar DOM re-renderizado
   - cero throws accidentales

   FIX REAL:
   - sin snapshot/restore en navegación desktop
   - sin routeTransition lock
   - sin reanimar sidebar al cambiar de vista
   - dropdown sí se cierra en navegación
   - sidebar solo cambia cuando el usuario lo cambia
   - role visibility se recalcula tras login/logout/restore/session/user change
   - fallback si AppCore.cleanup no existe
   - bloqueo defensivo de clicks sobre elementos hidden/inert/admin ocultos

   HARDENING 10/10:
   - browser guard total
   - cleanup local robusto
   - usa off() devuelto por AppCore.events.on si existe
   - no rompe si document/window no existen
   - no bloquea clicks sobre iconos aria-hidden dentro de enlaces válidos
   - router rendered no fuerza open/close del sidebar
   - todos los handlers van envueltos en safeHandler
   - captura errores sync y async/rejected promise
   - AppCore.cleanup.event ya NO registra handlers crudos
========================================================= */

import {
  getElements,
  isShellHidden,
  sanitizeFooterTooltipState,
} from "./dom.js";

/* ======================================================
   LOCAL CLEANUP FALLBACK
====================================================== */

const localCleanups = new Map();

/* ======================================================
   BASICS
====================================================== */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function hasWindow() {
  return typeof window !== "undefined";
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }

  const text = String(value).trim();

  return text || fallback;
}

function safeObject(value) {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value
    : {};
}

function isFn(value) {
  return typeof value === "function";
}

function resolveScope(scope = "ui:sidebar") {
  return safeText(scope, "ui:sidebar");
}

function safeWarn(AppCore, ...args) {
  try {
    AppCore?.utils?.warn?.("[SidebarEvents]", ...args);
  } catch {}

  try {
    console.warn("[SidebarEvents]", ...args);
  } catch {}
}

function safeEmit(AppCore, eventName = "", payload = {}) {
  const name = safeText(eventName, "");

  if (!name) {
    return false;
  }

  try {
    AppCore?.events?.emit?.(name, payload);
    return true;
  } catch {}

  try {
    if (isBrowser()) {
      window.dispatchEvent(
        new CustomEvent(name, {
          detail: payload,
        })
      );

      return true;
    }
  } catch {}

  return false;
}

function makeSafeHandler(
  AppCore,
  label = "handler",
  handler
) {
  if (!isFn(handler)) {
    return () => {};
  }

  return function safeBoundHandler(...args) {
    try {
      const result = handler(...args);

      /*
        Captura promesas rechazadas.
        Sin esto, un async handler puede terminar como
        Uncaught / Unhandled Promise Rejection.
      */
      if (
        result &&
        typeof result === "object" &&
        isFn(result.catch)
      ) {
        result.catch((error) => {
          safeWarn(
            AppCore,
            `${label} falló async`,
            error
          );
        });
      }

      return result;
    } catch (error) {
      safeWarn(
        AppCore,
        `${label} falló`,
        error
      );

      return undefined;
    }
  };
}

function safeWindowTimeout(fn, ms = 0) {
  if (!isFn(fn)) {
    return;
  }

  const safeFn = () => {
    try {
      fn();
    } catch {}
  };

  try {
    if (hasWindow()) {
      window.setTimeout(safeFn, ms);
      return;
    }
  } catch {}

  safeFn();
}

function safeIsShellHidden(AppCore) {
  try {
    return Boolean(isShellHidden(AppCore));
  } catch {
    return false;
  }
}

function resolveElements(AppCore, resolver) {
  if (isFn(resolver)) {
    try {
      return resolver() || getElements(AppCore);
    } catch {
      return getElements(AppCore);
    }
  }

  return getElements(AppCore);
}

function isNode(value = null) {
  if (!value) {
    return false;
  }

  try {
    return typeof Node !== "undefined" && value instanceof Node;
  } catch {
    return Boolean(value && typeof value === "object");
  }
}

function isElement(value = null) {
  if (!value) {
    return false;
  }

  try {
    return typeof Element !== "undefined" && value instanceof Element;
  } catch {
    return Boolean(value && typeof value.closest === "function");
  }
}

function getEventDetail(eventOrPayload = {}) {
  if (
    eventOrPayload?.detail &&
    typeof eventOrPayload.detail === "object"
  ) {
    return eventOrPayload.detail;
  }

  if (
    eventOrPayload &&
    typeof eventOrPayload === "object"
  ) {
    return eventOrPayload;
  }

  return {};
}

function preventDefaultAndStop(event) {
  try {
    event?.preventDefault?.();
  } catch {}

  try {
    event?.stopPropagation?.();
  } catch {}
}

/* ======================================================
   CLEANUP
====================================================== */

function pushLocalCleanup(scope, cleanup) {
  if (!isFn(cleanup)) {
    return;
  }

  const scopeName = resolveScope(scope);
  const cleanups = localCleanups.get(scopeName) || [];

  cleanups.push(cleanup);
  localCleanups.set(scopeName, cleanups);
}

function runLocalCleanups(scope) {
  const scopeName = resolveScope(scope);
  const cleanups = localCleanups.get(scopeName) || [];

  for (const cleanup of cleanups) {
    try {
      cleanup?.();
    } catch {}
  }

  localCleanups.delete(scopeName);

  return true;
}

/* ======================================================
   DOM BIND LOW LEVEL
====================================================== */

function bindDom(
  AppCore,
  scope,
  target,
  eventName,
  handler,
  options = undefined
) {
  const scopeName = resolveScope(scope);

  if (
    !target ||
    !eventName ||
    !isFn(handler) ||
    !isFn(target.addEventListener)
  ) {
    return () => {};
  }

  const safeHandler = makeSafeHandler(
    AppCore,
    `DOM "${eventName}"`,
    handler
  );

  try {
    if (isFn(AppCore?.cleanup?.on)) {
      AppCore.cleanup.on(
        scopeName,
        target,
        eventName,
        safeHandler,
        options
      );

      return () => {
        try {
          target.removeEventListener(
            eventName,
            safeHandler,
            options
          );
        } catch {}
      };
    }
  } catch (error) {
    safeWarn(
      AppCore,
      `cleanup.on falló para DOM "${eventName}"`,
      error
    );
  }

  try {
    target.addEventListener(
      eventName,
      safeHandler,
      options
    );

    const cleanup = () => {
      try {
        target.removeEventListener(
          eventName,
          safeHandler,
          options
        );
      } catch {}
    };

    pushLocalCleanup(scopeName, cleanup);

    return cleanup;
  } catch (error) {
    safeWarn(
      AppCore,
      `addEventListener falló para DOM "${eventName}"`,
      error
    );

    return () => {};
  }
}

/* ======================================================
   CORE EVENT BIND LOW LEVEL
====================================================== */

function bindCoreEvent(
  AppCore,
  scope,
  eventName,
  handler
) {
  const scopeName = resolveScope(scope);
  const cleanEventName = safeText(eventName, "");

  if (!cleanEventName || !isFn(handler)) {
    return () => {};
  }

  const safeHandler = makeSafeHandler(
    AppCore,
    `Core event "${cleanEventName}"`,
    handler
  );

  /*
    Caso principal:
    AppCore.cleanup.event registra en el event bus y después
    AppCore.cleanup.run(scope) limpia.

    CRÍTICO:
    Aquí antes se registraba handler crudo.
    Ahora se registra safeHandler, así que ningún evento core puede
    sacar Uncaught desde events.js.
  */
  try {
    if (isFn(AppCore?.cleanup?.event)) {
      const maybeCleanup = AppCore.cleanup.event(
        scopeName,
        cleanEventName,
        safeHandler
      );

      if (isFn(maybeCleanup)) {
        pushLocalCleanup(scopeName, maybeCleanup);
        return maybeCleanup;
      }

      return () => {
        try {
          AppCore?.events?.off?.(
            cleanEventName,
            safeHandler
          );
        } catch {}
      };
    }
  } catch (error) {
    safeWarn(
      AppCore,
      `cleanup.event falló para "${cleanEventName}"`,
      error
    );
  }

  let busOff = null;

  try {
    if (isFn(AppCore?.events?.on)) {
      const maybeOff = AppCore.events.on(
        cleanEventName,
        safeHandler
      );

      if (isFn(maybeOff)) {
        busOff = maybeOff;
      } else {
        busOff = () => {
          try {
            AppCore?.events?.off?.(
              cleanEventName,
              safeHandler
            );
          } catch {}
        };
      }
    }
  } catch (error) {
    safeWarn(
      AppCore,
      `AppCore.events.on falló para "${cleanEventName}"`,
      error
    );
  }

  const windowHandler = (event) => {
    safeHandler(event);
  };

  let windowBound = false;

  try {
    if (hasWindow()) {
      window.addEventListener(
        cleanEventName,
        windowHandler
      );

      windowBound = true;
    }
  } catch (error) {
    safeWarn(
      AppCore,
      `window.addEventListener falló para "${cleanEventName}"`,
      error
    );
  }

  const cleanup = () => {
    try {
      busOff?.();
    } catch {}

    if (windowBound) {
      try {
        window.removeEventListener(
          cleanEventName,
          windowHandler
        );
      } catch {}
    }
  };

  if (busOff || windowBound) {
    pushLocalCleanup(scopeName, cleanup);
  }

  return cleanup;
}

/* ======================================================
   UI SYNC HELPERS
====================================================== */

function syncUserAndRoles({
  AppCore,
  renderUser,
  applyRoleVisibility,
  syncSidebarState,
  closeDropdown,
  sanitize = true,
  syncState = false,
  close = false,
} = {}) {
  safeWindowTimeout(() => {
    try {
      renderUser?.();
    } catch (error) {
      safeWarn(AppCore, "renderUser falló", error);
    }

    try {
      applyRoleVisibility?.();
    } catch (error) {
      safeWarn(AppCore, "applyRoleVisibility falló", error);
    }

    if (sanitize) {
      try {
        sanitizeFooterTooltipState(AppCore);
      } catch (error) {
        safeWarn(
          AppCore,
          "sanitizeFooterTooltipState falló",
          error
        );
      }
    }

    if (close) {
      try {
        closeDropdown?.();
      } catch (error) {
        safeWarn(AppCore, "closeDropdown falló", error);
      }
    }

    /*
      Importante:
      syncSidebarState solo sincroniza clases/aria.
      No debe forzar open/close manual.
    */
    if (syncState && !safeIsShellHidden(AppCore)) {
      try {
        syncSidebarState?.();
      } catch (error) {
        safeWarn(AppCore, "syncSidebarState falló", error);
      }
    }
  }, 0);
}

/* ======================================================
   HIDDEN / INERT CLICK GUARD
====================================================== */

function shouldIgnoreHiddenTarget(target = null) {
  if (!isElement(target)) {
    return false;
  }

  const hardHidden = target.closest(
    [
      "[hidden]",
      "[inert]",
      "[data-sidebar-visible='false']",
      "[data-role-visible='false']",
      "[data-admin-visible='false']",
    ].join(",")
  );

  if (hardHidden) {
    return true;
  }

  const ariaHidden = target.closest("[aria-hidden='true']");

  if (!ariaHidden) {
    return false;
  }

  /*
    Caso correcto:
      <a data-spa>
        <span aria-hidden="true">icono</span>
        Texto
      </a>

    No bloqueamos el click si aria-hidden está en un hijo decorativo
    dentro de un control interactivo válido.
  */
  const interactiveParent = target.closest(
    [
      "a[data-spa]",
      "a[href]",
      "button",
      "[role='button']",
      "[data-route]",
      "[data-action]",
      "[data-sidebar-action]",
    ].join(",")
  );

  if (
    interactiveParent &&
    interactiveParent.contains(ariaHidden)
  ) {
    /*
      Si el propio control interactivo está oculto por aria-hidden,
      entonces sí se bloquea.
    */
    if (ariaHidden === interactiveParent) {
      return true;
    }

    return false;
  }

  return true;
}

function preventHiddenTargetClick(event) {
  const target = event?.target;

  if (!isElement(target)) {
    return false;
  }

  if (!shouldIgnoreHiddenTarget(target)) {
    return false;
  }

  preventDefaultAndStop(event);

  return true;
}

/* ======================================================
   DOM HANDLERS
====================================================== */

export function handleDocumentClick({
  AppCore,
  event,
  toggleSidebar,
  toggleDropdown,
  closeDropdown,
  handleLogout,
  getElements: resolver,
}) {
  const {
    toggleBtn,
    mobileToggleBtn,
    userToggle,
    userDropdown,
    logoutBtn,
  } = resolveElements(AppCore, resolver);

  const target = event?.target;

  if (!isNode(target)) {
    return;
  }

  if (preventHiddenTargetClick(event)) {
    return;
  }

  if (toggleBtn?.contains?.(target)) {
    preventDefaultAndStop(event);
    toggleSidebar?.();
    return;
  }

  if (mobileToggleBtn?.contains?.(target)) {
    preventDefaultAndStop(event);
    toggleSidebar?.();
    return;
  }

  if (userToggle?.contains?.(target)) {
    preventDefaultAndStop(event);
    toggleDropdown?.();
    return;
  }

  if (logoutBtn?.contains?.(target)) {
    preventDefaultAndStop(event);
    void handleLogout?.();
    return;
  }

  if (userDropdown?.contains?.(target)) {
    return;
  }

  closeDropdown?.();
}

export function handleSidebarMenuClick({
  AppCore,
  event,
  closeDropdown,
  getElements: resolver,
}) {
  const {
    sidebarMenu,
  } = resolveElements(AppCore, resolver);

  if (!sidebarMenu) {
    return;
  }

  const target = event?.target;

  if (!isElement(target)) {
    return;
  }

  if (preventHiddenTargetClick(event)) {
    return;
  }

  const link = target.closest("a[data-spa]");

  if (!link) {
    return;
  }

  if (!sidebarMenu.contains(link)) {
    return;
  }

  /*
    No tocamos estado open/close del sidebar.
    Solo cerramos dropdown footer si estaba abierto.
    El Router global ya gestiona la navegación SPA.
  */
  closeDropdown?.();
}

export function handleUserToggleKeydown({
  AppCore,
  event,
  toggleDropdown,
  closeDropdown,
  openDropdown,
  getElements: resolver,
}) {
  const {
    userToggle,
  } = resolveElements(AppCore, resolver);

  if (!userToggle) {
    return;
  }

  if (event?.target !== userToggle) {
    return;
  }

  if (
    event.key === "Enter" ||
    event.key === " "
  ) {
    event.preventDefault?.();
    toggleDropdown?.();
    return;
  }

  if (event.key === "Escape") {
    event.preventDefault?.();
    closeDropdown?.();
    return;
  }

  if (event.key === "ArrowDown") {
    event.preventDefault?.();

    /*
      openDropdown del SidebarUI actual no necesita argumentos.
      Si alguna versión futura acepta opciones, no rompe.
    */
    openDropdown?.({
      focusFirst: true,
    });
  }
}

export function handleGlobalKeydown({
  event,
  closeDropdown,
}) {
  if (event?.key === "Escape") {
    closeDropdown?.();
  }
}

export function handleResize({
  syncSidebarState,
  closeDropdown,
}) {
  /*
    Resize:
    - resincroniza clases/aria
    - cierra dropdown
    - NO fuerza open/close manual
  */
  try {
    syncSidebarState?.();
  } catch {}

  try {
    closeDropdown?.();
  } catch {}
}

/* ======================================================
   DOM BINDS
====================================================== */

export function bindDomEvents(ctx = {}) {
  const {
    AppCore,
    scope,
    handleLogout,
    toggleSidebar,
    toggleDropdown,
    openDropdown,
    closeDropdown,
    syncSidebarState,
    getElements: resolver,
  } = ctx;

  if (!isBrowser()) {
    return () => {};
  }

  const scopeName = resolveScope(scope);

  bindDom(
    AppCore,
    scopeName,
    document,
    "click",
    (event) =>
      handleDocumentClick({
        AppCore,
        event,
        toggleSidebar,
        toggleDropdown,
        closeDropdown,
        handleLogout,
        getElements: resolver,
      })
  );

  bindDom(
    AppCore,
    scopeName,
    document,
    "keydown",
    (event) =>
      handleGlobalKeydown({
        event,
        closeDropdown,
      })
  );

  const resizeHandler =
    isFn(AppCore?.utils?.debounce)
      ? AppCore.utils.debounce(
          () =>
            handleResize({
              syncSidebarState,
              closeDropdown,
            }),
          120
        )
      : () =>
          handleResize({
            syncSidebarState,
            closeDropdown,
          });

  bindDom(
    AppCore,
    scopeName,
    window,
    "resize",
    resizeHandler
  );

  const {
    userToggle,
    sidebarMenu,
  } = resolveElements(AppCore, resolver);

  if (userToggle) {
    bindDom(
      AppCore,
      scopeName,
      userToggle,
      "keydown",
      (event) =>
        handleUserToggleKeydown({
          AppCore,
          event,
          toggleDropdown,
          closeDropdown,
          openDropdown,
          getElements: resolver,
        })
    );
  }

  if (sidebarMenu) {
    bindDom(
      AppCore,
      scopeName,
      sidebarMenu,
      "click",
      (event) =>
        handleSidebarMenuClick({
          AppCore,
          event,
          closeDropdown,
          getElements: resolver,
        })
    );
  }

  safeEmit(AppCore, "sidebar:dom-events:bound", {
    scope: scopeName,
  });

  return () => {
    runLocalCleanups(scopeName);
  };
}

/* ======================================================
   CORE EVENTS
====================================================== */

export function bindCoreEvents(ctx = {}) {
  const {
    AppCore,
    scope,
    renderUser,
    applyRoleVisibility,
    syncSidebarState,
    closeDropdown,
  } = ctx;

  const scopeName = resolveScope(scope);

  const syncIdentity = () => {
    syncUserAndRoles({
      AppCore,
      renderUser,
      applyRoleVisibility,
      syncSidebarState,
      closeDropdown,
      sanitize: true,
      syncState: false,
      close: false,
    });
  };

  const syncIdentityAndState = () => {
    syncUserAndRoles({
      AppCore,
      renderUser,
      applyRoleVisibility,
      syncSidebarState,
      closeDropdown,
      sanitize: true,
      syncState: true,
      close: false,
    });
  };

  const syncAfterSessionCleared = () => {
    syncUserAndRoles({
      AppCore,
      renderUser,
      applyRoleVisibility,
      syncSidebarState,
      closeDropdown,
      sanitize: true,
      syncState: true,
      close: true,
    });
  };

  /*
    User/session/auth changes.
    Estos eventos son críticos para que Usuarios/Clientes/Servidor
    aparezcan/desaparezcan sin refresh.
  */
  [
    "app:user:change",
    "app:user:updated",
    "app:user-ui:sync",
    "app:session:change",
    "app:session:restored",
    "app:auth:change",
    "auth:change",
    "auth:updated",
    "auth:restore:success",
    "auth:session:restored",
    "auth:session:applied",
  ].forEach((eventName) => {
    bindCoreEvent(
      AppCore,
      scopeName,
      eventName,
      syncIdentity
    );
  });

  /*
    Login success.
  */
  [
    "login:success",
    "auth:login:success",
    "app:login:success",
  ].forEach((eventName) => {
    bindCoreEvent(
      AppCore,
      scopeName,
      eventName,
      syncIdentityAndState
    );
  });

  /*
    Logout / session cleared.
  */
  [
    "app:session:cleared",
    "auth:session:cleared",
    "auth:logout",
    "auth:logout:success",
    "logout:success",
  ].forEach((eventName) => {
    bindCoreEvent(
      AppCore,
      scopeName,
      eventName,
      syncAfterSessionCleared
    );
  });

  /*
    Sidebar manual state changes.
  */
  bindCoreEvent(
    AppCore,
    scopeName,
    "app:sidebar:change",
    () => {
      syncSidebarState?.();
    }
  );

  /*
    Navegación:
    - NO restauramos snapshot
    - NO forzamos open/close
    - NO bloqueamos con routeTransition
    - solo cerramos dropdown
  */
  bindCoreEvent(
    AppCore,
    scopeName,
    "router:before-render",
    () => {
      closeDropdown?.();
    }
  );

  bindCoreEvent(
    AppCore,
    scopeName,
    "router:rendered",
    () => {
      safeWindowTimeout(() => {
        try {
          renderUser?.();
        } catch (error) {
          safeWarn(AppCore, "renderUser tras router:rendered falló", error);
        }

        try {
          applyRoleVisibility?.();
        } catch (error) {
          safeWarn(AppCore, "applyRoleVisibility tras router:rendered falló", error);
        }

        try {
          closeDropdown?.();
        } catch {}

        /*
          Solo resincronización visual.
          No debe cambiar la intención manual del usuario.
        */
        if (!safeIsShellHidden(AppCore)) {
          try {
            syncSidebarState?.();
          } catch (error) {
            safeWarn(AppCore, "syncSidebarState tras router:rendered falló", error);
          }
        }

        try {
          sanitizeFooterTooltipState(AppCore);
        } catch {}
      }, 0);
    }
  );

  bindCoreEvent(
    AppCore,
    scopeName,
    "router:shell:change",
    (eventOrPayload = {}) => {
      const detail = safeObject(
        getEventDetail(eventOrPayload)
      );

      if (detail.hidden) {
        try {
          closeDropdown?.();
        } catch {}
      }

      safeWindowTimeout(() => {
        try {
          syncSidebarState?.();
        } catch {}

        try {
          sanitizeFooterTooltipState(AppCore);
        } catch {}
      }, 0);
    }
  );

  /*
    Repair request desde Router/App bootstrap.
    Útil cuando se monta tarde sidebar/topbar o se repara shell tras login.
  */
  bindCoreEvent(
    AppCore,
    scopeName,
    "app:ui:repair-request",
    () => {
      syncIdentityAndState();
    }
  );

  /*
    Boot/app ready.
    Necesario si el sidebar se monta antes de restaurar sesión.
  */
  [
    "app:ready",
    "app:boot:ready",
    "app:boot:complete",
    "router:bound",
  ].forEach((eventName) => {
    bindCoreEvent(
      AppCore,
      scopeName,
      eventName,
      syncIdentityAndState
    );
  });

  safeEmit(AppCore, "sidebar:core-events:bound", {
    scope: scopeName,
  });

  return () => {
    runLocalCleanups(scopeName);
  };
}

/* ======================================================
   DEFAULT EXPORT
====================================================== */

export default {
  bindDomEvents,
  bindCoreEvents,

  handleDocumentClick,
  handleSidebarMenuClick,
  handleUserToggleKeydown,
  handleGlobalKeydown,
  handleResize,
};

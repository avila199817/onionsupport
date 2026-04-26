/* =========================================================
   Onion SPA - Sidebar Events
   Archivo: src/ui/sidebar/events.js

   FINAL STABLE SYSTEM · MANUAL SIDEBAR ONLY · ROLE EVENTS HARDENED

   FIX REAL:
   - sin snapshot/restore en navegación desktop
   - sin routeTransition lock
   - sin reanimar sidebar al cambiar de vista
   - dropdown sí se cierra en navegación
   - sidebar solo cambia cuando el usuario lo cambia
   - role visibility se recalcula tras login/logout/restore/session/user change
   - fallback si AppCore.cleanup no existe
   - bloqueo defensivo de clicks sobre elementos hidden/inert/admin ocultos
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
   HELPERS
====================================================== */

function safeText(value, fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }

  const text = String(value).trim();

  return text || fallback;
}

function resolveScope(scope = "ui:sidebar") {
  return safeText(scope, "ui:sidebar");
}

function safeWarn(AppCore, ...args) {
  try {
    AppCore?.utils?.warn?.("[SidebarEvents]", ...args);
  } catch {}
}

function safeWindowTimeout(fn, ms = 0) {
  try {
    window.setTimeout(fn, ms);
  } catch {
    try {
      fn?.();
    } catch {}
  }
}

function resolveElements(AppCore, resolver) {
  if (typeof resolver === "function") {
    try {
      return resolver() || getElements(AppCore);
    } catch {
      return getElements(AppCore);
    }
  }

  return getElements(AppCore);
}

function isNode(value = null) {
  try {
    return typeof Node !== "undefined" && value instanceof Node;
  } catch {
    return Boolean(value && typeof value === "object");
  }
}

function isElement(value = null) {
  try {
    return typeof Element !== "undefined" && value instanceof Element;
  } catch {
    return Boolean(value && typeof value.closest === "function");
  }
}

function getEventDetail(eventOrPayload = {}) {
  if (eventOrPayload?.detail && typeof eventOrPayload.detail === "object") {
    return eventOrPayload.detail;
  }

  if (eventOrPayload && typeof eventOrPayload === "object") {
    return eventOrPayload;
  }

  return {};
}

/* ======================================================
   CLEANUP
====================================================== */

function pushLocalCleanup(scope, cleanup) {
  if (typeof cleanup !== "function") return;

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
}

function bindDom(AppCore, scope, target, eventName, handler, options = undefined) {
  const scopeName = resolveScope(scope);

  if (!target || typeof target.addEventListener !== "function") {
    return () => {};
  }

  try {
    if (typeof AppCore?.cleanup?.on === "function") {
      AppCore.cleanup.on(scopeName, target, eventName, handler, options);

      return () => {
        try {
          target.removeEventListener(eventName, handler, options);
        } catch {}
      };
    }
  } catch {}

  try {
    target.addEventListener(eventName, handler, options);

    const cleanup = () => {
      try {
        target.removeEventListener(eventName, handler, options);
      } catch {}
    };

    pushLocalCleanup(scopeName, cleanup);

    return cleanup;
  } catch {
    return () => {};
  }
}

function bindCoreEvent(AppCore, scope, eventName, handler) {
  const scopeName = resolveScope(scope);

  if (!eventName || typeof handler !== "function") {
    return () => {};
  }

  try {
    if (typeof AppCore?.cleanup?.event === "function") {
      AppCore.cleanup.event(scopeName, eventName, handler);
      return () => {};
    }
  } catch {}

  let busBound = false;

  try {
    if (typeof AppCore?.events?.on === "function") {
      AppCore.events.on(eventName, handler);
      busBound = true;
    }
  } catch {}

  const windowHandler = (event) => {
    try {
      handler(event);
    } catch {}
  };

  try {
    window.addEventListener(eventName, windowHandler);
  } catch {}

  const cleanup = () => {
    if (busBound) {
      try {
        AppCore?.events?.off?.(eventName, handler);
      } catch {}
    }

    try {
      window.removeEventListener(eventName, windowHandler);
    } catch {}
  };

  pushLocalCleanup(scopeName, cleanup);

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
      } catch {}
    }

    if (close) {
      try {
        closeDropdown?.();
      } catch {}
    }

    if (syncState && !isShellHidden(AppCore)) {
      try {
        syncSidebarState?.();
      } catch (error) {
        safeWarn(AppCore, "syncSidebarState falló", error);
      }
    }
  }, 0);
}

function shouldIgnoreHiddenTarget(target = null) {
  if (!isElement(target)) return false;

  const hidden = target.closest(
    "[hidden], [aria-hidden='true'], [inert], [data-sidebar-visible='false']"
  );

  return Boolean(hidden);
}

function preventHiddenTargetClick(event) {
  const target = event?.target;

  if (!isElement(target)) return false;

  if (!shouldIgnoreHiddenTarget(target)) {
    return false;
  }

  event.preventDefault?.();
  event.stopPropagation?.();

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

  if (!isNode(target)) return;

  if (preventHiddenTargetClick(event)) {
    return;
  }

  if (toggleBtn?.contains(target)) {
    event.preventDefault();
    event.stopPropagation();
    toggleSidebar?.();
    return;
  }

  if (mobileToggleBtn?.contains(target)) {
    event.preventDefault();
    event.stopPropagation();
    toggleSidebar?.();
    return;
  }

  if (userToggle?.contains(target)) {
    event.preventDefault();
    event.stopPropagation();
    toggleDropdown?.();
    return;
  }

  if (logoutBtn?.contains(target)) {
    event.preventDefault();
    event.stopPropagation();
    handleLogout?.();
    return;
  }

  if (userDropdown?.contains(target)) {
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
  const { sidebarMenu } = resolveElements(AppCore, resolver);

  if (!sidebarMenu) return;

  const target = event?.target;

  if (!isElement(target)) return;

  if (preventHiddenTargetClick(event)) {
    return;
  }

  const link = target.closest("a[data-spa]");

  if (!link) return;
  if (!sidebarMenu.contains(link)) return;

  /*
    No tocamos estado open/close del sidebar.
    Solo cerramos dropdown footer si estaba abierto.
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
  const { userToggle } = resolveElements(AppCore, resolver);

  if (!userToggle) return;
  if (event?.target !== userToggle) return;

  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    toggleDropdown?.();
    return;
  }

  if (event.key === "Escape") {
    event.preventDefault();
    closeDropdown?.();
    return;
  }

  if (event.key === "ArrowDown") {
    event.preventDefault();
    openDropdown?.();
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
    Resize solo resincroniza clases y cierra dropdown.
    No fuerza open/close manual.
  */
  syncSidebarState?.();
  closeDropdown?.();
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
    typeof AppCore?.utils?.debounce === "function"
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
    Estos son los eventos importantes para que Usuarios/Clientes/Servidor
    se oculten o aparezcan sin recargar página.
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
    En navegación NO restauramos snapshot,
    NO forzamos open/close,
    NO bloqueamos con sidebarRouteTransition.
    Solo cerramos dropdown.
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
        renderUser?.();
        applyRoleVisibility?.();
        closeDropdown?.();

        /*
          Solo resincronizamos clases visuales,
          sin tocar el estado manual del usuario.
        */
        if (!isShellHidden(AppCore)) {
          syncSidebarState?.();
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
      const detail = getEventDetail(eventOrPayload);

      if (detail?.hidden) {
        closeDropdown?.();
      }

      safeWindowTimeout(() => {
        syncSidebarState?.();

        try {
          sanitizeFooterTooltipState(AppCore);
        } catch {}
      }, 0);
    }
  );

  /*
    Boot/app ready: necesario si el sidebar se monta antes de restaurar sesión.
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

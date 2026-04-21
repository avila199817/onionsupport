/* =========================================================
   Onion SPA - Sidebar Events
   Archivo: src/ui/sidebar/events.js

   FINAL STABLE SYSTEM · MANUAL SIDEBAR ONLY
   FIX REAL:
   - sin snapshot/restore en navegación desktop
   - sin routeTransition lock
   - sin reanimar sidebar al cambiar de vista
   - dropdown sí se cierra en navegación
   - sidebar solo cambia cuando el usuario lo cambia
========================================================= */

import { getElements, isShellHidden } from "./dom.js";

/* ======================================================
   HELPERS
====================================================== */

function safeWindowTimeout(fn, ms = 0) {
  try {
    window.setTimeout(fn, ms);
  } catch {
    fn?.();
  }
}

function resolveElements(AppCore, resolver) {
  if (typeof resolver === "function") {
    return resolver();
  }

  return getElements(AppCore);
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

  if (!(target instanceof Node)) return;

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

  if (!(target instanceof Element)) return;

  const link = target.closest("a[data-spa]");

  if (!link) return;
  if (!sidebarMenu.contains(link)) return;

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

  AppCore.cleanup.on(
    scope,
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

  AppCore.cleanup.on(
    scope,
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

  AppCore.cleanup.on(
    scope,
    window,
    "resize",
    resizeHandler
  );

  const {
    userToggle,
    sidebarMenu,
  } = resolveElements(AppCore, resolver);

  if (userToggle) {
    AppCore.cleanup.on(
      scope,
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
    AppCore.cleanup.on(
      scope,
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

  AppCore.cleanup.event(
    scope,
    "app:user:change",
    () => {
      renderUser?.();
      applyRoleVisibility?.();
    }
  );

  AppCore.cleanup.event(
    scope,
    "app:session:cleared",
    () => {
      renderUser?.();
      applyRoleVisibility?.();
      closeDropdown?.();
    }
  );

  AppCore.cleanup.event(
    scope,
    "app:sidebar:change",
    () => {
      syncSidebarState?.();
    }
  );

  /* IMPORTANTE:
     en navegación NO restauramos snapshot,
     NO forzamos open/close,
     NO bloqueamos con sidebarRouteTransition */
  AppCore.cleanup.event(
    scope,
    "router:before-render",
    () => {
      closeDropdown?.();
    }
  );

  AppCore.cleanup.event(
    scope,
    "router:rendered",
    () => {
      safeWindowTimeout(() => {
        renderUser?.();
        applyRoleVisibility?.();
        closeDropdown?.();

        /* solo resincronizamos clases visuales,
           sin tocar el estado manual del usuario */
        if (!isShellHidden(AppCore)) {
          syncSidebarState?.();
        }
      }, 0);
    }
  );

  AppCore.cleanup.event(
    scope,
    "router:shell:change",
    ({ detail } = {}) => {
      if (detail?.hidden) {
        closeDropdown?.();
      }

      safeWindowTimeout(() => {
        syncSidebarState?.();
      }, 0);
    }
  );

  AppCore.cleanup.event(
    scope,
    "app:user-ui:sync",
    () => {
      renderUser?.();
    }
  );

  AppCore.cleanup.event(
    scope,
    "login:success",
    () => {
      safeWindowTimeout(() => {
        renderUser?.();
        applyRoleVisibility?.();
        syncSidebarState?.();
      }, 0);
    }
  );
}

export default {
  bindDomEvents,
  bindCoreEvents,
};

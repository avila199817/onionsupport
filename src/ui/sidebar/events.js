/* =========================================================
   Onion SPA - Sidebar Events
   Archivo: src/ui/sidebar/events.js

   FINAL FIXED SYSTEM · NO AUTO COLLAPSE DESKTOP

   Responsabilidades:
   - centralizar handlers DOM del sidebar
   - bind de eventos DOM
   - bind de eventos AppCore / Router
   - cerrar dropdown al navegar
   - evitar colapso fantasma por router renders
   - mantener resize y teclado robusto
========================================================= */

import { getElements } from "./dom.js";

/* =========================================================
   DOM HANDLERS
========================================================= */
export function handleDocumentClick({
  AppCore,
  event,
  toggleSidebar,
  toggleDropdown,
  closeDropdown,
  handleLogout,
  getElements: resolveElements,
}) {
  const {
    toggleBtn,
    mobileToggleBtn,
    userToggle,
    userDropdown,
    logoutBtn,
  } =
    typeof resolveElements === "function"
      ? resolveElements()
      : getElements(AppCore);

  const target = event?.target;

  if (!(target instanceof Node)) {
    return;
  }

  if (toggleBtn && toggleBtn.contains(target)) {
    event.preventDefault();
    event.stopPropagation();
    toggleSidebar?.();
    return;
  }

  if (
    mobileToggleBtn &&
    mobileToggleBtn.contains(target)
  ) {
    event.preventDefault();
    event.stopPropagation();
    toggleSidebar?.();
    return;
  }

  if (userToggle && userToggle.contains(target)) {
    event.preventDefault();
    event.stopPropagation();
    toggleDropdown?.();
    return;
  }

  if (logoutBtn && logoutBtn.contains(target)) {
    event.preventDefault();
    event.stopPropagation();
    handleLogout?.();
    return;
  }

  if (
    userDropdown &&
    userDropdown.contains(target)
  ) {
    return;
  }

  closeDropdown?.();
}

export function handleSidebarMenuClick({
  AppCore,
  event,
  closeDropdown,
  getElements: resolveElements,
}) {
  const { sidebarMenu } =
    typeof resolveElements === "function"
      ? resolveElements()
      : getElements(AppCore);

  if (!sidebarMenu) {
    return;
  }

  const target = event?.target;

  if (!(target instanceof Element)) {
    return;
  }

  const link =
    target.closest('a[data-spa]');

  if (!link) {
    return;
  }

  if (!sidebarMenu.contains(link)) {
    return;
  }

  closeDropdown?.();
}

export function handleUserToggleKeydown({
  AppCore,
  event,
  toggleDropdown,
  closeDropdown,
  openDropdown,
  getElements: resolveElements,
}) {
  const { userToggle } =
    typeof resolveElements === "function"
      ? resolveElements()
      : getElements(AppCore);

  if (
    !userToggle ||
    event?.target !== userToggle
  ) {
    return;
  }

  if (
    event.key === "Enter" ||
    event.key === " "
  ) {
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
  if (event?.key !== "Escape") {
    return;
  }

  closeDropdown?.();
}

export function handleResize({
  syncSidebarState,
  closeDropdown,
}) {
  syncSidebarState?.();
  closeDropdown?.();
}

/* =========================================================
   BIND DOM EVENTS
========================================================= */
export function bindDomEvents(ctx) {
  const {
    AppCore,
    scope,
    handleLogout,
    toggleSidebar,
    toggleDropdown,
    openDropdown,
    closeDropdown,
    syncSidebarState,
    getElements: resolveElements,
  } = ctx;

  AppCore.cleanup.on(
    scope,
    document,
    "click",
    (event) => {
      handleDocumentClick({
        AppCore,
        event,
        toggleSidebar,
        toggleDropdown,
        closeDropdown,
        handleLogout,
        getElements: resolveElements,
      });
    }
  );

  AppCore.cleanup.on(
    scope,
    document,
    "keydown",
    (event) => {
      handleGlobalKeydown({
        event,
        closeDropdown,
      });
    }
  );

  const resizeHandler =
    typeof AppCore?.utils?.debounce ===
    "function"
      ? AppCore.utils.debounce(
          () => {
            handleResize({
              syncSidebarState,
              closeDropdown,
            });
          },
          120
        )
      : () => {
          handleResize({
            syncSidebarState,
            closeDropdown,
          });
        };

  AppCore.cleanup.on(
    scope,
    window,
    "resize",
    resizeHandler
  );

  const {
    userToggle,
    sidebarMenu,
  } =
    typeof resolveElements === "function"
      ? resolveElements()
      : getElements(AppCore);

  if (userToggle) {
    AppCore.cleanup.on(
      scope,
      userToggle,
      "keydown",
      (event) => {
        handleUserToggleKeydown({
          AppCore,
          event,
          toggleDropdown,
          closeDropdown,
          openDropdown,
          getElements: resolveElements,
        });
      }
    );
  }

  if (sidebarMenu) {
    AppCore.cleanup.on(
      scope,
      sidebarMenu,
      "click",
      (event) => {
        handleSidebarMenuClick({
          AppCore,
          event,
          closeDropdown,
          getElements: resolveElements,
        });
      }
    );
  }
}

/* =========================================================
   BIND CORE EVENTS
========================================================= */
export function bindCoreEvents(ctx) {
  const {
    AppCore,
    scope,
    renderUser,
    applyRoleVisibility,
    ensureServerNavItem,
    syncSidebarState,
    closeDropdown,
    getSidebarSnapshot,
    restoreSidebarState,
  } = ctx;

  let sidebarSnapshot = null;

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

  AppCore.cleanup.event(
    scope,
    "router:before-render",
    () => {
      sidebarSnapshot =
        typeof getSidebarSnapshot === "function"
          ? getSidebarSnapshot()
          : null;

      closeDropdown?.();
    }
  );

  /* =========================================
     FIX PRINCIPAL:
     NO tocar estado sidebar en cada render
  ========================================= */
  AppCore.cleanup.event(
    scope,
    "router:rendered",
    () => {
      if (
        sidebarSnapshot &&
        typeof restoreSidebarState === "function"
      ) {
        restoreSidebarState(sidebarSnapshot);
      }

      syncSidebarState?.();
      ensureServerNavItem?.();
      renderUser?.();
      applyRoleVisibility?.();
      closeDropdown?.();
    }
  );

  AppCore.cleanup.event(
    scope,
    "router:shell:change",
    ({ detail }) => {
      if (detail?.hidden) {
        closeDropdown?.();
      }
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
    "app:theme:change",
    () => {
      syncSidebarState?.();
    }
  );

  AppCore.cleanup.event(
    scope,
    "login:success",
    () => {
      window.setTimeout(() => {
        ensureServerNavItem?.();
        renderUser?.();
        applyRoleVisibility?.();
      }, 0);
    }
  );
}

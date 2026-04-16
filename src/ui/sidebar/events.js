/* =========================================================
   Onion SPA - Sidebar Events
   Archivo: src/ui/sidebar/events.js

   FINAL FIXED SYSTEM

   Responsabilidades:
   - centralizar handlers DOM del sidebar
   - bind de eventos DOM
   - bind de eventos AppCore / Router
   - evitar autocollapse por resize
   - dropdown robusto
   - teclado estable
   - sidebar solo cambia por acción manual
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
  closeSidebar,
  handleLogout,
  isMobileViewport,
  getElements: resolveElements,
}) {
  const {
    sidebar,
    toggleBtn,
    mobileToggleBtn,
    userToggle,
    userDropdown,
    logoutBtn,
  } =
    typeof resolveElements ===
    "function"
      ? resolveElements()
      : getElements(AppCore);

  const target =
    event?.target;

  if (!(target instanceof Node))
    return;

  /* desktop toggle */
  if (
    toggleBtn &&
    toggleBtn.contains(target)
  ) {
    event.preventDefault();
    event.stopPropagation();

    toggleSidebar?.();
    return;
  }

  /* mobile toggle */
  if (
    mobileToggleBtn &&
    mobileToggleBtn.contains(
      target
    )
  ) {
    event.preventDefault();
    event.stopPropagation();

    toggleSidebar?.();
    return;
  }

  /* user dropdown toggle */
  if (
    userToggle &&
    userToggle.contains(target)
  ) {
    event.preventDefault();
    event.stopPropagation();

    toggleDropdown?.();
    return;
  }

  /* logout */
  if (
    logoutBtn &&
    logoutBtn.contains(target)
  ) {
    event.preventDefault();
    event.stopPropagation();

    handleLogout?.();
    return;
  }

  /* click dentro dropdown */
  if (
    userDropdown &&
    userDropdown.contains(
      target
    )
  ) {
    return;
  }

  /* mobile outside click close */
  if (
    typeof isMobileViewport ===
      "function" &&
    isMobileViewport() &&
    sidebar &&
    (
      sidebar.classList.contains(
        "open"
      ) ||
      sidebar.classList.contains(
        "is-open"
      )
    ) &&
    !sidebar.contains(target) &&
    !(
      mobileToggleBtn &&
      mobileToggleBtn.contains(
        target
      )
    )
  ) {
    closeSidebar?.();
  }

  closeDropdown?.();
}

/* =========================================================
   SIDEBAR MENU CLICK
========================================================= */
export function handleSidebarMenuClick({
  AppCore,
  event,
  closeDropdown,
  closeSidebarOnMobileAfterNavigation,
  getElements: resolveElements,
}) {
  const { sidebarMenu } =
    typeof resolveElements ===
    "function"
      ? resolveElements()
      : getElements(AppCore);

  if (!sidebarMenu) return;

  const target =
    event?.target;

  if (
    !(target instanceof Element)
  )
    return;

  const link =
    target.closest(
      'a[data-spa]'
    );

  if (
    !link ||
    !sidebarMenu.contains(link)
  )
    return;

  closeDropdown?.();
  closeSidebarOnMobileAfterNavigation?.();
}

/* =========================================================
   USER TOGGLE KEYBOARD
========================================================= */
export function handleUserToggleKeydown({
  AppCore,
  event,
  toggleDropdown,
  closeDropdown,
  openDropdown,
  getElements: resolveElements,
}) {
  const { userToggle } =
    typeof resolveElements ===
    "function"
      ? resolveElements()
      : getElements(AppCore);

  if (
    !userToggle ||
    event?.target !== userToggle
  )
    return;

  if (
    event.key === "Enter" ||
    event.key === " "
  ) {
    event.preventDefault();
    toggleDropdown?.();
    return;
  }

  if (
    event.key === "Escape"
  ) {
    event.preventDefault();
    closeDropdown?.();
    return;
  }

  if (
    event.key === "ArrowDown"
  ) {
    event.preventDefault();
    openDropdown?.();
  }
}

/* =========================================================
   GLOBAL KEYBOARD
========================================================= */
export function handleGlobalKeydown({
  event,
  closeDropdown,
  closeSidebar,
  isMobileViewport,
  getDesiredSidebarOpenState,
}) {
  if (
    event?.key !== "Escape"
  )
    return;

  closeDropdown?.();

  if (
    typeof isMobileViewport ===
      "function" &&
    typeof getDesiredSidebarOpenState ===
      "function" &&
    isMobileViewport() &&
    getDesiredSidebarOpenState()
  ) {
    closeSidebar?.();
  }
}

/* =========================================================
   RESIZE FIX
   - no sync sidebar state
   - no autocollapse
   - solo cerrar dropdown
========================================================= */
export function handleResize({
  closeDropdown,
}) {
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
    closeSidebar,
    closeSidebarOnMobileAfterNavigation,
    getElements: resolveElements,
    isMobileViewport,
    getDesiredSidebarOpenState,
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
        closeSidebar,
        handleLogout,
        isMobileViewport,
        getElements:
          resolveElements,
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
        closeSidebar,
        isMobileViewport,
        getDesiredSidebarOpenState,
      });
    }
  );

  const resizeHandler =
    typeof AppCore?.utils
      ?.debounce ===
    "function"
      ? AppCore.utils.debounce(
          () => {
            handleResize({
              closeDropdown,
            });
          },
          120
        )
      : () => {
          handleResize({
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
    typeof resolveElements ===
    "function"
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
          getElements:
            resolveElements,
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
          closeSidebarOnMobileAfterNavigation,
          getElements:
            resolveElements,
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
    closeSidebarOnMobileAfterNavigation,
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
      ensureServerNavItem?.();
      renderUser?.();
      applyRoleVisibility?.();
      closeDropdown?.();
      closeSidebarOnMobileAfterNavigation?.();
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
      /* no recolapsar */
    }
  );

  AppCore.cleanup.event(
    scope,
    "login:success",
    () => {
      window.setTimeout(
        () => {
          ensureServerNavItem?.();
          renderUser?.();
          applyRoleVisibility?.();
        },
        0
      );
    }
  );
}

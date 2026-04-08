/* =========================================================
   Onion SPA - Sidebar UI
   Archivo: src/ui/sidebar.js

   Responsabilidades:
   - toggle sidebar
   - persistencia collapsed/expanded
   - dropdown de usuario
   - render de usuario
   - visibilidad por rol
   - cierre inteligente en navegación
   - init seguro una sola vez
========================================================= */

import { AppCore } from "../core/core.js";
import { Auth } from "../features/auth.js";
import { Router } from "../router/router.js";

export const SidebarUI = (() => {
  "use strict";

  const SCOPE = "ui:sidebar";

  let initialized = false;

  const state = {
    dropdownOpen: false,
  };

  /* =========================================================
     ELEMENTS
  ========================================================= */
  function getElements() {
    return {
      sidebar: AppCore.dom.sidebar || document.querySelector(".sidebar"),
      toggleBtn:
        AppCore.dom.sidebarToggle || document.getElementById("toggleSidebar"),
      userToggle:
        AppCore.dom.userToggle || document.getElementById("userToggle"),
      userDropdown:
        AppCore.dom.userDropdown || document.getElementById("userDropdown"),
      logoutBtn:
        AppCore.dom.logoutBtn || document.getElementById("logoutBtn"),
      avatarEl:
        AppCore.dom.sidebarAvatar || document.getElementById("sidebar-avatar"),
      nameEl:
        AppCore.dom.sidebarName || document.getElementById("sidebar-name"),
    };
  }

  function hasSidebarShell() {
    const { sidebar } = getElements();
    return Boolean(sidebar);
  }

  /* =========================================================
     USER HELPERS
  ========================================================= */
  function getUser() {
    return AppCore.state.user || null;
  }

  function getDisplayName(user = null) {
    const currentUser = user || getUser();

    return (
      currentUser?.name ||
      currentUser?.nombre ||
      currentUser?.username ||
      currentUser?.email ||
      "Usuario"
    );
  }

  function getUsername(user = null) {
    const currentUser = user || getUser();

    if (typeof AppCore.getUserUsername === "function") {
      return AppCore.getUserUsername(currentUser);
    }

    if (typeof AppCore.utils.getUserUsername === "function") {
      return AppCore.utils.getUserUsername(currentUser);
    }

    return String(currentUser?.username || "")
      .trim()
      .toLowerCase();
  }

  function getAvatarText(user = null) {
    const displayName = getDisplayName(user);
    const username = getUsername(user);

    const initials = String(displayName || "")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || "")
      .join("")
      .slice(0, 2);

    return initials || (username ? username.slice(0, 2).toUpperCase() : "ON");
  }

  function isAdmin(user = null) {
    const currentUser = user || getUser();
    return String(currentUser?.role || "").trim().toLowerCase() === "admin";
  }

  /* =========================================================
     RESPONSIVE
  ========================================================= */
  function isMobileViewport() {
    return window.matchMedia("(max-width: 900px)").matches;
  }

  /* =========================================================
     DROPDOWN
  ========================================================= */
  function syncDropdownA11y(open) {
    const { userToggle, userDropdown } = getElements();

    if (userToggle) {
      userToggle.setAttribute("aria-haspopup", "menu");
      userToggle.setAttribute("aria-expanded", String(open));
    }

    if (userDropdown) {
      userDropdown.setAttribute("aria-hidden", String(!open));
    }
  }

  function setDropdownOpen(value) {
    const { userDropdown, userToggle } = getElements();

    state.dropdownOpen = Boolean(value);

    if (!userDropdown) {
      syncDropdownA11y(state.dropdownOpen);
      return;
    }

    userDropdown.classList.toggle("open", state.dropdownOpen);
    userDropdown.classList.toggle("active", state.dropdownOpen);
    userDropdown.hidden = !state.dropdownOpen;

    if (userToggle) {
      userToggle.classList.toggle("active", state.dropdownOpen);
    }

    syncDropdownA11y(state.dropdownOpen);

    AppCore.events.emit("sidebar:dropdown:change", {
      open: state.dropdownOpen,
    });
  }

  function openDropdown() {
    setDropdownOpen(true);
  }

  function closeDropdown() {
    setDropdownOpen(false);
  }

  function toggleDropdown() {
    setDropdownOpen(!state.dropdownOpen);
  }

  /* =========================================================
     USER UI
  ========================================================= */
  function renderUser() {
    const { nameEl, avatarEl, userToggle } = getElements();
    const user = getUser();
    const displayName = getDisplayName(user);
    const avatarText = getAvatarText(user);
    const username = getUsername(user);

    if (nameEl) {
      nameEl.textContent = displayName;

      if (username) {
        nameEl.dataset.username = username;
      } else {
        delete nameEl.dataset.username;
      }
    }

    if (avatarEl) {
      avatarEl.textContent = avatarText;
      avatarEl.setAttribute("aria-label", `Avatar ${displayName}`);
      avatarEl.setAttribute("title", displayName);

      if (username) {
        avatarEl.dataset.username = username;
      } else {
        delete avatarEl.dataset.username;
      }
    }

    if (userToggle) {
      userToggle.setAttribute("aria-label", `Abrir menú de usuario de ${displayName}`);
      userToggle.setAttribute("title", displayName);
    }

    AppCore.events.emit("sidebar:user:rendered", {
      user,
      displayName,
      avatarText,
      username: username || null,
    });
  }

  /* =========================================================
     ROLE VISIBILITY
  ========================================================= */
  function applyRoleVisibility() {
    const admin = isAdmin();

    document.querySelectorAll('[data-role="admin"]').forEach((element) => {
      element.hidden = !admin;
      element.setAttribute("aria-hidden", String(!admin));
    });

    AppCore.events.emit("sidebar:roles:applied", {
      isAdmin: admin,
    });
  }

  /* =========================================================
     SIDEBAR STATE
  ========================================================= */
  function syncSidebarState() {
    const { sidebar, toggleBtn } = getElements();
    if (!sidebar) return;

    const isOpen = Boolean(AppCore.state.sidebarOpen);
    const mobile = isMobileViewport();

    if (mobile) {
      sidebar.classList.toggle("open", isOpen);
      sidebar.classList.toggle("is-open", isOpen);
      sidebar.classList.remove("collapsed");
      sidebar.classList.remove("is-collapsed");
    } else {
      sidebar.classList.toggle("collapsed", !isOpen);
      sidebar.classList.toggle("is-collapsed", !isOpen);
      sidebar.classList.toggle("open", isOpen);
      sidebar.classList.toggle("is-open", isOpen);
    }

    if (AppCore.dom.body) {
      AppCore.dom.body.classList.toggle(
        "sidebar-collapsed",
        !isOpen && !mobile
      );
      AppCore.dom.body.classList.toggle("sidebar-open", isOpen && mobile);
    }

    if (toggleBtn) {
      toggleBtn.setAttribute("aria-expanded", String(isOpen));
      toggleBtn.setAttribute(
        "aria-label",
        isOpen ? "Cerrar barra lateral" : "Abrir barra lateral"
      );
      toggleBtn.setAttribute(
        "data-tooltip",
        isOpen ? "Cerrar barra lateral" : "Abrir barra lateral"
      );
      toggleBtn.classList.toggle("is-active", isOpen);
    }

    AppCore.events.emit("sidebar:state:synced", {
      open: isOpen,
      mobile,
    });
  }

  function openSidebar() {
    AppCore.setSidebarOpen(true);
  }

  function closeSidebar() {
    AppCore.setSidebarOpen(false);
  }

  function toggleSidebar() {
    AppCore.setSidebarOpen(!AppCore.state.sidebarOpen);
    closeDropdown();
  }

  function closeSidebarOnMobileAfterNavigation() {
    if (isMobileViewport()) {
      closeSidebar();
    }
  }

  /* =========================================================
     ACTIONS
  ========================================================= */
  async function handleLogout() {
    closeDropdown();
    AppCore.setLoading(true);

    try {
      await Auth.logout({
        silent: true,
        notifyServer: true,
      });
    } catch (error) {
      AppCore.utils.warn("Logout controlado con error:", error);
    } finally {
      AppCore.syncUserUI();
      AppCore.setLoading(false);

      Router.navigate("/login", {
        replaceState: true,
        force: true,
      });
    }
  }

  /* =========================================================
     DOM EVENTS
  ========================================================= */
  function handleDocumentClick(event) {
    const { toggleBtn, userToggle, userDropdown, logoutBtn } = getElements();
    const target = event.target;

    if (toggleBtn && toggleBtn.contains(target)) {
      event.preventDefault();
      event.stopPropagation();
      toggleSidebar();
      return;
    }

    if (userToggle && userToggle.contains(target)) {
      event.preventDefault();
      event.stopPropagation();
      toggleDropdown();
      return;
    }

    if (logoutBtn && logoutBtn.contains(target)) {
      event.preventDefault();
      event.stopPropagation();
      handleLogout();
      return;
    }

    if (userDropdown && userDropdown.contains(target)) {
      return;
    }

    closeDropdown();
  }

  function handleUserToggleKeydown(event) {
    const { userToggle } = getElements();
    if (!userToggle || event.target !== userToggle) return;

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggleDropdown();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeDropdown();
      return;
    }

    if (event.key === "ArrowDown" && !state.dropdownOpen) {
      event.preventDefault();
      openDropdown();
    }
  }

  function handleGlobalKeydown(event) {
    if (event.key === "Escape") {
      closeDropdown();

      if (isMobileViewport() && AppCore.state.sidebarOpen) {
        closeSidebar();
      }
    }
  }

  function handleResize() {
    syncSidebarState();
    closeDropdown();
  }

  /* =========================================================
     CORE / APP EVENTS
  ========================================================= */
  function bindCoreEvents(scope) {
    AppCore.cleanup.event(scope, "app:user:change", () => {
      renderUser();
      applyRoleVisibility();
    });

    AppCore.cleanup.event(scope, "app:session:cleared", () => {
      renderUser();
      applyRoleVisibility();
      closeDropdown();
    });

    AppCore.cleanup.event(scope, "app:sidebar:change", () => {
      syncSidebarState();
    });

    AppCore.cleanup.event(scope, "router:before-render", () => {
      closeDropdown();
    });

    AppCore.cleanup.event(scope, "router:rendered", () => {
      closeDropdown();
      closeSidebarOnMobileAfterNavigation();
    });

    AppCore.cleanup.event(scope, "router:shell:change", ({ detail }) => {
      if (detail?.hidden) {
        closeDropdown();
      }
    });

    AppCore.cleanup.event(scope, "app:user-ui:sync", () => {
      renderUser();
    });

    AppCore.cleanup.event(scope, "app:theme:change", () => {
      syncSidebarState();
    });
  }

  function bindDomEvents(scope) {
    AppCore.cleanup.on(scope, document, "click", handleDocumentClick);
    AppCore.cleanup.on(scope, document, "keydown", handleGlobalKeydown);
    AppCore.cleanup.on(
      scope,
      window,
      "resize",
      AppCore.utils.debounce(handleResize, 120)
    );

    const { userToggle } = getElements();

    if (userToggle) {
      AppCore.cleanup.on(scope, userToggle, "keydown", handleUserToggleKeydown);
    }
  }

  /* =========================================================
     INIT
  ========================================================= */
  function init() {
    if (initialized) {
      AppCore.utils.warn("SidebarUI ya estaba inicializado.");
      return api;
    }

    if (!hasSidebarShell()) {
      AppCore.utils.warn(
        "No se encontró .sidebar para inicializar SidebarUI."
      );
      return api;
    }

    const { userToggle, userDropdown } = getElements();
    const scope = AppCore.cleanup.scope(SCOPE);

    if (userToggle) {
      userToggle.setAttribute("aria-haspopup", "menu");
      userToggle.setAttribute("aria-expanded", "false");
      userToggle.setAttribute("tabindex", "0");
    }

    if (userDropdown) {
      userDropdown.setAttribute("role", "menu");
      userDropdown.setAttribute("aria-hidden", "true");
      userDropdown.hidden = true;
    }

    syncSidebarState();
    renderUser();
    applyRoleVisibility();
    closeDropdown();

    bindDomEvents(scope);
    bindCoreEvents(scope);

    initialized = true;

    if (!AppCore.modules.has("sidebar")) {
      AppCore.modules.register("sidebar", api);
    }

    AppCore.events.emit("sidebar:ready", {
      initialized: true,
    });

    AppCore.utils.log("SidebarUI inicializado correctamente.");

    return api;
  }

  const api = {
    init,
    renderUser,
    applyRoleVisibility,
    syncSidebarState,
    openDropdown,
    closeDropdown,
    toggleDropdown,
    openSidebar,
    closeSidebar,
    toggleSidebar,
  };

  return api;
})();

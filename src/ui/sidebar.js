/* =========================================================
   Onion SPA - Sidebar UI
   Archivo: src/ui/sidebar.js

   Responsabilidades:
   - toggle sidebar
   - persistencia collapsed/expanded
   - dropdown de usuario
   - render de usuario
   - pintar avatar real si existe
   - fallback a iniciales si no hay avatar
   - visibilidad por rol
   - cierre inteligente en navegación
   - abrir sidebar automáticamente al hacer click en user dropdown
     si el sidebar está cerrado
   - init seguro una sola vez
   - sincronización robusta con AppCore
========================================================= */

import { AppCore } from "../core/core.js";
import { Auth } from "../features/auth.js";
import { Router } from "../router/router.js";

export const SidebarUI = (() => {
  "use strict";

  const SCOPE = "ui:sidebar";
  const MOBILE_BREAKPOINT = 900;

  let initialized = false;
  let resizeHandler = null;

  const state = {
    dropdownOpen: false,
  };

  /* =========================================================
     ELEMENTS
  ========================================================= */
  function getElements() {
    return {
      body: AppCore.dom.body || document.body,
      sidebar:
        AppCore.dom.sidebar ||
        document.getElementById("sidebar") ||
        document.querySelector(".sidebar"),

      toggleBtn:
        AppCore.dom.sidebarToggle ||
        document.getElementById("toggleSidebar"),

      userToggle:
        AppCore.dom.userToggle ||
        document.getElementById("userToggle"),

      userDropdown:
        AppCore.dom.userDropdown ||
        document.getElementById("userDropdown"),

      logoutBtn:
        AppCore.dom.logoutBtn ||
        document.getElementById("logoutBtn"),

      avatarEl:
        AppCore.dom.sidebarAvatar ||
        document.getElementById("sidebar-avatar"),

      nameEl:
        AppCore.dom.sidebarName ||
        document.getElementById("sidebar-name"),
    };
  }

  function hasSidebarShell() {
    const { sidebar } = getElements();
    return Boolean(sidebar);
  }

  function isShellHidden() {
    return Boolean(
      document.body?.classList.contains("route-shell-hidden") ||
        AppCore.dom.body?.classList.contains("route-shell-hidden")
    );
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

    if (typeof AppCore.utils?.getUserUsername === "function") {
      return AppCore.utils.getUserUsername(currentUser);
    }

    return String(currentUser?.username || "")
      .trim()
      .toLowerCase();
  }

  function getAvatarText(user = null) {
    const currentUser = user || getUser();
    const displayName = getDisplayName(currentUser);
    const username = getUsername(currentUser);

    const initials = String(displayName || "")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || "")
      .join("")
      .slice(0, 2);

    return initials || (username ? username.slice(0, 2).toUpperCase() : "ON");
  }

  function getAvatarUrl(user = null) {
    const currentUser = user || getUser();

    return (
      currentUser?.avatar ||
      currentUser?.avatarUrl ||
      currentUser?.photo ||
      currentUser?.image ||
      currentUser?.profileImage ||
      ""
    );
  }

  function isAdmin(user = null) {
    const currentUser = user || getUser();
    return String(currentUser?.role || "")
      .trim()
      .toLowerCase() === "admin";
  }

  /* =========================================================
     RESPONSIVE
  ========================================================= */
  function isMobileViewport() {
    return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches;
  }

  /* =========================================================
     SIDEBAR STATE
  ========================================================= */
  function getSavedSidebarCollapsed() {
    try {
      return localStorage.getItem("sidebar-collapsed") === "true";
    } catch {
      return false;
    }
  }

  function saveSidebarCollapsed(value) {
    try {
      localStorage.setItem("sidebar-collapsed", String(Boolean(value)));
    } catch {
      /* noop */
    }
  }

  function getDesiredSidebarOpenState() {
    const mobile = isMobileViewport();

    if (mobile) {
      return Boolean(AppCore.state.sidebarOpen);
    }

    const fromState = AppCore.state?.sidebarOpen;
    if (typeof fromState === "boolean") {
      return fromState;
    }

    return !getSavedSidebarCollapsed();
  }

  function updateToggleLabel(isOpen = null) {
    const { toggleBtn, sidebar } = getElements();
    if (!toggleBtn || !sidebar) return;

    const open =
      typeof isOpen === "boolean"
        ? isOpen
        : !sidebar.classList.contains("collapsed");

    const text = open ? "Cerrar barra lateral" : "Abrir barra lateral";

    toggleBtn.dataset.tooltip = text;
    toggleBtn.removeAttribute("title");
    toggleBtn.setAttribute("aria-label", text);
    toggleBtn.setAttribute("aria-expanded", String(open));
    toggleBtn.classList.toggle("is-active", open);
  }

  function syncSidebarState() {
    const { sidebar, body } = getElements();
    if (!sidebar) return;

    if (isShellHidden()) {
      sidebar.hidden = true;
      closeDropdown();
      updateToggleLabel(false);
      return;
    }

    sidebar.hidden = false;

    const mobile = isMobileViewport();
    const isOpen = getDesiredSidebarOpenState();

    if (mobile) {
      sidebar.classList.toggle("open", isOpen);
      sidebar.classList.toggle("is-open", isOpen);
      sidebar.classList.remove("collapsed");
      sidebar.classList.remove("is-collapsed");

      body?.classList.toggle("sidebar-open", isOpen);
      body?.classList.remove("sidebar-collapsed");
    } else {
      sidebar.classList.toggle("collapsed", !isOpen);
      sidebar.classList.toggle("is-collapsed", !isOpen);
      sidebar.classList.remove("open");
      sidebar.classList.remove("is-open");

      body?.classList.toggle("sidebar-collapsed", !isOpen);
      body?.classList.remove("sidebar-open");
    }

    updateToggleLabel(isOpen);

    AppCore.events.emit("sidebar:state:synced", {
      open: isOpen,
      mobile,
    });
  }

  function setSidebarOpen(open) {
    const nextOpen = Boolean(open);
    const mobile = isMobileViewport();

    if (typeof AppCore.setSidebarOpen === "function") {
      AppCore.setSidebarOpen(nextOpen);
    } else {
      AppCore.state.sidebarOpen = nextOpen;
    }

    if (!mobile) {
      saveSidebarCollapsed(!nextOpen);
    }

    syncSidebarState();
  }

  function openSidebar() {
    if (isShellHidden()) return;
    setSidebarOpen(true);
  }

  function closeSidebar() {
    setSidebarOpen(false);
  }

  function toggleSidebar() {
    if (isShellHidden()) return;

    const currentOpen = getDesiredSidebarOpenState();
    const nextOpen = !currentOpen;

    setSidebarOpen(nextOpen);

    if (!nextOpen) {
      closeDropdown();
    }
  }

  function ensureSidebarOpenForUserMenu() {
    if (isShellHidden()) return false;

    const { sidebar } = getElements();
    if (!sidebar) return false;

    const mobile = isMobileViewport();
    const isCollapsedDesktop =
      !mobile && sidebar.classList.contains("collapsed");

    const isClosedMobile =
      mobile &&
      !sidebar.classList.contains("open") &&
      !sidebar.classList.contains("is-open");

    if (isCollapsedDesktop || isClosedMobile) {
      openSidebar();
      return true;
    }

    return false;
  }

  function closeSidebarOnMobileAfterNavigation() {
    if (isMobileViewport()) {
      closeSidebar();
    }
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
    if (isShellHidden()) return;
    ensureSidebarOpenForUserMenu();
    setDropdownOpen(true);
  }

  function closeDropdown() {
    setDropdownOpen(false);
  }

  function toggleDropdown() {
    if (isShellHidden()) {
      closeDropdown();
      return;
    }

    const sidebarWasForcedOpen = ensureSidebarOpenForUserMenu();

    if (sidebarWasForcedOpen) {
      setDropdownOpen(true);
      return;
    }

    setDropdownOpen(!state.dropdownOpen);
  }

  /* =========================================================
     USER UI
  ========================================================= */
  function renderAvatarImage(avatarEl, avatarUrl, displayName, avatarText) {
    if (!avatarEl) return;

    const safeUrl = String(avatarUrl || "").trim();

    if (!safeUrl) {
      avatarEl.innerHTML = "";
      avatarEl.textContent = avatarText;
      avatarEl.classList.remove("has-image");
      avatarEl.setAttribute("aria-label", `Avatar ${displayName}`);
      avatarEl.setAttribute("title", displayName);
      return;
    }

    avatarEl.classList.add("has-image");
    avatarEl.setAttribute("aria-label", `Avatar ${displayName}`);
    avatarEl.setAttribute("title", displayName);

    avatarEl.innerHTML = `
      <img
        src="${safeUrl}"
        alt="Avatar de ${displayName}"
        loading="lazy"
        referrerpolicy="no-referrer"
        style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;"
      />
    `;
  }

  function renderUser() {
    const { nameEl, avatarEl, userToggle } = getElements();
    const user = getUser();

    const displayName = getDisplayName(user);
    const avatarText = getAvatarText(user);
    const username = getUsername(user);
    const avatarUrl = getAvatarUrl(user);

    if (nameEl) {
      nameEl.textContent = displayName;

      if (username) {
        nameEl.dataset.username = username;
      } else {
        delete nameEl.dataset.username;
      }
    }

    if (avatarEl) {
      renderAvatarImage(avatarEl, avatarUrl, displayName, avatarText);

      if (username) {
        avatarEl.dataset.username = username;
      } else {
        delete avatarEl.dataset.username;
      }
    }

    if (userToggle) {
      userToggle.setAttribute(
        "aria-label",
        `Abrir menú de usuario de ${displayName}`
      );
      userToggle.setAttribute("title", displayName);
    }

    AppCore.events.emit("sidebar:user:rendered", {
      user,
      displayName,
      avatarText,
      avatarUrl: avatarUrl || null,
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
      element.style.display = admin ? "" : "none";
    });

    AppCore.events.emit("sidebar:roles:applied", {
      isAdmin: admin,
    });
  }

  /* =========================================================
     ACTIONS
  ========================================================= */
  async function handleLogout() {
    closeDropdown();
    AppCore.setLoading?.(true);

    try {
      await Auth.logout({
        silent: true,
        notifyServer: true,
      });
    } catch (error) {
      AppCore.utils.warn?.("Logout controlado con error:", error);
    } finally {
      AppCore.syncUserUI?.();
      AppCore.setLoading?.(false);

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

    if (event.key === "ArrowDown") {
      event.preventDefault();
      openDropdown();
    }
  }

  function handleGlobalKeydown(event) {
    if (event.key === "Escape") {
      closeDropdown();

      if (isMobileViewport() && getDesiredSidebarOpenState()) {
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
      renderUser();
      applyRoleVisibility();
      syncSidebarState();
      closeDropdown();
      closeSidebarOnMobileAfterNavigation();
    });

    AppCore.cleanup.event(scope, "router:shell:change", ({ detail }) => {
      if (detail?.hidden) {
        closeDropdown();
      }

      syncSidebarState();
    });

    AppCore.cleanup.event(scope, "app:user-ui:sync", () => {
      renderUser();
    });

    AppCore.cleanup.event(scope, "app:theme:change", () => {
      syncSidebarState();
    });

    AppCore.cleanup.event(scope, "login:success", () => {
      window.setTimeout(() => {
        renderUser();
        applyRoleVisibility();
        syncSidebarState();
      }, 0);
    });
  }

  function bindDomEvents(scope) {
    AppCore.cleanup.on(scope, document, "click", handleDocumentClick);
    AppCore.cleanup.on(scope, document, "keydown", handleGlobalKeydown);

    resizeHandler =
      typeof AppCore.utils?.debounce === "function"
        ? AppCore.utils.debounce(handleResize, 120)
        : handleResize;

    AppCore.cleanup.on(scope, window, "resize", resizeHandler);

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
      syncSidebarState();
      renderUser();
      applyRoleVisibility();
      return api;
    }

    if (!hasSidebarShell()) {
      AppCore.utils.warn?.("No se encontró .sidebar para inicializar SidebarUI.");
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

    if (typeof AppCore.state.sidebarOpen !== "boolean") {
      AppCore.state.sidebarOpen = !getSavedSidebarCollapsed();
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

    AppCore.utils.log?.("SidebarUI inicializado correctamente.");

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
    updateToggleLabel,
  };

  return api;
})();

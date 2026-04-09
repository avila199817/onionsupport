/* =========================================================
   Onion SPA - Sidebar UI
   Archivo: src/ui/sidebar.js

   Responsabilidades:
   - toggle sidebar desktop / mobile
   - persistencia collapsed/expanded
   - dropdown de usuario robusto
   - render de usuario
   - pintar avatar real si existe
   - fallback a iniciales si no hay avatar o falla la imagen
   - visibilidad por rol
   - cierre inteligente en navegación
   - abrir sidebar automáticamente al hacer click en user dropdown
     si el sidebar está cerrado
   - logout robusto aunque falle el endpoint remoto
   - evitar warnings de aria-hidden al cerrar dropdown
   - init seguro una sola vez
   - sincronización robusta con AppCore
   - inyectar acceso admin a estado del servidor
========================================================= */

import { AppCore } from "../core/core.js";
import { Auth } from "../features/auth.js";
import { Router } from "../router/router.js";

export const SidebarUI = (() => {
  "use strict";

  const SCOPE = "ui:sidebar";
  const MOBILE_BREAKPOINT = 900;
  const SERVER_NAV_ID = "sidebar-server-link";
  const SERVER_ROUTE = "/servidor";

  let initialized = false;
  let resizeHandler = null;
  let logoutInFlight = false;

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

      sidebarMenu:
        AppCore.dom.sidebarMenu ||
        document.getElementById("sidebar-menu") ||
        document.querySelector(".sidebar-menu"),

      toggleBtn:
        AppCore.dom.sidebarToggle ||
        document.getElementById("toggleSidebar"),

      mobileToggleBtn:
        document.getElementById("toggleSidebarMobile"),

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

  function blurIfInside(element) {
    try {
      const activeEl = document.activeElement;
      if (element && activeEl && element.contains(activeEl)) {
        activeEl.blur?.();
      }
    } catch {
      /* noop */
    }
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
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || "")
      .join("")
      .slice(0, 2);

    return initials || (username ? username.slice(0, 2).toUpperCase() : "ON");
  }

  function getAvatarUrl(user = null) {
    const currentUser = user || getUser();

    return String(
      currentUser?.avatar ||
      currentUser?.avatarUrl ||
      currentUser?.photo ||
      currentUser?.image ||
      currentUser?.profileImage ||
      currentUser?.picture ||
      ""
    ).trim();
  }

  function isAdmin(user = null) {
    const currentUser = user || getUser();
    const role =
      currentUser?.role ||
      AppCore.state.role ||
      "";

    return String(role).trim().toLowerCase() === "admin";
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
    const { toggleBtn, mobileToggleBtn, sidebar } = getElements();
    if (!sidebar) return;

    const open =
      typeof isOpen === "boolean"
        ? isOpen
        : !sidebar.classList.contains("collapsed");

    const desktopText = open ? "Cerrar barra lateral" : "Abrir barra lateral";
    const mobileText = open ? "Cerrar navegación" : "Abrir navegación";

    if (toggleBtn) {
      toggleBtn.dataset.tooltip = desktopText;
      toggleBtn.removeAttribute("title");
      toggleBtn.setAttribute("aria-label", desktopText);
      toggleBtn.setAttribute("aria-expanded", String(open));
      toggleBtn.classList.toggle("is-active", open);
    }

    if (mobileToggleBtn) {
      mobileToggleBtn.setAttribute("aria-label", mobileText);
      mobileToggleBtn.setAttribute("aria-expanded", String(open));
      mobileToggleBtn.classList.toggle("is-active", open);
    }
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
     SERVER NAV ITEM
  ========================================================= */
  function getServerNavMarkup() {
    return `
      <a
        href="${SERVER_ROUTE}"
        data-spa
        class="menu-item"
        id="${SERVER_NAV_ID}"
        data-tooltip="Estado del servidor"
        data-role="admin"
      >
        <span aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <rect x="4" y="4" width="16" height="6" rx="2" stroke="currentColor" stroke-width="1.6"/>
            <rect x="4" y="14" width="16" height="6" rx="2" stroke="currentColor" stroke-width="1.6"/>
            <circle cx="8" cy="7" r="1" fill="currentColor"/>
            <circle cx="8" cy="17" r="1" fill="currentColor"/>
            <path d="M12 7h5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
            <path d="M12 17h5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
          </svg>
        </span>
        <span data-i18n="Servidor">Servidor</span>
      </a>
    `;
  }

  function ensureServerNavItem() {
    const { sidebarMenu } = getElements();
    if (!sidebarMenu) return null;

    let serverLink = document.getElementById(SERVER_NAV_ID);

    if (serverLink) {
      return serverLink;
    }

    const facturasLink = sidebarMenu.querySelector('a[href="/facturas"]');
    const usuariosLink = sidebarMenu.querySelector('a[href="/usuarios"]');

    if (usuariosLink) {
      usuariosLink.insertAdjacentHTML("beforebegin", getServerNavMarkup());
    } else if (facturasLink) {
      facturasLink.insertAdjacentHTML("afterend", getServerNavMarkup());
    } else {
      sidebarMenu.insertAdjacentHTML("beforeend", getServerNavMarkup());
    }

    serverLink = document.getElementById(SERVER_NAV_ID);

    if (serverLink) {
      serverLink.setAttribute("aria-hidden", String(!isAdmin()));
    }

    return serverLink;
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

    if (!state.dropdownOpen) {
      blurIfInside(userDropdown);
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
  function renderAvatarFallback(avatarEl, displayName, avatarText) {
    if (!avatarEl) return;

    avatarEl.innerHTML = "";
    avatarEl.textContent = avatarText;
    avatarEl.classList.remove("has-image");
    avatarEl.setAttribute("aria-label", `Avatar ${displayName}`);
    avatarEl.setAttribute("title", displayName);
  }

  function renderAvatarImage(avatarEl, avatarUrl, displayName, avatarText) {
    if (!avatarEl) return;

    const safeUrl = String(avatarUrl || "").trim();

    if (!safeUrl) {
      renderAvatarFallback(avatarEl, displayName, avatarText);
      return;
    }

    avatarEl.classList.add("has-image");
    avatarEl.setAttribute("aria-label", `Avatar ${displayName}`);
    avatarEl.setAttribute("title", displayName);

    avatarEl.innerHTML = `
      <img
        src="${safeUrl}"
        alt="Avatar de ${displayName}"
        loading="eager"
        decoding="async"
        fetchpriority="high"
        referrerpolicy="no-referrer"
        draggable="false"
        style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;"
      />
    `;

    const img = avatarEl.querySelector("img");

    if (img) {
      img.onerror = () => {
        renderAvatarFallback(avatarEl, displayName, avatarText);
      };
    }
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

    ensureServerNavItem();

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
    if (logoutInFlight) return;

    logoutInFlight = true;

    const { logoutBtn } = getElements();

    closeDropdown();

    if (logoutBtn) {
      logoutBtn.disabled = true;
      logoutBtn.setAttribute("aria-disabled", "true");
    }

    AppCore.setLoading?.(true);

    try {
      await Auth.logout({
        silent: true,
        notifyServer: true,
      });
    } catch (error) {
      AppCore.utils.warn?.("Logout remoto falló, se limpiará sesión local igualmente.", error);
    } finally {
      try {
        if (typeof AppCore.clearSession === "function") {
          AppCore.clearSession();
        } else {
          AppCore.state.user = null;
          AppCore.state.token = null;
          AppCore.state.role = null;
          AppCore.state.authenticated = false;
        }

        renderUser();
        applyRoleVisibility();
        closeDropdown();
        closeSidebarOnMobileAfterNavigation();

        AppCore.setLoading?.(false);

        Router.navigate("/login", {
          replaceState: true,
          force: true,
        });
      } finally {
        logoutInFlight = false;

        if (logoutBtn) {
          logoutBtn.disabled = false;
          logoutBtn.setAttribute("aria-disabled", "false");
        }
      }
    }
  }

  /* =========================================================
     DOM EVENTS
  ========================================================= */
  function handleDocumentClick(event) {
    const {
      toggleBtn,
      mobileToggleBtn,
      userToggle,
      userDropdown,
      logoutBtn,
    } = getElements();

    const target = event.target;

    if (toggleBtn && toggleBtn.contains(target)) {
      event.preventDefault();
      event.stopPropagation();
      toggleSidebar();
      return;
    }

    if (mobileToggleBtn && mobileToggleBtn.contains(target)) {
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
      ensureServerNavItem();
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
        ensureServerNavItem();
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
      ensureServerNavItem();
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

    ensureServerNavItem();

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
    ensureServerNavItem,
    handleLogout,
  };

  return api;
})();

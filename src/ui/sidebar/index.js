/* =========================================================
   Onion SPA - Sidebar UI
   Archivo: src/ui/sidebar/index.js

   FINAL EXTREME SYSTEM · DESKTOP/MOBILE STABLE · DROPDOWN SAFE · BIND DEDUPE · CLICK SAFE · 12/10
   PATCH · MENU INTERACTION LOCKED
   PATCH · ROUTER/AUTH REPAIR SAFE
   PATCH · DROPDOWN DIRECT GUARD
   PATCH · ACTIVE INDICATOR APPLE MODE
   PATCH · USER/ROLE SYNC HARDENED
   PATCH · NO POINTER-EVENTS NONE
   PATCH · NO CLEANUP STORM
   PATCH · NO DOUBLE TOGGLE

   RESPONSABILIDADES:
   - montar sidebar
   - mantener desktop/mobile separados
   - sincronizar estado visual del sidebar
   - renderizar usuario/avatar
   - controlar dropdown de usuario
   - controlar logout
   - aplicar visibilidad por rol/admin
   - reparar eventos tras login/restore/router render
   - registrar módulo en AppCore.modules
   - sincronizar item activo del menú delegando en state.js
   - sincronizar indicador activo tipo Apple delegando en state.js
   - evitar doble toggle entre events.js y fallback delegado
   - evitar carreras tras router render / auth restore / rebind
   - neutralizar hover/focus fantasma al cambiar de vista
   - soportar rutas públicas con /@username sin romper active item
   - no escribir variables CSS del indicador desde index.js
   - no gestionar transición visual propia desde index.js
   - cortar tormentas de bindEvents / cleanup / repair / init
   - evitar AppCore.cleanup.run(SCOPE) agresivo en cada rebind
   - evitar pointer-events:none colgado en .sidebar-menu
   - NO matar clicks del menú durante sync visual

   FIX CRÍTICO:
   - flushMenuHoverState() ya NO pone pointer-events:none
   - restoreMenuHoverState() nunca restaura pointer-events:none
   - ensureMenuInteractive() repara un menú muerto si quedó legacy
   - mount/repair/bind/navegación aseguran interacción del menú
   - init() repetido no fuerza rebind destructivo
   - repair() solo rebindea si no hay eventos vivos o si se fuerza
   - safeEmit() evita doble bus/window
========================================================= */

import { AppCore } from "../../core/index.js";
import { Auth } from "../../features/auth/index.js";
import { Router } from "../../router/index.js";

import {
  SCOPE,
  MOBILE_BREAKPOINT,
} from "./constants.js";

import {
  mountSidebar,
  cacheDomRefs,
  getElements,
  hasSidebarShell,
  isShellHidden,
  sanitizeFooterTooltipState,
} from "./dom.js";

import {
  getUser,
  getDisplayName,
  getUsername,
  getAvatarText,
  getAvatarUrl,
  renderAvatarImage,
} from "./user.js";

import {
  isMobileViewport,
  isRealShellHidden,
  updateToggleLabel,
  syncSidebarState as syncSidebarStateBase,
  getDesiredSidebarOpenState,
  setSidebarOpen as setSidebarOpenBase,
  repairSidebarState as repairSidebarStateBase,
  syncActiveMenuItem,
  scheduleActiveMenuIndicator,
} from "./state.js";

import {
  openDropdown as openDropdownBase,
  closeDropdown as closeDropdownBase,
  toggleDropdown as toggleDropdownBase,
} from "./dropdown.js";

import {
  applyRoleVisibility as applyRoleVisibilityBase,
} from "./visibility.js";

import {
  handleLogout as handleLogoutBase,
} from "./actions.js";

import {
  bindDomEvents,
  bindCoreEvents,
} from "./events.js";

export const SidebarUI = (() => {
  "use strict";

  /* ======================================================
     INTERNAL STATE
  ====================================================== */

  let initialized = false;
  let logoutInFlight = false;
  let eventsBound = false;

  let fallbackDomCleanup = null;
  let domEventsCleanup = null;
  let coreEventsCleanup = null;

  let activeCleanupScope = null;
  let lastBindReason = "";
  let bindGeneration = 0;

  let bindingEvents = false;
  let lastBindAt = 0;

  let visualSyncTimer = null;
  let hoverFlushTimer = null;
  let repairTimer = null;

  const BIND_DEDUP_WINDOW_MS = 250;
  const REPAIR_DEDUP_WINDOW_MS = 180;

  const VISUAL_SYNC_DEFAULT_DELAY = 24;
  const VISUAL_SYNC_AFTER_NAV_DELAY = 80;
  const VISUAL_SYNC_AFTER_TRANSITION_DELAY = 430;
  const HOVER_FLUSH_MS = 96;

  let lastRepairAt = 0;

  const runtimeState = {
    dropdownOpen: false,
  };

  /* ======================================================
     SAFE HELPERS
  ====================================================== */

  function isBrowser() {
    return (
      typeof window !== "undefined" &&
      typeof document !== "undefined"
    );
  }

  function nowTs() {
    try {
      return Date.now();
    } catch {
      return 0;
    }
  }

  function safeText(value, fallback = "") {
    if (value === null || value === undefined) {
      return fallback;
    }

    const text = String(value).trim();

    return text || fallback;
  }

  function safeObject(value) {
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};
  }

  function isFunction(value) {
    return typeof value === "function";
  }

  function first(...values) {
    for (const value of values) {
      if (value === undefined || value === null) continue;
      if (typeof value === "string" && value.trim() === "") continue;
      if (Array.isArray(value) && value.length === 0) continue;

      if (
        value &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        Object.keys(value).length === 0
      ) {
        continue;
      }

      return value;
    }

    return null;
  }

  function safeBoolean(value, fallback = false) {
    if (typeof value === "boolean") return value;

    if (typeof value === "string") {
      const key = value.trim().toLowerCase();

      if (["true", "1", "yes", "si", "sí", "ok", "on"].includes(key)) {
        return true;
      }

      if (["false", "0", "no", "off"].includes(key)) {
        return false;
      }
    }

    if (typeof value === "number") {
      if (value === 1) return true;
      if (value === 0) return false;
    }

    return fallback;
  }

  function safeNumber(value, fallback = 0) {
    const n = Number(value);

    return Number.isFinite(n)
      ? n
      : fallback;
  }

  function clampNumber(value, min = 0, max = Number.POSITIVE_INFINITY) {
    const n = safeNumber(value, min);

    return Math.min(
      Math.max(n, min),
      max
    );
  }

  function safeWarn(...args) {
    try {
      AppCore?.utils?.warn?.("[SidebarUI]", ...args);
    } catch {}

    try {
      console.warn("[SidebarUI]", ...args);
    } catch {}
  }

  function safeLog(...args) {
    try {
      AppCore?.utils?.log?.("[SidebarUI]", ...args);
    } catch {}
  }

  /*
    Importante:
    No emitimos por AppCore.events Y window a la vez.
    events.js suele escuchar el bus; doble dispatch = doble commit visual.
  */
  function safeEmit(eventName = "", payload = {}) {
    const name = safeText(eventName, "");
    if (!name) return false;

    try {
      if (isFunction(AppCore?.events?.emit)) {
        AppCore.events.emit(name, payload);
        return true;
      }
    } catch (error) {
      safeWarn(`AppCore.events.emit("${name}") falló.`, error);
    }

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

  function preventDefault(event) {
    try {
      event?.preventDefault?.();
    } catch {}
  }

  function stopPropagation(event) {
    try {
      event?.stopPropagation?.();
    } catch {}
  }

  function stopImmediatePropagation(event) {
    try {
      event?.stopImmediatePropagation?.();
    } catch {}
  }

  function preventAndStop(event) {
    preventDefault(event);
    stopPropagation(event);
    stopImmediatePropagation(event);
  }

  function containsElement(parent, child) {
    if (!parent || !child) {
      return false;
    }

    try {
      return parent === child || parent.contains(child);
    } catch {
      return false;
    }
  }

  function closest(target, selector = "") {
    try {
      return target?.closest?.(selector) || null;
    } catch {
      return null;
    }
  }

  function queryAll(root = null, selector = "") {
    if (!root || !selector) {
      return [];
    }

    try {
      return Array.from(root.querySelectorAll(selector));
    } catch {
      return [];
    }
  }

  function afterPaint(callback) {
    if (!isFunction(callback)) {
      return;
    }

    if (!isBrowser()) {
      try {
        callback();
      } catch {}

      return;
    }

    try {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          try {
            callback();
          } catch {}
        });
      });

      return;
    } catch {}

    try {
      window.setTimeout(() => {
        try {
          callback();
        } catch {}
      }, 0);
    } catch {}
  }

  function safeSetTimeout(callback, ms = 0) {
    if (!isFunction(callback)) {
      return null;
    }

    if (!isBrowser()) {
      try {
        callback();
      } catch {}

      return null;
    }

    try {
      return window.setTimeout(() => {
        try {
          callback();
        } catch {}
      }, Math.max(0, Number(ms) || 0));
    } catch {
      try {
        callback();
      } catch {}

      return null;
    }
  }

  function safeClearTimeout(timer) {
    if (!timer || !isBrowser()) {
      return false;
    }

    try {
      window.clearTimeout(timer);
      return true;
    } catch {
      return false;
    }
  }

  function getDatasetAction(element = null) {
    if (!element) return "";

    return safeText(
      first(
        element.dataset?.sidebarAction,
        element.dataset?.action,
        element.dataset?.homeAction,
        element.getAttribute?.("data-sidebar-action"),
        element.getAttribute?.("data-action"),
        element.getAttribute?.("data-home-action")
      ),
      ""
    );
  }

  function normalizeAction(value = "") {
    return safeText(value, "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[\s_]+/g, "-")
      .trim();
  }

  function isAction(action = "", candidates = []) {
    const key = normalizeAction(action);

    return candidates
      .map(normalizeAction)
      .includes(key);
  }

  function isModifiedClick(event) {
    return Boolean(
      event?.metaKey ||
        event?.ctrlKey ||
        event?.shiftKey ||
        event?.altKey ||
        event?.button === 1
    );
  }

  function isUnsafeHref(href = "") {
    const value = safeText(href, "");

    return (
      !value ||
      value === "#" ||
      /^javascript:/i.test(value) ||
      /^data:/i.test(value) ||
      /^vbscript:/i.test(value) ||
      /^mailto:/i.test(value) ||
      /^tel:/i.test(value)
    );
  }

  function isExternalHref(href = "") {
    const value = safeText(href, "");

    if (!value) {
      return false;
    }

    if (!/^https?:\/\//i.test(value)) {
      return false;
    }

    if (!isBrowser()) {
      return true;
    }

    try {
      return new URL(value, window.location.origin).origin !== window.location.origin;
    } catch {
      return true;
    }
  }

  function markSidebarEventHandled(event, reason = "") {
    if (!event) {
      return false;
    }

    try {
      event.__onionSidebarHandled = true;
      event.__onionSidebarEventsHandled = true;
      event.__onionSidebarReason = safeText(reason, "");
    } catch {}

    return true;
  }

  function wasSidebarEventHandled(event) {
    return Boolean(
      event?.__onionSidebarHandled ||
        event?.__onionSidebarEventsHandled
    );
  }

  function isElementHiddenOrDisabled(element = null) {
    if (!element) {
      return true;
    }

    try {
      if (element.hidden === true) {
        return true;
      }

      if (element.disabled === true) {
        return true;
      }

      if (element.getAttribute?.("aria-disabled") === "true") {
        return true;
      }

      if (element.getAttribute?.("aria-hidden") === "true") {
        return true;
      }

      if (element.dataset?.sidebarVisible === "false") {
        return true;
      }

      if (element.dataset?.roleVisible === "false") {
        return true;
      }

      if (element.dataset?.adminVisible === "false") {
        return true;
      }

      if (
        element.closest?.(
          [
            "[hidden]",
            "[inert]",
            "[data-sidebar-visible='false']",
            "[data-role-visible='false']",
            "[data-admin-visible='false']",
          ].join(",")
        )
      ) {
        return true;
      }

      const rect = element.getBoundingClientRect?.();

      if (
        rect &&
        (
          rect.width <= 0 ||
          rect.height <= 0
        )
      ) {
        return true;
      }
    } catch {}

    return false;
  }

  function isShellBlocked() {
    /*
      Para acciones interactivas usamos isRealShellHidden().
      isShellHidden() puede leer sidebar.hidden y bloquear tras rutas auth
      si el router todavía no ha terminado de reparar el DOM.
    */
    try {
      return Boolean(isRealShellHidden(AppCore));
    } catch {
      return Boolean(isShellHidden(AppCore));
    }
  }

  /* ======================================================
     ADMIN ROLE RESOLUTION
  ====================================================== */

  const ADMIN_ROLE_KEYS = new Set([
    "admin",
    "administrator",
    "administrador",
    "superadmin",
    "super_admin",
    "super_administrador",
    "owner",
    "root",
  ]);

  const ADMIN_PERMISSION_KEYS = new Set([
    "admin:*",
    "admin.all",
    "admin.full",
    "admin.manage",

    "users.manage",
    "users:manage",
    "users.write",
    "users:write",
    "users.admin",

    "usuarios.manage",
    "usuarios:manage",
    "usuarios.write",
    "usuarios:write",
    "usuarios.admin",

    "manage_users",
    "can_manage_users",
    "access_users",
    "can_access_users",
  ]);

  function normalizeRole(value = "") {
    return safeText(value, "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[\s-]+/g, "_")
      .replace(/[^a-z0-9_:.]/g, "")
      .trim();
  }

  function flattenRoleValue(value) {
    if (value === null || value === undefined) {
      return [];
    }

    if (Array.isArray(value)) {
      return value.flatMap(flattenRoleValue);
    }

    if (typeof value === "string") {
      return value
        .split(/[,\s|]+/)
        .map((item) => item.trim())
        .filter(Boolean);
    }

    if (typeof value === "number" || typeof value === "boolean") {
      return [value];
    }

    if (typeof value === "object") {
      const entries = Object.entries(value);

      const truthyKeys = entries
        .filter(([, entryValue]) => safeBoolean(entryValue, false))
        .map(([key]) => key);

      return [
        value.role,
        value.rol,
        value.name,
        value.key,
        value.value,
        value.id,
        value.code,
        value.slug,
        value.type,
        value.scope,
        value.permission,

        value.roles,
        value.roleList,
        value.role_list,
        value.permissions,
        value.scopes,
        value.groups,
        value.authorities,
        value.items,
        value.list,

        ...truthyKeys,
      ].flatMap(flattenRoleValue);
    }

    return [];
  }

  function normalizeRoles(value) {
    return flattenRoleValue(value)
      .flat(Infinity)
      .map(normalizeRole)
      .filter(Boolean);
  }

  function isAdminRole(value = "") {
    return ADMIN_ROLE_KEYS.has(normalizeRole(value));
  }

  function isAdminPermission(value = "") {
    const key = normalizeRole(value);

    if (!key) {
      return false;
    }

    if (ADMIN_PERMISSION_KEYS.has(key)) {
      return true;
    }

    return (
      key.startsWith("admin:") ||
      key.startsWith("admin.") ||
      key.includes(":admin") ||
      key.includes(".admin")
    );
  }

  function getAuthUser() {
    try {
      if (typeof Auth?.getUser === "function") {
        return safeObject(Auth.getUser());
      }
    } catch {}

    try {
      if (typeof Auth?.getCurrentUser === "function") {
        return safeObject(Auth.getCurrentUser());
      }
    } catch {}

    try {
      if (typeof Auth?.currentUser === "function") {
        return safeObject(Auth.currentUser());
      }
    } catch {}

    return {};
  }

  function getCurrentUser() {
    return safeObject(
      first(
        AppCore?.state?.user,
        AppCore?.state?.currentUser,
        AppCore?.state?.sessionUser,
        AppCore?.state?.authUser,
        AppCore?.state?.session?.user,
        getAuthUser()
      )
    );
  }

  function getRoleCandidates() {
    const user = getCurrentUser();
    const raw = safeObject(user?.raw);
    const profile = safeObject(user?.profile);
    const account = safeObject(user?.account);
    const meta = safeObject(user?.meta);
    const claims = safeObject(user?.claims);

    const rawProfile = safeObject(raw?.profile);
    const rawMeta = safeObject(raw?.meta);
    const rawClaims = safeObject(raw?.claims);

    const roleCandidates = [
      AppCore?.state?.role,
      AppCore?.state?.rol,
      AppCore?.state?.userRole,
      AppCore?.state?.type,

      AppCore?.state?.session?.role,
      AppCore?.state?.session?.rol,
      AppCore?.state?.session?.userRole,

      user?.role,
      user?.rol,
      user?.userRole,
      user?.user_role,
      user?.type,
      user?.userType,
      user?.user_type,
      user?.perfil,

      profile.role,
      profile.rol,
      profile.userRole,
      profile.user_role,
      profile.type,
      profile.perfil,

      account.role,
      account.rol,
      account.userRole,
      account.type,

      meta.role,
      meta.rol,
      meta.userRole,

      claims.role,
      claims.rol,
      claims.userRole,
      claims["custom:role"],
      claims["https://onion/role"],

      raw.role,
      raw.rol,
      raw.userRole,
      raw.user_role,
      raw.type,
      raw.userType,
      raw.user_type,
      raw.perfil,

      rawProfile.role,
      rawProfile.rol,
      rawProfile.userRole,
      rawProfile.user_role,
      rawProfile.type,
      rawProfile.perfil,

      rawMeta.role,
      rawMeta.rol,
      rawMeta.userRole,

      rawClaims.role,
      rawClaims.rol,
      rawClaims.userRole,
      rawClaims["custom:role"],
      rawClaims["https://onion/role"],

      Auth?.role,
      Auth?.userRole,
    ];

    try {
      if (typeof Auth?.getRole === "function") {
        roleCandidates.push(Auth.getRole());
      }
    } catch {}

    try {
      if (typeof Auth?.getCurrentRole === "function") {
        roleCandidates.push(Auth.getCurrentRole());
      }
    } catch {}

    const roleArrays = [
      AppCore?.state?.roles,
      AppCore?.state?.permissions,
      AppCore?.state?.scopes,

      AppCore?.state?.session?.roles,
      AppCore?.state?.session?.permissions,
      AppCore?.state?.session?.scopes,

      user?.roles,
      user?.roleList,
      user?.role_list,
      user?.permissions,
      user?.scopes,
      user?.groups,
      user?.authorities,

      profile.roles,
      profile.permissions,
      profile.scopes,
      profile.groups,
      profile.authorities,

      account.roles,
      account.permissions,
      account.scopes,
      account.groups,

      meta.roles,
      meta.permissions,
      meta.scopes,
      meta.groups,

      claims.roles,
      claims.permissions,
      claims.scopes,
      claims.groups,

      raw.roles,
      raw.roleList,
      raw.role_list,
      raw.permissions,
      raw.scopes,
      raw.groups,
      raw.authorities,

      rawProfile.roles,
      rawProfile.permissions,
      rawProfile.scopes,
      rawProfile.groups,

      rawMeta.roles,
      rawMeta.scopes,

      rawClaims.roles,
      rawClaims.permissions,
      rawClaims.scopes,
      rawClaims.groups,

      Auth?.roles,
      Auth?.permissions,
      Auth?.scopes,
    ];

    return [
      ...roleCandidates,
      ...roleArrays,
    ];
  }

  function hasAdminFlag() {
    const user = getCurrentUser();
    const raw = safeObject(user?.raw);
    const profile = safeObject(user?.profile);
    const account = safeObject(user?.account);
    const meta = safeObject(user?.meta);
    const claims = safeObject(user?.claims);

    return [
      AppCore?.state?.isAdmin,
      AppCore?.state?.admin,
      AppCore?.state?.isSuperAdmin,
      AppCore?.state?.superAdmin,
      AppCore?.state?.canManageUsers,
      AppCore?.state?.canAccessUsers,

      AppCore?.state?.session?.isAdmin,
      AppCore?.state?.session?.admin,
      AppCore?.state?.session?.isSuperAdmin,
      AppCore?.state?.session?.superAdmin,
      AppCore?.state?.session?.canManageUsers,
      AppCore?.state?.session?.canAccessUsers,

      user?.isAdmin,
      user?.admin,
      user?.isSuperAdmin,
      user?.superAdmin,
      user?.canManageUsers,
      user?.canAccessUsers,

      profile.isAdmin,
      profile.admin,
      profile.isSuperAdmin,
      profile.superAdmin,
      profile.canManageUsers,
      profile.canAccessUsers,

      account.isAdmin,
      account.admin,
      account.isSuperAdmin,
      account.superAdmin,

      meta.isAdmin,
      meta.admin,
      meta.isSuperAdmin,
      meta.superAdmin,
      meta.canManageUsers,
      meta.canAccessUsers,

      claims.isAdmin,
      claims.admin,
      claims.isSuperAdmin,
      claims.superAdmin,
      claims.canManageUsers,
      claims.canAccessUsers,

      raw.isAdmin,
      raw.admin,
      raw.is_admin,
      raw.isSuperAdmin,
      raw.superAdmin,
      raw.is_super_admin,
      raw.canManageUsers,
      raw.can_manage_users,
      raw.canAccessUsers,
      raw.can_access_users,
    ].some((value) => safeBoolean(value, false));
  }

  function isAdmin() {
    if (hasAdminFlag()) {
      return true;
    }

    try {
      if (
        typeof Auth?.isCurrentUserAdmin === "function" &&
        Auth.isCurrentUserAdmin()
      ) {
        return true;
      }
    } catch {}

    try {
      if (
        typeof Auth?.hasRole === "function" &&
        Auth.hasRole(
          "admin",
          "administrator",
          "administrador",
          "superadmin",
          "super_admin",
          "owner",
          "root"
        )
      ) {
        return true;
      }
    } catch {}

    const roles = normalizeRoles(getRoleCandidates());

    return roles.some((role) => {
      return isAdminRole(role) || isAdminPermission(role);
    });
  }

  /* ======================================================
     FLAGS
  ====================================================== */

  function setLogoutInFlight(value) {
    logoutInFlight = Boolean(value);
  }

  function isLogoutInFlight() {
    return logoutInFlight;
  }

  /* ======================================================
     DOM
  ====================================================== */

  function syncSidebarDomIntoAppCore() {
    const el = getElements(AppCore);

    try {
      if (!AppCore.dom || typeof AppCore.dom !== "object") {
        AppCore.dom = {};
      }

      AppCore.dom.sidebar = el.sidebar || null;
      AppCore.dom.sidebarMenu = el.sidebarMenu || null;
      AppCore.dom.sidebarRecents = el.sidebarRecents || null;
      AppCore.dom.sidebarAvatar = el.avatarEl || null;
      AppCore.dom.sidebarName = el.nameEl || null;
      AppCore.dom.sidebarLogo = el.logoEl || null;
      AppCore.dom.userToggle = el.userToggle || null;
      AppCore.dom.userDropdown = el.userDropdown || null;
      AppCore.dom.logoutBtn = el.logoutBtn || null;
      AppCore.dom.sidebarToggle = el.toggleBtn || null;
      AppCore.dom.sidebarMobileToggle = el.mobileToggleBtn || null;
      AppCore.dom.mobileSidebarToggle = el.mobileToggleBtn || null;
    } catch {}
  }

  function refreshSidebarDomRefs() {
    try {
      cacheDomRefs(AppCore);
    } catch {}

    syncSidebarDomIntoAppCore();

    return getElements(AppCore);
  }

  function mountAndRefresh() {
    try {
      mountSidebar(AppCore);
    } catch (error) {
      safeWarn("mountSidebar falló.", error);
    }

    refreshSidebarDomRefs();

    /*
      FIX:
      Si un build anterior dejó .sidebar-menu con pointer-events:none,
      lo reparamos al montar/refrescar.
    */
    ensureMenuInteractive("mount-and-refresh");

    return hasSidebarShell(AppCore);
  }

  function ensureRuntimeStateDefaults() {
    const mobile = isMobileViewport(MOBILE_BREAKPOINT);

    try {
      if (!AppCore.state || typeof AppCore.state !== "object") {
        AppCore.state = {};
      }

      const desiredOpen = getDesiredSidebarOpenState(AppCore);

      if (typeof AppCore.state.sidebarDesktopOpen !== "boolean") {
        AppCore.state.sidebarDesktopOpen = mobile
          ? true
          : Boolean(desiredOpen);
      }

      if (typeof AppCore.state.sidebarMobileOpen !== "boolean") {
        AppCore.state.sidebarMobileOpen = false;
      }

      AppCore.state.sidebarOpen = mobile
        ? Boolean(AppCore.state.sidebarMobileOpen)
        : Boolean(AppCore.state.sidebarDesktopOpen);

      AppCore.state.sidebarMode = mobile
        ? "mobile"
        : "desktop";

      AppCore.state.sidebarLastMode = AppCore.state.sidebarMode;

      return AppCore.state;
    } catch {
      return {};
    }
  }

  /* ======================================================
     USER
  ====================================================== */

  function renderUser() {
    refreshSidebarDomRefs();

    const {
      nameEl,
      avatarEl,
      userToggle,
      userDropdown,
    } = getElements(AppCore);

    const user = getUser(AppCore);

    const displayName = getDisplayName(AppCore, user);
    const username = getUsername(AppCore, user);
    const avatarText = getAvatarText(AppCore, user);
    const avatarUrl = getAvatarUrl(user);

    if (nameEl) {
      try {
        nameEl.textContent = displayName;

        if (username) {
          nameEl.dataset.username = username;
        } else {
          delete nameEl.dataset.username;
        }

        nameEl.removeAttribute("title");
        nameEl.removeAttribute("data-tooltip");
        nameEl.removeAttribute("aria-describedby");
      } catch {}
    }

    if (avatarEl) {
      try {
        renderAvatarImage(
          avatarEl,
          avatarUrl,
          displayName,
          avatarText
        );

        avatarEl.setAttribute(
          "aria-label",
          `Avatar de ${displayName}`
        );

        if (username) {
          avatarEl.dataset.username = username;
        } else {
          delete avatarEl.dataset.username;
        }

        avatarEl.removeAttribute("title");
        avatarEl.removeAttribute("data-tooltip");
        avatarEl.removeAttribute("aria-describedby");
      } catch {}
    }

    if (userToggle) {
      try {
        userToggle.setAttribute(
          "aria-label",
          `Abrir menú de usuario de ${displayName}`
        );

        userToggle.setAttribute(
          "aria-haspopup",
          "menu"
        );

        userToggle.removeAttribute("title");
        userToggle.removeAttribute("data-tooltip");
        userToggle.removeAttribute("aria-describedby");

        if (
          userDropdown?.id &&
          !userToggle.getAttribute("aria-controls")
        ) {
          userToggle.setAttribute(
            "aria-controls",
            userDropdown.id
          );
        }
      } catch {}
    }

    if (userDropdown) {
      try {
        userDropdown.removeAttribute("title");
        userDropdown.removeAttribute("data-tooltip");
        userDropdown.removeAttribute("aria-describedby");

        if (!userDropdown.getAttribute("role")) {
          userDropdown.setAttribute("role", "menu");
        }
      } catch {}
    }

    try {
      sanitizeFooterTooltipState(AppCore);
    } catch {}

    safeEmit("sidebar:user:rendered", {
      source: "SidebarUI",
      user,
      displayName,
      username,
      isAdmin: isAdmin(),
    });

    return true;
  }

  /* ======================================================
     ROUTE / ACTIVE MENU
  ====================================================== */

  function getBrowserPath() {
    if (!isBrowser()) {
      return "/";
    }

    try {
      const pathname = window.location.pathname || "/";
      const search = window.location.search || "";
      const hash = window.location.hash || "";

      if (
        hash.startsWith("#/") ||
        hash.startsWith("#!")
      ) {
        return hash
          .replace(/^#!\/?/, "/")
          .replace(/^#\/?/, "/") || "/";
      }

      return `${pathname}${search}`;
    } catch {
      return "/";
    }
  }

  function stripPublicUsernamePrefix(pathname = "/") {
    const value =
      safeText(pathname, "/")
        .replace(/^\/@[^/]+(?=\/|$)/i, "");

    return value || "/";
  }

  function stripSearchHash(path = "/") {
    const raw = safeText(path, "/");

    return raw
      .split("?")[0]
      .split("#")[0] || "/";
  }

  function normalizeRoutePath(path = "/") {
    let value = safeText(path, "/");

    if (!value) {
      value = "/";
    }

    try {
      if (isBrowser()) {
        const parsed = new URL(value, window.location.origin);

        if (
          parsed.hash &&
          (
            parsed.hash.startsWith("#/") ||
            parsed.hash.startsWith("#!")
          )
        ) {
          value = parsed.hash
            .replace(/^#!\/?/, "/")
            .replace(/^#\/?/, "/");
        } else {
          value = `${parsed.pathname || "/"}${parsed.search || ""}`;
        }
      }
    } catch {}

    value = stripSearchHash(value)
      .replace(/\\/g, "/")
      .replace(/\/{2,}/g, "/");

    if (!value.startsWith("/")) {
      value = `/${value}`;
    }

    value = stripPublicUsernamePrefix(value);

    if (
      value.length > 1 &&
      value.endsWith("/")
    ) {
      value = value.replace(/\/+$/g, "") || "/";
    }

    return value || "/";
  }

  function resolvePreferredRouteFromOptions(options = {}) {
    const opts = safeObject(options);
    const payload = safeObject(opts.payload);

    return first(
      opts.route,
      opts.path,
      opts.publicPath,
      opts.canonicalPath,

      payload.publicPath,
      payload.path,
      payload.requestedPath,
      payload.canonicalPath,
      payload.to,
      payload.url,
      payload.route
    );
  }

  function getCurrentRoutePath(preferred = "") {
    const normalizedPreferred = normalizeRoutePath(preferred || "");

    if (preferred && normalizedPreferred) {
      return normalizedPreferred;
    }

    /*
      Para active menu, la URL visible es la fuente más estable.
      Corrige el caso:
        /@cristian/usuarios
      donde AppCore.state.publicPath puede quedar un tick tarde.
    */
    const browserPath =
      normalizeRoutePath(getBrowserPath());

    const candidates = [
      browserPath,

      Router?.getCurrentPublicPath?.(),
      Router?.getCurrentCanonicalPath?.(),
      Router?.getCurrentPath?.(),

      AppCore?.state?.publicPath,
      AppCore?.state?.route,
      AppCore?.state?.canonicalPath,

      Router?.getPath?.(),
      Router?.currentPath,
    ];

    for (const candidate of candidates) {
      const value = normalizeRoutePath(candidate || "");

      if (value) {
        return value;
      }
    }

    return "/";
  }

  function getRouteFromElement(element = null) {
    if (!element) return "";

    const href = safeText(
      element.getAttribute?.("href"),
      ""
    );

    return safeText(
      first(
        element.dataset?.route,
        element.dataset?.href,
        element.dataset?.to,
        element.getAttribute?.("data-route"),
        element.getAttribute?.("data-href"),
        element.getAttribute?.("data-to"),
        href
      ),
      ""
    );
  }

  function getAllMenuItems() {
    const {
      sidebarMenu,
    } = getElements(AppCore);

    if (!sidebarMenu) {
      return [];
    }

    return queryAll(
      sidebarMenu,
      [
        "a[data-sidebar-nav='true']",
        "a.menu-item",
        "a[data-spa]",
        "a[data-route]",
        ".menu-item[data-route]",
      ].join(",")
    );
  }

  function getMenuItemRoute(element = null) {
    return normalizeRoutePath(
      getRouteFromElement(element)
    );
  }

  function restoreMenuHoverState() {
    if (!isBrowser()) {
      return false;
    }

    const {
      body,
      sidebar,
      sidebarMenu,
    } = getElements(AppCore);

    if (!sidebarMenu) {
      return false;
    }

    try {
      body?.classList?.remove?.("sidebar-visual-syncing");
      sidebar?.classList?.remove?.("is-visual-syncing");
      sidebarMenu?.classList?.remove?.("is-visual-syncing");

      delete sidebarMenu.dataset.visualSyncing;
      delete sidebarMenu.dataset.visualSyncReason;

      /*
        FIX CRÍTICO:
        Nunca restauramos "none".
        Si quedó "none", el menú muere y solo funciona el dropdown.
      */
      const previous =
        safeText(sidebarMenu.dataset.previousPointerEvents, "");

      if (
        previous &&
        previous !== "__empty__" &&
        previous !== "none"
      ) {
        sidebarMenu.style.pointerEvents = previous;
      } else {
        sidebarMenu.style.pointerEvents = "";
      }

      delete sidebarMenu.dataset.previousPointerEvents;
      delete sidebarMenu.dataset.previousPointerEventsSet;

      return true;
    } catch {
      return false;
    }
  }

  function clearVisualSyncTimer() {
    if (visualSyncTimer) {
      safeClearTimeout(visualSyncTimer);
      visualSyncTimer = null;
    }
  }

  function clearHoverFlushTimer({ restore = true } = {}) {
    if (hoverFlushTimer) {
      safeClearTimeout(hoverFlushTimer);
      hoverFlushTimer = null;
    }

    if (restore) {
      restoreMenuHoverState();
    }

    return true;
  }

  function clearRepairTimer() {
    if (repairTimer) {
      safeClearTimeout(repairTimer);
      repairTimer = null;
    }

    return true;
  }

  function flushMenuHoverState(reason = "hover-flush", durationMs = HOVER_FLUSH_MS) {
    if (!isBrowser()) {
      return false;
    }

    const {
      body,
      sidebar,
      sidebarMenu,
    } = getElements(AppCore);

    if (!sidebarMenu) {
      return false;
    }

    clearHoverFlushTimer({
      restore: true,
    });

    const duration =
      clampNumber(durationMs, 16, 600);

    try {
      body?.classList?.add?.("sidebar-visual-syncing");
      sidebar?.classList?.add?.("is-visual-syncing");
      sidebarMenu?.classList?.add?.("is-visual-syncing");

      sidebarMenu.dataset.visualSyncing = "true";
      sidebarMenu.dataset.visualSyncReason = reason;

      /*
        FIX CRÍTICO:
        NO usamos pointer-events:none.
        Eso bloqueaba todos los enlaces de .sidebar-menu si una carrera impedía restaurarlo.
      */
      if (!sidebarMenu.dataset.previousPointerEventsSet) {
        sidebarMenu.dataset.previousPointerEvents =
          sidebarMenu.style.pointerEvents || "__empty__";

        sidebarMenu.dataset.previousPointerEventsSet = "true";
      }

      const active = document.activeElement;

      if (
        active &&
        sidebarMenu.contains(active) &&
        typeof active.blur === "function"
      ) {
        active.blur();
      }
    } catch {}

    hoverFlushTimer = safeSetTimeout(() => {
      hoverFlushTimer = null;
      restoreMenuHoverState();
    }, duration);

    return true;
  }

  function ensureMenuInteractive(reason = "ensure-menu-interactive") {
    if (!isBrowser()) {
      return false;
    }

    const {
      sidebarMenu,
    } = getElements(AppCore);

    if (!sidebarMenu) {
      return false;
    }

    let repaired = false;

    try {
      if (sidebarMenu.style.pointerEvents === "none") {
        sidebarMenu.style.pointerEvents = "";
        repaired = true;
      }

      if (
        sidebarMenu.dataset.visualSyncing === "true" &&
        !hoverFlushTimer
      ) {
        restoreMenuHoverState();
        repaired = true;
      }

      if (sidebarMenu.hasAttribute("inert")) {
        sidebarMenu.removeAttribute("inert");
        repaired = true;
      }

      if (sidebarMenu.getAttribute("aria-disabled") === "true") {
        sidebarMenu.removeAttribute("aria-disabled");
        repaired = true;
      }
    } catch {}

    if (repaired) {
      safeEmit("sidebar:menu:interaction-restored", {
        source: "SidebarUI",
        reason,
        snapshot: getSidebarSnapshot(),
      });
    }

    return repaired;
  }

  function syncActiveRouteMarkers(route = "", options = {}) {
    refreshSidebarDomRefs();
    ensureMenuInteractive("sync-active-route-markers");

    const currentPath =
      normalizeRoutePath(route || getCurrentRoutePath());

    const activeItem =
      syncActiveMenuItem(
        AppCore,
        {
          ...safeObject(options),
          route: currentPath,
          publicPath: currentPath,
          path: currentPath,
          reason:
            safeText(
              options?.reason,
              "sidebar-ui:active-route"
            ),
          mutate: true,
        }
      );

    safeEmit("sidebar:active-route:synced", {
      source: "SidebarUI",
      route: currentPath,
      hasActiveItem: Boolean(activeItem),
      activeRoute:
        activeItem
          ? getMenuItemRoute(activeItem)
          : "",
    });

    return activeItem;
  }

  function scheduleSidebarVisualSync(reason = "visual-sync", options = {}) {
    const opts = safeObject(options);
    const delayMs = clampNumber(
      opts.delayMs,
      0,
      5000
    );

    const expectedGeneration =
      typeof opts.generation === "number"
        ? opts.generation
        : bindGeneration;

    const preferredRoute =
      resolvePreferredRouteFromOptions(opts);

    const route =
      preferredRoute
        ? normalizeRoutePath(preferredRoute)
        : "";

    clearVisualSyncTimer();

    ensureMenuInteractive(`schedule:${reason}:before`);

    if (opts.flushHover === true) {
      flushMenuHoverState(
        reason,
        opts.hoverFlushMs || HOVER_FLUSH_MS
      );
    }

    visualSyncTimer = safeSetTimeout(() => {
      visualSyncTimer = null;

      if (
        typeof expectedGeneration === "number" &&
        expectedGeneration !== bindGeneration
      ) {
        return;
      }

      afterPaint(() => {
        if (
          typeof expectedGeneration === "number" &&
          expectedGeneration !== bindGeneration
        ) {
          return;
        }

        refreshSidebarDomRefs();
        ensureMenuInteractive(`schedule:${reason}:paint`);

        const resolvedRoute =
          route || getCurrentRoutePath();

        const activeItem =
          syncActiveRouteMarkers(
            resolvedRoute,
            {
              reason,
            }
          );

        scheduleActiveMenuIndicator(AppCore, {
          ...opts,
          reason,
          route: resolvedRoute,
          publicPath: resolvedRoute,
          activeItem,
          delayMs: 0,
          reveal: opts.reveal !== false,
          force: opts.force === true,
        });
      });
    }, delayMs);

    return true;
  }

  function syncRouteAndIndicator(reason = "route-sync", options = {}) {
    const opts = safeObject(options);

    ensureMenuInteractive(`sync-route-and-indicator:${reason}`);

    const route =
      normalizeRoutePath(
        resolvePreferredRouteFromOptions(opts) ||
          getCurrentRoutePath()
      );

    const activeItem =
      syncActiveRouteMarkers(
        route,
        {
          reason,
        }
      );

    scheduleActiveMenuIndicator(AppCore, {
      ...opts,
      route,
      publicPath: route,
      activeItem,
      reason,
      delayMs:
        typeof opts.delayMs === "number"
          ? opts.delayMs
          : 16,
      reveal: opts.reveal !== false,
      force: opts.force === true,
    });

    return true;
  }

  /* ======================================================
     DROPDOWN
  ====================================================== */

  function closeDropdown() {
    refreshSidebarDomRefs();
    ensureMenuInteractive("close-dropdown");

    const result =
      closeDropdownBase(AppCore, runtimeState);

    scheduleSidebarVisualSync("close-dropdown", {
      delayMs: 24,
      flushHover: false,
      force: false,
    });

    return result;
  }

  function ensureSidebarOpenForUserMenu() {
    if (isShellBlocked()) {
      return false;
    }

    const open =
      getDesiredSidebarOpenState(AppCore);

    if (!open) {
      setSidebarOpen(true, {
        source: "ensure-user-menu",
      });

      return true;
    }

    return false;
  }

  function openDropdown() {
    if (isShellBlocked()) return false;

    refreshSidebarDomRefs();
    ensureMenuInteractive("open-dropdown");

    const result =
      openDropdownBase(
        AppCore,
        runtimeState,
        ensureSidebarOpenForUserMenu
      );

    scheduleSidebarVisualSync("open-dropdown", {
      delayMs: 32,
      flushHover: false,
      force: false,
    });

    return result;
  }

  function toggleDropdown() {
    if (isShellBlocked()) return false;

    refreshSidebarDomRefs();
    ensureMenuInteractive("toggle-dropdown");

    const result =
      toggleDropdownBase(
        AppCore,
        runtimeState,
        ensureSidebarOpenForUserMenu
      );

    scheduleSidebarVisualSync("toggle-dropdown", {
      delayMs: 32,
      flushHover: false,
      force: false,
    });

    return result;
  }

  /* ======================================================
     SIDEBAR STATE
  ====================================================== */

  function syncSidebarState() {
    refreshSidebarDomRefs();
    ensureMenuInteractive("sync-sidebar-state");

    return syncSidebarStateBase(
      AppCore,
      closeDropdown
    );
  }

  function repairSidebarState(reason = "repair-sidebar-state") {
    refreshSidebarDomRefs();
    ensureMenuInteractive(reason);

    const result =
      repairSidebarStateBase(
        AppCore,
        closeDropdown
      );

    scheduleSidebarVisualSync(reason, {
      delayMs: 48,
      force: true,
      flushHover: true,
    });

    return result;
  }

  function setSidebarOpen(open, options = {}) {
    if (isShellBlocked()) {
      return false;
    }

    ensureMenuInteractive("set-sidebar-open");

    const opts = safeObject(options);
    const nextOpen = Boolean(open);

    const previousOpen =
      getDesiredSidebarOpenState(AppCore);

    if (!nextOpen) {
      closeDropdown();
    }

    const result =
      setSidebarOpenBase(
        AppCore,
        nextOpen,
        closeDropdown
      );

    /*
      Evento informativo solo UI.
      No emitir sidebar:open:set para no reactivar transición paralela.
    */
    safeEmit("sidebar:ui:open:set", {
      source: "SidebarUI",
      open: nextOpen,
      previousOpen,
      changed: previousOpen !== nextOpen,
      requestedBy: opts.source || "SidebarUI",
      snapshot: getSidebarSnapshot(),
    });

    scheduleSidebarVisualSync("set-sidebar-open", {
      delayMs: previousOpen !== nextOpen
        ? VISUAL_SYNC_AFTER_TRANSITION_DELAY
        : 32,
      force: true,
      flushHover: true,
    });

    return Boolean(result);
  }

  function openSidebar() {
    if (isShellBlocked()) return false;

    return setSidebarOpen(true, {
      source: "openSidebar",
    });
  }

  function closeSidebar() {
    return setSidebarOpen(false, {
      source: "closeSidebar",
    });
  }

  function toggleSidebar() {
    if (isShellBlocked()) return false;

    const nextOpen =
      !getDesiredSidebarOpenState(AppCore);

    return setSidebarOpen(nextOpen, {
      source: "toggleSidebar",
    });
  }

  function getSidebarSnapshot() {
    const mobile = isMobileViewport(MOBILE_BREAKPOINT);
    const open = getDesiredSidebarOpenState(AppCore);
    const elements = getElements(AppCore);

    const activeItems =
      getAllMenuItems()
        .filter((item) => {
          return Boolean(
            item.classList?.contains?.("active") ||
              item.classList?.contains?.("is-active") ||
              item.getAttribute?.("aria-current") === "page" ||
              item.dataset?.active === "true"
          );
        })
        .map((item) => ({
          route:
            getMenuItemRoute(item),

          text:
            safeText(item.textContent, ""),

          hidden:
            isElementHiddenOrDisabled(item),
        }));

    return {
      mobile,
      open,

      desktopOpen:
        typeof AppCore?.state?.sidebarDesktopOpen === "boolean"
          ? Boolean(AppCore.state.sidebarDesktopOpen)
          : open,

      mobileOpen:
        typeof AppCore?.state?.sidebarMobileOpen === "boolean"
          ? Boolean(AppCore.state.sidebarMobileOpen)
          : false,

      dropdownOpen:
        Boolean(runtimeState.dropdownOpen),

      initialized,
      eventsBound,
      logoutInFlight,
      lastBindReason,
      bindGeneration,
      bindingEvents,
      lastBindAt,
      lastRepairAt,

      isAdmin:
        isAdmin(),

      shellHidden:
        isShellHidden(AppCore),

      realShellHidden:
        isRealShellHidden(AppCore),

      hasShell:
        hasSidebarShell(AppCore),

      route:
        getCurrentRoutePath(),

      dom: {
        hasSidebar:
          Boolean(elements.sidebar),

        hasSidebarMenu:
          Boolean(elements.sidebarMenu),

        hasToggle:
          Boolean(elements.toggleBtn),

        hasMobileToggle:
          Boolean(elements.mobileToggleBtn),

        hasUserToggle:
          Boolean(elements.userToggle),

        hasUserDropdown:
          Boolean(elements.userDropdown),

        hasLogout:
          Boolean(elements.logoutBtn),
      },

      dropdownDom: {
        userToggleId:
          elements.userToggle?.id || "",

        userToggleAriaExpanded:
          elements.userToggle?.getAttribute?.("aria-expanded") || "",

        userDropdownId:
          elements.userDropdown?.id || "",

        userDropdownHidden:
          Boolean(elements.userDropdown?.hidden),

        userDropdownAriaHidden:
          elements.userDropdown?.getAttribute?.("aria-hidden") || "",

        userDropdownClassName:
          elements.userDropdown?.className || "",
      },

      activeRouteDom: {
        currentRoute:
          getCurrentRoutePath(),

        activeItems,
      },

      indicatorDom: {
        ready:
          elements.sidebarMenu?.dataset?.indicatorReady || "",

        reason:
          elements.sidebarMenu?.dataset?.indicatorReason || "",

        route:
          elements.sidebarMenu?.dataset?.indicatorRoute || "",

        opacity:
          elements.sidebarMenu?.style?.getPropertyValue?.("--sidebar-indicator-opacity") || "",

        x:
          elements.sidebarMenu?.style?.getPropertyValue?.("--sidebar-indicator-x") || "",

        y:
          elements.sidebarMenu?.style?.getPropertyValue?.("--sidebar-indicator-y") || "",

        w:
          elements.sidebarMenu?.style?.getPropertyValue?.("--sidebar-indicator-w") || "",

        h:
          elements.sidebarMenu?.style?.getPropertyValue?.("--sidebar-indicator-h") || "",

        pointerEvents:
          elements.sidebarMenu?.style?.pointerEvents || "",

        visualSyncing:
          elements.sidebarMenu?.dataset?.visualSyncing || "",
      },
    };
  }

  function restoreSidebarState(snapshot) {
    if (!snapshot) return false;

    const mobileNow = isMobileViewport(MOBILE_BREAKPOINT);

    if (mobileNow) {
      return false;
    }

    const desiredOpen = Boolean(
      typeof snapshot.desktopOpen === "boolean"
        ? snapshot.desktopOpen
        : snapshot.open
    );

    try {
      if (AppCore?.state && typeof AppCore.state === "object") {
        AppCore.state.sidebarDesktopOpen = desiredOpen;
        AppCore.state.sidebarOpen = desiredOpen;
        AppCore.state.sidebarMode = "desktop";
        AppCore.state.sidebarLastMode = "desktop";
      }
    } catch {}

    if (getDesiredSidebarOpenState(AppCore) === desiredOpen) {
      syncSidebarState();

      scheduleSidebarVisualSync("restore-sidebar-state:same", {
        delayMs: 48,
        force: true,
        flushHover: true,
      });

      return true;
    }

    setSidebarOpen(desiredOpen, {
      source: "restoreSidebarState",
    });

    return true;
  }

  function closeSidebarOnMobileAfterNavigation() {
    return isMobileViewport(MOBILE_BREAKPOINT);
  }

  /* ======================================================
     VISIBILITY
  ====================================================== */

  function applyRoleVisibility() {
    refreshSidebarDomRefs();
    ensureMenuInteractive("apply-role-visibility");

    const result =
      applyRoleVisibilityBase(
        AppCore,
        null,
        isAdmin
      );

    scheduleSidebarVisualSync("apply-role-visibility", {
      delayMs: 32,
      force: true,
      flushHover: false,
    });

    return result;
  }

  /* ======================================================
     CLEANUP SCOPE
  ====================================================== */

  function getCleanupScope() {
    return SCOPE;
  }

  function cleanupFallbackDomEvents() {
    try {
      fallbackDomCleanup?.();
    } catch {}

    fallbackDomCleanup = null;
  }

  function cleanupBoundEvents() {
    cleanupFallbackDomEvents();
    clearVisualSyncTimer();
    clearHoverFlushTimer({
      restore: true,
    });
    clearRepairTimer();

    /*
      Importante:
      NO usamos AppCore.cleanup.run(SCOPE) en cada rebind.
      Eso dispara cleanup:disposed y puede activar el firebreak del bus.
      events.js ya devuelve cleanups locales y limpia sus scopes internos.
    */

    try {
      domEventsCleanup?.();
    } catch {}

    try {
      coreEventsCleanup?.();
    } catch {}

    domEventsCleanup = null;
    coreEventsCleanup = null;

    activeCleanupScope = null;
    eventsBound = false;

    ensureMenuInteractive("cleanup-bound-events");

    return true;
  }

  function cleanup() {
    cleanupBoundEvents();

    try {
      closeDropdown();
    } catch {}

    ensureMenuInteractive("cleanup");

    return true;
  }

  /* ======================================================
     ACTIONS
  ====================================================== */

  async function handleLogout() {
    const result =
      await handleLogoutBase({
        AppCore,
        Auth,
        Router,
        closeDropdown,
        renderUser,
        applyRoleVisibility,
        closeSidebarOnMobileAfterNavigation,
        getElements: () => getElements(AppCore),
        setLogoutInFlight,
        isLogoutInFlight,
      });

    scheduleSidebarVisualSync("logout", {
      delayMs: 80,
      force: true,
      flushHover: true,
    });

    return result;
  }

  async function navigateTo(route = "", options = {}) {
    const target = safeText(route, "");
    if (!target) return false;

    const opts = safeObject(options);

    try {
      if (typeof Router?.navigate === "function") {
        await Promise.resolve(
          Router.navigate(target, opts)
        );

        scheduleSidebarVisualSync("navigate:router.navigate", {
          route: target,
          delayMs: VISUAL_SYNC_AFTER_NAV_DELAY,
          force: true,
          flushHover: true,
        });

        return true;
      }

      if (typeof Router?.go === "function") {
        await Promise.resolve(
          Router.go(target, opts)
        );

        scheduleSidebarVisualSync("navigate:router.go", {
          route: target,
          delayMs: VISUAL_SYNC_AFTER_NAV_DELAY,
          force: true,
          flushHover: true,
        });

        return true;
      }

      if (typeof Router?.push === "function") {
        await Promise.resolve(
          Router.push(target, opts)
        );

        scheduleSidebarVisualSync("navigate:router.push", {
          route: target,
          delayMs: VISUAL_SYNC_AFTER_NAV_DELAY,
          force: true,
          flushHover: true,
        });

        return true;
      }

      if (typeof AppCore?.router?.navigate === "function") {
        await Promise.resolve(
          AppCore.router.navigate(target, opts)
        );

        scheduleSidebarVisualSync("navigate:appcore.router.navigate", {
          route: target,
          delayMs: VISUAL_SYNC_AFTER_NAV_DELAY,
          force: true,
          flushHover: true,
        });

        return true;
      }

      if (typeof AppCore?.navigate === "function") {
        await Promise.resolve(
          AppCore.navigate(target, opts)
        );

        scheduleSidebarVisualSync("navigate:appcore.navigate", {
          route: target,
          delayMs: VISUAL_SYNC_AFTER_NAV_DELAY,
          force: true,
          flushHover: true,
        });

        return true;
      }
    } catch (error) {
      safeWarn("Navegación sidebar vía Router falló.", error);
    }

    if (!isBrowser()) {
      return false;
    }

    try {
      window.history.pushState({}, "", target);
      window.dispatchEvent(new PopStateEvent("popstate"));

      scheduleSidebarVisualSync("navigate:history", {
        route: target,
        delayMs: VISUAL_SYNC_AFTER_NAV_DELAY,
        force: true,
        flushHover: true,
      });

      return true;
    } catch {}

    try {
      window.location.assign(target);
      return true;
    } catch {}

    return false;
  }

  async function handleNavigationElement(
    element = null,
    event = null,
    {
      skipNavigation = false,
    } = {}
  ) {
    if (!element || isModifiedClick(event)) {
      return false;
    }

    /*
      FIX:
      Garantiza que el menú no esté bloqueado por un estado visual anterior.
    */
    ensureMenuInteractive("before-navigation");

    const route = getRouteFromElement(element);

    if (
      !route ||
      isUnsafeHref(route) ||
      isExternalHref(route)
    ) {
      return false;
    }

    /*
      Clave:
      Marcamos y cortamos ANTES del await.
      Si esperamos a navigateTo(), otros listeners globales pueden capturar
      el mismo click y provocar doble navegación / carrera.
    */
    markSidebarEventHandled(event, "navigation:pre");
    preventAndStop(event);

    closeDropdown();

    const activeItem =
      syncActiveRouteMarkers(
        route,
        {
          reason: "navigation:pre",
        }
      );

    flushMenuHoverState(
      "navigation",
      HOVER_FLUSH_MS
    );

    scheduleActiveMenuIndicator(AppCore, {
      reason: "navigation:pre",
      route,
      publicPath: route,
      activeItem,
      delayMs: 0,
      force: true,
      reveal: true,
    });

    if (!skipNavigation) {
      await navigateTo(route, {
        source: "sidebar",
        replaceState: false,
      });
    } else {
      scheduleSidebarVisualSync("navigation-post-router", {
        route,
        delayMs: VISUAL_SYNC_AFTER_NAV_DELAY,
        force: true,
        flushHover: true,
      });
    }

    if (closeSidebarOnMobileAfterNavigation()) {
      closeSidebar();
    }

    ensureMenuInteractive("after-navigation");

    return true;
  }

  /* ======================================================
     FALLBACK DELEGATED EVENTS
  ====================================================== */

  function getActionElementFromEvent(event = null) {
    const target = event?.target || null;

    return closest(
      target,
      [
        "button",
        "a",
        "[data-sidebar-action]",
        "[data-action]",
        "[data-route]",
        "[data-spa]",
      ].join(",")
    );
  }

  function isInsideSidebarShell(element = null) {
    const {
      sidebar,
      sidebarMenu,
      userToggle,
      userDropdown,
      toggleBtn,
      mobileToggleBtn,
      logoutBtn,
    } = getElements(AppCore);

    return Boolean(
      containsElement(sidebar, element) ||
        containsElement(sidebarMenu, element) ||
        containsElement(userToggle, element) ||
        containsElement(userDropdown, element) ||
        containsElement(toggleBtn, element) ||
        containsElement(mobileToggleBtn, element) ||
        containsElement(logoutBtn, element)
    );
  }

  function isToggleSidebarElement(element = null) {
    if (!element) return false;

    const {
      toggleBtn,
      mobileToggleBtn,
    } = getElements(AppCore);

    const action = getDatasetAction(element);
    const id = safeText(element.id, "");

    return Boolean(
      containsElement(toggleBtn, element) ||
        containsElement(mobileToggleBtn, element) ||
        isAction(action, [
          "toggle-sidebar",
          "sidebar-toggle",
          "toggle-collapse",
          "collapse",
          "toggle",
          "mobile-sidebar-toggle",
          "open-sidebar",
          "close-sidebar",
        ]) ||
        [
          "sidebar-toggle",
          "sidebar-collapse",
          "sidebar-mobile-toggle",
          "mobile-sidebar-toggle",
          "toggleSidebar",
          "toggleSidebarMobile",
        ].includes(id)
    );
  }

  function isUserDropdownElement(element = null) {
    if (!element) return false;

    const {
      userToggle,
    } = getElements(AppCore);

    const action = getDatasetAction(element);
    const id = safeText(element.id, "");

    return Boolean(
      containsElement(userToggle, element) ||
        isAction(action, [
          "toggle-user-dropdown",
          "user-dropdown",
          "toggle-dropdown",
          "user-menu",
          "toggle-user-menu",
          "open-user-menu",
        ]) ||
        [
          "sidebar-user-toggle",
          "user-toggle",
          "sidebar-user-menu-toggle",
          "sidebarUserToggle",
          "userToggle",
        ].includes(id)
    );
  }

  function isLogoutElement(element = null) {
    if (!element) return false;

    const {
      logoutBtn,
    } = getElements(AppCore);

    const action = getDatasetAction(element);
    const id = safeText(element.id, "");

    return Boolean(
      containsElement(logoutBtn, element) ||
        isAction(action, [
          "logout",
          "signout",
          "sign-out",
          "log-out",
          "close-session",
          "cerrar-sesion",
        ]) ||
        [
          "logout-btn",
          "sidebar-logout",
          "sidebar-logout-btn",
        ].includes(id)
    );
  }

  function isNavigationElement(element = null) {
    if (!element) return false;

    const tag = safeText(element.tagName, "").toLowerCase();
    const action = getDatasetAction(element);
    const route = getRouteFromElement(element);

    if (
      isAction(action, [
        "toggle-sidebar",
        "sidebar-toggle",
        "toggle-collapse",
        "collapse",
        "toggle-user-dropdown",
        "user-dropdown",
        "toggle-dropdown",
        "user-menu",
        "toggle-user-menu",
        "logout",
        "signout",
        "sign-out",
      ])
    ) {
      return false;
    }

    return Boolean(
      tag === "a" ||
        element.hasAttribute?.("data-spa") ||
        element.hasAttribute?.("data-route") ||
        route
    );
  }

  function handleOutsideDropdownClick(event = null) {
    if (!runtimeState.dropdownOpen) {
      return false;
    }

    const {
      userDropdown,
      userToggle,
    } = getElements(AppCore);

    if (
      !containsElement(userDropdown, event?.target) &&
      !containsElement(userToggle, event?.target)
    ) {
      closeDropdown();
      return true;
    }

    return false;
  }

  function bindDirectUserToggleGuard(reason = "bind-direct-user-toggle", generation = bindGeneration) {
    const {
      userToggle,
    } = getElements(AppCore);

    if (!userToggle) {
      return () => {};
    }

    const onUserToggleClick = (event) => {
      if (generation !== bindGeneration) {
        return;
      }

      if (!initialized && !hasSidebarShell(AppCore)) {
        return;
      }

      if (!containsElement(userToggle, event?.target)) {
        return;
      }

      /*
        Listener en capture sobre el botón real.
        Evita doble toggle entre:
        - events.js document click
        - fallback delegado
        - bubbling del propio botón
      */
      markSidebarEventHandled(event, "direct-user-toggle");

      preventAndStop(event);

      refreshSidebarDomRefs();
      ensureMenuInteractive("direct-user-toggle");

      toggleDropdown();

      safeEmit("sidebar:user-toggle:direct", {
        source: "SidebarUI",
        reason,
        snapshot: getSidebarSnapshot(),
      });
    };

    const onUserToggleKeydown = (event) => {
      if (generation !== bindGeneration) {
        return;
      }

      if (!containsElement(userToggle, event?.target)) {
        return;
      }

      if (
        event?.key !== "Enter" &&
        event?.key !== " " &&
        event?.key !== "ArrowDown" &&
        event?.key !== "Escape"
      ) {
        return;
      }

      markSidebarEventHandled(event, "direct-user-toggle-keydown");

      preventAndStop(event);

      ensureMenuInteractive("direct-user-toggle-keydown");

      if (event.key === "Escape") {
        closeDropdown();
        return;
      }

      if (event.key === "ArrowDown") {
        openDropdown();
        return;
      }

      toggleDropdown();
    };

    try {
      userToggle.addEventListener(
        "click",
        onUserToggleClick,
        true
      );

      userToggle.addEventListener(
        "keydown",
        onUserToggleKeydown,
        true
      );
    } catch {
      return () => {};
    }

    return () => {
      try {
        userToggle.removeEventListener(
          "click",
          onUserToggleClick,
          true
        );
      } catch {}

      try {
        userToggle.removeEventListener(
          "keydown",
          onUserToggleKeydown,
          true
        );
      } catch {}
    };
  }

  function bindFallbackDomEvents(reason = "bind-fallback") {
    if (!isBrowser()) {
      return false;
    }

    cleanupFallbackDomEvents();

    const generation =
      bindGeneration;

    const directUserToggleCleanup =
      bindDirectUserToggleGuard(reason, generation);

    const onDocumentClick = async (event) => {
      if (generation !== bindGeneration) {
        return;
      }

      /*
        Primer guard de reparación:
        Si la primera pulsación llega con el menú bloqueado por legacy,
        al menos lo deja operativo para la siguiente.
      */
      ensureMenuInteractive("fallback-document-click");

      if (wasSidebarEventHandled(event)) {
        return;
      }

      if (!initialized && !hasSidebarShell(AppCore)) {
        return;
      }

      refreshSidebarDomRefs();

      const actionElement = getActionElementFromEvent(event);

      if (!actionElement) {
        handleOutsideDropdownClick(event);
        return;
      }

      if (!isInsideSidebarShell(actionElement)) {
        handleOutsideDropdownClick(event);
        return;
      }

      const defaultWasPrevented = Boolean(event.defaultPrevented);

      /*
        Si events.js ya procesó un control, no repetimos acción.
        Mata abrir/cerrar dropdown en el mismo click.
      */
      if (
        defaultWasPrevented &&
        (
          isToggleSidebarElement(actionElement) ||
          isUserDropdownElement(actionElement) ||
          isLogoutElement(actionElement)
        )
      ) {
        markSidebarEventHandled(
          event,
          "fallback-skip-default-prevented-control"
        );

        return;
      }

      if (isToggleSidebarElement(actionElement)) {
        markSidebarEventHandled(event, "fallback-toggle-sidebar");

        preventAndStop(event);

        toggleSidebar();

        safeEmit("sidebar:fallback:action", {
          source: "SidebarUI",
          action: "toggle-sidebar",
          reason,
        });

        return;
      }

      if (isUserDropdownElement(actionElement)) {
        markSidebarEventHandled(event, "fallback-toggle-dropdown");

        preventAndStop(event);

        toggleDropdown();

        safeEmit("sidebar:fallback:action", {
          source: "SidebarUI",
          action: "toggle-dropdown",
          reason,
          snapshot: getSidebarSnapshot(),
        });

        return;
      }

      if (isLogoutElement(actionElement)) {
        markSidebarEventHandled(event, "fallback-logout");

        preventAndStop(event);

        await handleLogout();

        safeEmit("sidebar:fallback:action", {
          source: "SidebarUI",
          action: "logout",
          reason,
        });

        return;
      }

      if (isNavigationElement(actionElement)) {
        const handled =
          await handleNavigationElement(
            actionElement,
            event,
            {
              skipNavigation: defaultWasPrevented,
            }
          );

        if (handled) {
          safeEmit("sidebar:fallback:action", {
            source: "SidebarUI",
            action: defaultWasPrevented
              ? "navigate-post-router"
              : "navigate",
            route: getRouteFromElement(actionElement),
            reason,
          });
        }
      }
    };

    const onDocumentKeydown = (event) => {
      if (generation !== bindGeneration) {
        return;
      }

      ensureMenuInteractive("fallback-document-keydown");

      if (wasSidebarEventHandled(event)) {
        return;
      }

      if (event?.key === "Escape" && runtimeState.dropdownOpen) {
        closeDropdown();
      }
    };

    const onWindowResize = () => {
      if (generation !== bindGeneration) {
        return;
      }

      ensureMenuInteractive("window-resize");

      scheduleSidebarVisualSync("window-resize", {
        delayMs: 120,
        force: true,
        flushHover: true,
      });
    };

    const onWindowPopState = () => {
      if (generation !== bindGeneration) {
        return;
      }

      ensureMenuInteractive("window-popstate");

      scheduleSidebarVisualSync("window-popstate", {
        delayMs: VISUAL_SYNC_AFTER_NAV_DELAY,
        force: true,
        flushHover: true,
      });
    };

    const onHashChange = () => {
      if (generation !== bindGeneration) {
        return;
      }

      ensureMenuInteractive("window-hashchange");

      scheduleSidebarVisualSync("window-hashchange", {
        delayMs: VISUAL_SYNC_AFTER_NAV_DELAY,
        force: true,
        flushHover: true,
      });
    };

    try {
      document.addEventListener(
        "click",
        onDocumentClick,
        false
      );

      document.addEventListener(
        "keydown",
        onDocumentKeydown,
        false
      );
    } catch {
      return false;
    }

    try {
      window.addEventListener(
        "resize",
        onWindowResize,
        false
      );

      window.addEventListener(
        "popstate",
        onWindowPopState,
        false
      );

      window.addEventListener(
        "hashchange",
        onHashChange,
        false
      );
    } catch {}

    fallbackDomCleanup = () => {
      try {
        directUserToggleCleanup?.();
      } catch {}

      try {
        document.removeEventListener(
          "click",
          onDocumentClick,
          false
        );
      } catch {}

      try {
        document.removeEventListener(
          "keydown",
          onDocumentKeydown,
          false
        );
      } catch {}

      try {
        window.removeEventListener(
          "resize",
          onWindowResize,
          false
        );

        window.removeEventListener(
          "popstate",
          onWindowPopState,
          false
        );

        window.removeEventListener(
          "hashchange",
          onHashChange,
          false
        );
      } catch {}
    };

    return true;
  }

  /* ======================================================
     EVENT BINDING
  ====================================================== */

  function bindEvents(reason = "bind", options = {}) {
    const opts = safeObject(options);

    lastBindReason = safeText(reason, "bind");

    const mounted = mountAndRefresh();

    if (!mounted) {
      safeWarn("No se pudo bindear sidebar: shell ausente.", {
        reason: lastBindReason,
      });

      return api;
    }

    ensureMenuInteractive(`bind-events:${lastBindReason}`);

    const ts = nowTs();

    /*
      Dedupe fuerte:
      Si ya está bindeado, no volvemos a limpiar/bindear salvo rebind explícito.
      Esto corta la tormenta:
        init -> repair -> bind -> event -> repair -> bind...
    */
    if (
      eventsBound &&
      opts.force !== true
    ) {
      scheduleSidebarVisualSync(`bind-events:skip:${lastBindReason}`, {
        delayMs: 48,
        force: true,
        flushHover: false,
        generation: bindGeneration,
      });

      safeEmit("sidebar:events:bind-skipped", {
        source: "SidebarUI",
        reason: lastBindReason,
        generation: bindGeneration,
        sinceLastBindMs: ts - lastBindAt,
        snapshot: getSidebarSnapshot(),
      });

      return api;
    }

    if (bindingEvents) {
      safeEmit("sidebar:events:bind-ignored", {
        source: "SidebarUI",
        reason: lastBindReason,
        cause: "binding-in-progress",
        generation: bindGeneration,
      });

      return api;
    }

    if (
      ts - lastBindAt < BIND_DEDUP_WINDOW_MS &&
      opts.force !== true
    ) {
      safeEmit("sidebar:events:bind-ignored", {
        source: "SidebarUI",
        reason: lastBindReason,
        cause: "dedupe-window",
        sinceLastBindMs: ts - lastBindAt,
        generation: bindGeneration,
      });

      return api;
    }

    bindingEvents = true;

    try {
      /*
        Primero invalidamos generación vieja.
        Luego limpiamos listeners antiguos.
      */
      bindGeneration += 1;

      cleanupBoundEvents();

      const scope = getCleanupScope();

      activeCleanupScope = scope;

      try {
        domEventsCleanup =
          bindDomEvents({
            AppCore,
            Router,
            Auth,
            state: runtimeState,
            scope,
            api,
            handleLogout,
            toggleSidebar,
            toggleDropdown,
            openDropdown,
            closeDropdown,
            closeSidebar,
            closeSidebarOnMobileAfterNavigation,
            syncSidebarState,
            getElements: () => getElements(AppCore),
            isMobileViewport: () =>
              isMobileViewport(MOBILE_BREAKPOINT),
            getDesiredSidebarOpenState: () =>
              getDesiredSidebarOpenState(AppCore),
          }) || null;
      } catch (error) {
        safeWarn("bindDomEvents falló.", error);
      }

      try {
        coreEventsCleanup =
          bindCoreEvents({
            AppCore,
            Router,
            Auth,
            state: runtimeState,
            scope,
            api,
            renderUser,
            applyRoleVisibility,
            syncSidebarState,
            closeDropdown,
            closeSidebarOnMobileAfterNavigation,
            getSidebarSnapshot,
            restoreSidebarState,
            getElements: () => getElements(AppCore),
          }) || null;
      } catch (error) {
        safeWarn("bindCoreEvents falló.", error);
      }

      bindFallbackDomEvents(lastBindReason);

      eventsBound = true;
      lastBindAt = nowTs();

      ensureMenuInteractive(`bind-events:${lastBindReason}:after`);

      scheduleSidebarVisualSync(`bind-events:${lastBindReason}`, {
        delayMs: 64,
        force: true,
        flushHover: false,
        generation: bindGeneration,
      });

      safeEmit("sidebar:events:bound", {
        source: "SidebarUI",
        reason: lastBindReason,
        generation: bindGeneration,
        activeCleanupScope,
        snapshot: getSidebarSnapshot(),
      });

      return api;
    } finally {
      bindingEvents = false;
    }
  }

  function rebindEvents(reason = "rebind") {
    return bindEvents(reason, {
      force: true,
    });
  }

  /* ======================================================
     REPAIR / REFRESH
  ====================================================== */

  function refresh(reason = "refresh") {
    mountAndRefresh();
    ensureRuntimeStateDefaults();
    ensureMenuInteractive(`refresh:${reason}`);

    try {
      sanitizeFooterTooltipState(AppCore);
    } catch {}

    syncSidebarState();
    renderUser();
    applyRoleVisibility();

    syncRouteAndIndicator(`refresh:${safeText(reason, "refresh")}`, {
      delayMs: VISUAL_SYNC_DEFAULT_DELAY,
      force: true,
    });

    safeEmit("sidebar:refreshed", {
      source: "SidebarUI",
      reason,
      snapshot: getSidebarSnapshot(),
    });

    return api;
  }

  function repair(reason = "repair", options = {}) {
    const opts =
      safeObject(options);

    const cleanReason =
      safeText(reason, "repair");

    const ts = nowTs();

    if (
      opts.force !== true &&
      ts - lastRepairAt < REPAIR_DEDUP_WINDOW_MS
    ) {
      scheduleSidebarVisualSync(`repair:deduped:${cleanReason}`, {
        delayMs: 48,
        force: true,
        flushHover: true,
      });

      safeEmit("sidebar:repair:deduped", {
        source: "SidebarUI",
        reason: cleanReason,
        sinceLastRepairMs: ts - lastRepairAt,
        snapshot: getSidebarSnapshot(),
      });

      return api;
    }

    lastRepairAt = ts;

    const mounted = mountAndRefresh();

    if (!mounted) {
      safeWarn("No se pudo reparar sidebar: shell ausente.", {
        reason: cleanReason,
      });

      return api;
    }

    ensureRuntimeStateDefaults();
    ensureMenuInteractive(`repair:${cleanReason}:before`);

    try {
      sanitizeFooterTooltipState(AppCore);
    } catch {}

    repairSidebarState(`repair:${cleanReason}`);
    renderUser();
    applyRoleVisibility();

    /*
      Repair no debe rebindeaer siempre.
      Si ya hay eventos vivos, solo resincroniza visualmente.
      Solo rebind() o repair(..., { rebind:true }) fuerzan limpieza/rebind.
    */
    if (opts.rebind === true) {
      bindEvents(cleanReason, {
        force: true,
      });
    } else if (!eventsBound) {
      bindEvents(cleanReason);
    } else {
      scheduleSidebarVisualSync(`repair:${cleanReason}:events-already-bound`, {
        delayMs: 48,
        force: true,
        flushHover: true,
      });
    }

    initialized = true;

    syncRouteAndIndicator(`repair:${cleanReason}`, {
      delayMs: 32,
      force: true,
    });

    afterPaint(() => {
      ensureMenuInteractive(`repair:${cleanReason}:after-paint`);

      syncRouteAndIndicator(`repair:${cleanReason}:after-paint`, {
        delayMs: 0,
        force: true,
      });
    });

    safeEmit("sidebar:repaired", {
      source: "SidebarUI",
      reason: cleanReason,
      snapshot: getSidebarSnapshot(),
      isAdmin: isAdmin(),
    });

    return api;
  }

  function scheduleRepair(reason = "scheduled-repair", options = {}) {
    const opts = safeObject(options);
    const delayMs = clampNumber(opts.delayMs, 0, 1000);

    clearRepairTimer();

    repairTimer = safeSetTimeout(() => {
      repairTimer = null;

      repair(reason, {
        ...opts,
        force: opts.force === true,
      });
    }, delayMs);

    return api;
  }

  /* ======================================================
     MODULE REGISTRATION
  ====================================================== */

  function registerModule() {
    try {
      if (
        AppCore?.modules &&
        typeof AppCore.modules.has === "function" &&
        typeof AppCore.modules.register === "function"
      ) {
        if (!AppCore.modules.has("sidebar")) {
          AppCore.modules.register("sidebar", api);
        }

        if (!AppCore.modules.has("SidebarUI")) {
          AppCore.modules.register("SidebarUI", api);
        }

        return true;
      }
    } catch {}

    try {
      if (
        AppCore?.modules &&
        typeof AppCore.modules.register === "function"
      ) {
        AppCore.modules.register("sidebar", api);
        AppCore.modules.register("SidebarUI", api);
        return true;
      }
    } catch {}

    try {
      if (
        AppCore?.modules &&
        typeof AppCore.modules.set === "function"
      ) {
        AppCore.modules.set("sidebar", api);
        AppCore.modules.set("SidebarUI", api);
        return true;
      }
    } catch {}

    try {
      AppCore.modules = AppCore.modules || {};
      AppCore.modules.sidebar = api;
      AppCore.modules.SidebarUI = api;
      return true;
    } catch {}

    return false;
  }

  function exposeGlobalBridge() {
    if (!isBrowser()) {
      return false;
    }

    try {
      window.SidebarUI = api;
      window.OnionSidebarUI = api;
      return true;
    } catch {
      return false;
    }
  }

  /* ======================================================
     INIT
  ====================================================== */

  function init() {
    if (initialized) {
      /*
        Idempotente:
        init() repetido NO debe hacer repair + rebind.
        Solo refresca visual/usuario/roles.
      */
      registerModule();
      exposeGlobalBridge();

      return refresh("init-already-initialized");
    }

    const mounted = mountAndRefresh();

    if (!mounted) {
      safeWarn("No se pudo montar sidebar.");
      return api;
    }

    ensureRuntimeStateDefaults();
    ensureMenuInteractive("init");

    try {
      sanitizeFooterTooltipState(AppCore);
    } catch {}

    syncSidebarState();
    renderUser();
    applyRoleVisibility();
    closeDropdown();

    /*
      No llamamos AppCore.syncUserUI() aquí.
      App UI ya coordina la sincronización global.
      Si se llama desde aquí, puede reentrar en SidebarUI durante init.
    */

    initialized = true;

    registerModule();
    exposeGlobalBridge();

    bindEvents("init");

    syncRouteAndIndicator("init", {
      delayMs: 32,
      force: true,
      flushHover: false,
    });

    afterPaint(() => {
      ensureMenuInteractive("init:after-paint");

      syncRouteAndIndicator("init:after-paint", {
        delayMs: 0,
        force: true,
        flushHover: false,
      });
    });

    safeEmit("sidebar:ready", {
      source: "SidebarUI",
      initialized: true,
      isAdmin: isAdmin(),
      snapshot: getSidebarSnapshot(),
    });

    safeLog("ready", getSidebarSnapshot());

    return api;
  }

  function destroy() {
    cleanup();

    initialized = false;
    logoutInFlight = false;
    runtimeState.dropdownOpen = false;
    lastBindReason = "";
    bindingEvents = false;
    lastBindAt = 0;
    lastRepairAt = 0;
    bindGeneration += 1;

    restoreMenuHoverState();
    ensureMenuInteractive("destroy");

    safeEmit("sidebar:destroyed", {
      source: "SidebarUI",
      initialized: false,
    });

    return api;
  }

  /* ======================================================
     DEBUG
  ====================================================== */

  function debugDropdown() {
    refreshSidebarDomRefs();
    ensureMenuInteractive("debug-dropdown");

    const {
      userToggle,
      userDropdown,
    } = getElements(AppCore);

    const snapshot = {
      stateDropdownOpen:
        Boolean(runtimeState.dropdownOpen),

      hasUserToggle:
        Boolean(userToggle),

      hasUserDropdown:
        Boolean(userDropdown),

      userToggleId:
        userToggle?.id || "",

      userToggleClassName:
        userToggle?.className || "",

      userToggleAriaExpanded:
        userToggle?.getAttribute?.("aria-expanded") || "",

      userToggleHidden:
        Boolean(userToggle?.hidden),

      userToggleInert:
        Boolean(userToggle?.hasAttribute?.("inert")),

      userToggleParentHidden:
        Boolean(
          userToggle?.closest?.("[hidden],[inert],[aria-hidden='true']")
        ),

      userDropdownId:
        userDropdown?.id || "",

      userDropdownClassName:
        userDropdown?.className || "",

      userDropdownHidden:
        Boolean(userDropdown?.hidden),

      userDropdownAriaHidden:
        userDropdown?.getAttribute?.("aria-hidden") || "",

      userDropdownInert:
        Boolean(userDropdown?.hasAttribute?.("inert")),

      userDropdownParentHidden:
        Boolean(
          userDropdown?.closest?.("[hidden],[inert],[aria-hidden='true']")
        ),

      sidebarSnapshot:
        getSidebarSnapshot(),
    };

    try {
      console.log("[SidebarUI:dropdown]", snapshot);
    } catch {}

    return snapshot;
  }

  function debugIndicator() {
    refreshSidebarDomRefs();
    ensureMenuInteractive("debug-indicator");

    const {
      sidebarMenu,
    } = getElements(AppCore);

    const activeItem =
      syncActiveMenuItem(
        AppCore,
        {
          reason: "debug-indicator",
          mutate: false,
        }
      );

    const snapshot = {
      route:
        getCurrentRoutePath(),

      browserRoute:
        normalizeRoutePath(getBrowserPath()),

      stateRoute:
        normalizeRoutePath(AppCore?.state?.route || ""),

      statePublicPath:
        normalizeRoutePath(AppCore?.state?.publicPath || ""),

      routerPublicPath:
        normalizeRoutePath(Router?.getCurrentPublicPath?.() || ""),

      hasSidebarMenu:
        Boolean(sidebarMenu),

      hasActiveItem:
        Boolean(activeItem),

      activeRoute:
        activeItem
          ? getMenuItemRoute(activeItem)
          : "",

      activeText:
        safeText(activeItem?.textContent, ""),

      indicatorReady:
        sidebarMenu?.dataset?.indicatorReady || "",

      indicatorReason:
        sidebarMenu?.dataset?.indicatorReason || "",

      indicatorRoute:
        sidebarMenu?.dataset?.indicatorRoute || "",

      visualSyncing:
        sidebarMenu?.dataset?.visualSyncing || "",

      pointerEvents:
        sidebarMenu?.style?.pointerEvents || "",

      variables: {
        x:
          sidebarMenu?.style?.getPropertyValue?.("--sidebar-indicator-x") || "",

        y:
          sidebarMenu?.style?.getPropertyValue?.("--sidebar-indicator-y") || "",

        w:
          sidebarMenu?.style?.getPropertyValue?.("--sidebar-indicator-w") || "",

        h:
          sidebarMenu?.style?.getPropertyValue?.("--sidebar-indicator-h") || "",

        opacity:
          sidebarMenu?.style?.getPropertyValue?.("--sidebar-indicator-opacity") || "",
      },

      menuItems:
        getAllMenuItems().map((item) => ({
          route:
            getMenuItemRoute(item),

          rawRoute:
            getRouteFromElement(item),

          text:
            safeText(item.textContent, ""),

          hidden:
            isElementHiddenOrDisabled(item),

          active:
            item.classList?.contains?.("active") ||
            item.classList?.contains?.("is-active") ||
            item.getAttribute?.("aria-current") === "page" ||
            item.dataset?.active === "true",
        })),
    };

    try {
      console.log("[SidebarUI:indicator]", snapshot);
    } catch {}

    return snapshot;
  }

  function debug() {
    refreshSidebarDomRefs();
    ensureMenuInteractive("debug");

    const snapshot = getSidebarSnapshot();

    try {
      console.log("[SidebarUI]", snapshot);
    } catch {}

    return snapshot;
  }

  /* ======================================================
     API
  ====================================================== */

  const api = {
    init,
    destroy,
    cleanup,

    repair,
    scheduleRepair,
    refresh,
    sync: refresh,
    render: refresh,

    bind: bindEvents,
    rebind: rebindEvents,
    bindEvents,
    rebindEvents,

    renderUser,
    applyRoleVisibility,
    syncSidebarState,
    repairSidebarState,

    openDropdown,
    closeDropdown,
    toggleDropdown,

    openSidebar,
    closeSidebar,
    toggleSidebar,
    setSidebarOpen,

    updateToggleLabel: () =>
      updateToggleLabel(AppCore),

    syncIndicator:
      (reason = "api:syncIndicator") =>
        scheduleSidebarVisualSync(reason, {
          delayMs: 0,
          force: true,
          flushHover: false,
        }),

    syncRouteAndIndicator,

    scheduleIndicatorSync:
      scheduleSidebarVisualSync,

    flushHover:
      flushMenuHoverState,

    restoreHover:
      restoreMenuHoverState,

    ensureMenuInteractive,

    handleLogout,

    isAdmin,

    debug,
    debugDropdown,
    debugIndicator,

    getSnapshot: getSidebarSnapshot,
    getState: getSidebarSnapshot,

    get initialized() {
      return initialized;
    },

    get eventsBound() {
      return eventsBound;
    },
  };

  return api;
})();

export default SidebarUI;

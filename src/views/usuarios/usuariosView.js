/* =========================================================
   Onion SPA - Usuarios View
   Archivo: src/views/usuarios/usuariosView.js

   ADMIN EXPERIENCE MODE · VIEW REAL · HARDENED · FINAL 14/10
   CLEAN VIEW · NO INLINE CSS · NO STYLE INJECTION · CSP READY
   VARIABLES.CSS + UI.CSS + /css/views/usuarios/index.css READY

   RESPONSABILIDADES:
   - punto de entrada real de la vista usuarios
   - render principal con template final unificado
   - paginación visual fija a 5 usuarios por vista
   - carga inicial robusta con fallback a cache
   - refresh con loader SOLO en historial / tabla
   - apertura de usuario con estado visual de loading
   - apertura de modal / flujo de creación de usuario
   - bind de eventos de pantalla
   - evitar doble bind de listeners
   - soportar destroy limpio del router
   - permitir reload con rerender seguro
   - coordinar acciones y modales sin mezclar responsabilidades
   - vista solo admin con fail-safe visual y bloqueo de acciones
   - búsqueda local conectada al template limpio
   - filtros locales conectados al template limpio
   - sin CSS inline
   - sin <style> inyectado por JS
   - sin estilos creados por JS
   - sin duplicidad visual de acceso restringido

   HARDENING PRO:
   - render inicial inmediato
   - bind inmediato tras primer render para evitar pérdida de clicks
   - cola segura para crear usuario antes de app ready
   - carga posterior segura
   - anti-race token
   - cleanup total
   - click delegation sólida
   - fallback elegante si los modales aún no existen
   - bloqueo de acciones antes de app ready sin perder intención del usuario
   - anti spam click en apertura rápida
   - compatibilidad con template nuevo data-usuarios-action
   - template controlado por state real
   - límite fijo de 5 usuarios por hoja
   - acceso admin robusto sin sticky forbidden
   - una sola pantalla de acceso restringido
   - CSS externo obligatorio:
       /src/css/views/usuarios/index.css
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  usuariosState,
  setHydrated,
} from "./usuarios.state.js";

import {
  loadUsuarios,
  hydrateFromCache,
} from "./usuarios.api.js";

import {
  getUsuarios,
} from "./usuarios.store.js";

import renderUsuariosTableTemplate from "./usuarios.table.template.js";

import {
  DEFAULT_PAGE_SIZE as MODEL_DEFAULT_PAGE_SIZE,
  normalizeUsuariosCollection,
  sortUsuariosByUpdatedDesc,
  paginateUsuarios,
  findUsuarioById,
} from "./usuarios.model.js";

import {
  openUsuarioAction,
  copyUsuarioIdAction,
  exportUsuariosCsvAction,
  createUsuarioAction,
  refreshUsuarioDetailAction,
} from "./usuarios.actions.js";

export const UsuariosView = (() => {
  "use strict";

  /* =========================================================
     CONSTANTS
  ========================================================= */

  const SCOPE = "view:usuarios";
  const MODULE = "usuarios";
  const VIEW_NAME = "UsuariosView";
  const VERSION = "14.0.0";

  const PAGE_SIZE = 5;
  const FALLBACK_MODEL_PAGE_SIZE = Number(MODEL_DEFAULT_PAGE_SIZE || 5) || 5;

  const CREATE_CLICK_THROTTLE_MS = 450;
  const SEARCH_DEBOUNCE_MS = 120;

  const ADMIN_ROLE_KEYS = new Set([
    "admin",
    "administrator",
    "administrador",
    "super_admin",
    "superadmin",
    "super_administrador",
    "owner",
    "root",
  ]);

  const FILTER_KEYS = new Set([
    "all",
    "active",
    "pending",
    "blocked",
  ]);

  /* =========================================================
     LOCAL RUNTIME
  ========================================================= */

  let initialized = false;
  let mounted = false;
  let destroyed = false;

  let inflightInit = null;
  let inflightReload = null;

  let bindingsCleanup = null;
  let renderToken = 0;

  let pendingCreateRequest = false;
  let lastCreateClickAt = 0;

  let accessSyncTimer = null;
  let searchDebounceTimer = null;

  /* =========================================================
     SAFE HELPERS
  ========================================================= */

  function isBrowser() {
    return (
      typeof window !== "undefined" &&
      typeof document !== "undefined"
    );
  }

  function safeLog(...args) {
    try {
      AppCore?.utils?.log?.("[UsuariosView]", ...args);
    } catch {}

    try {
      if (process.env?.NODE_ENV !== "production") {
        console.log("[UsuariosView]", ...args);
      }
    } catch {}
  }

  function safeWarn(...args) {
    try {
      AppCore?.utils?.warn?.("[UsuariosView]", ...args);
    } catch {}

    try {
      console.warn("[UsuariosView]", ...args);
    } catch {}
  }

  function safeEmit(event = "", payload = {}) {
    const eventName = safeText(event, "");

    if (!eventName) return false;

    let emitted = false;

    try {
      AppCore?.events?.emit?.(eventName, payload);
      emitted = true;
    } catch {}

    try {
      if (isBrowser()) {
        window.dispatchEvent(
          new CustomEvent(eventName, {
            detail: payload,
          })
        );

        emitted = true;
      }
    } catch {}

    return emitted;
  }

  function safeText(value, fallback = "") {
    if (value === null || value === undefined) return fallback;

    const text = String(value)
      .replace(/[\r\n\t]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    return text || fallback;
  }

  function safeNumber(value, fallback = 0) {
    if (value === null || value === undefined || value === "") {
      return fallback;
    }

    const n = Number(value);

    return Number.isFinite(n) ? n : fallback;
  }

  function safeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function safeObject(value) {
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};
  }

  function toArray(value) {
    if (Array.isArray(value)) return value;
    if (value === null || value === undefined) return [];

    return [value];
  }

  function first(...values) {
    for (const value of values) {
      if (value === undefined || value === null) continue;
      if (typeof value === "string" && value.trim() === "") continue;
      if (Array.isArray(value) && value.length === 0) continue;

      return value;
    }

    return null;
  }

  function getEventPayload(event = null) {
    return safeObject(
      first(
        event?.detail,
        event?.payload,
        event
      )
    );
  }

  function normalizeKey(value = "") {
    return safeText(value, "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[\s-]+/g, "_")
      .replace(/[^a-z0-9_:.]/g, "")
      .replace(/^_+|_+$/g, "")
      .trim();
  }

  function normalizeSearch(value = "") {
    return safeText(value, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeFilter(value = "all") {
    const key = normalizeKey(value);

    if (!key || ["all", "todo", "todos", "todas", "total"].includes(key)) {
      return "all";
    }

    if (
      [
        "active",
        "activo",
        "activa",
        "activos",
        "activas",
        "enabled",
        "habilitado",
        "habilitada",
      ].includes(key)
    ) {
      return "active";
    }

    if (
      [
        "pending",
        "pendiente",
        "pendientes",
        "invited",
        "invitado",
        "invitada",
      ].includes(key)
    ) {
      return "pending";
    }

    if (
      [
        "blocked",
        "bloqueado",
        "bloqueada",
        "bloqueados",
        "bloqueadas",
        "inactive",
        "inactivo",
        "inactiva",
        "disabled",
        "deshabilitado",
        "deshabilitada",
        "suspended",
        "suspendido",
        "suspendida",
        "locked",
      ].includes(key)
    ) {
      return "blocked";
    }

    return FILTER_KEYS.has(key) ? key : "all";
  }

  function splitRoles(value = "") {
    return safeText(value, "")
      .split(/[,\s|]+/)
      .map(normalizeKey)
      .filter(Boolean);
  }

  function normalizeRoles(value) {
    if (typeof value === "string") {
      return splitRoles(value);
    }

    return toArray(value)
      .flat(Infinity)
      .flatMap((item) => {
        if (typeof item === "string") {
          return splitRoles(item);
        }

        return [normalizeKey(item)];
      })
      .filter(Boolean);
  }

  function waitForPaint() {
    return new Promise((resolve) => {
      try {
        if (!isBrowser()) {
          resolve();
          return;
        }

        if (typeof window.requestAnimationFrame !== "function") {
          window.setTimeout(resolve, 0);
          return;
        }

        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(resolve);
        });
      } catch {
        resolve();
      }
    });
  }

  function getContainer() {
    if (!isBrowser()) return null;

    try {
      return (
        AppCore?.dom?.viewContainer ||
        document.getElementById("view-container") ||
        document.querySelector("[data-view-container]") ||
        null
      );
    } catch {
      return null;
    }
  }

  function nextRenderToken() {
    renderToken += 1;
    return renderToken;
  }

  function isActiveToken(token) {
    return !destroyed && token === renderToken;
  }

  function showToast(message = "", type = "info") {
    const text = safeText(message, "");
    const toastType = normalizeKey(type) || "info";

    if (!text) return false;

    try {
      if (typeof AppCore?.toast?.[toastType] === "function") {
        AppCore.toast[toastType](text);
        return true;
      }
    } catch {}

    try {
      if (typeof AppCore?.toast?.show === "function") {
        AppCore.toast.show(text, toastType);
        return true;
      }
    } catch {}

    try {
      if (typeof AppCore?.ui?.toast?.[toastType] === "function") {
        AppCore.ui.toast[toastType](text);
        return true;
      }
    } catch {}

    try {
      if (typeof AppCore?.ui?.toast?.show === "function") {
        AppCore.ui.toast.show({
          message: text,
          type: toastType,
        });
        return true;
      }
    } catch {}

    try {
      if (isBrowser() && typeof window.Toast?.show === "function") {
        window.Toast.show({
          message: text,
          type: toastType,
        });
        return true;
      }
    } catch {}

    return false;
  }

  function safeErrorMessage(error = null) {
    return safeText(
      first(
        error?.message,
        error?.response?.message,
        error?.response?.data?.message,
        error?.data?.message,
        error?.response?.error,
        error?.data?.error,
        error?.error,
        error?.code,
        "No se pudo cargar la colección de usuarios."
      ),
      "No se pudo cargar la colección de usuarios."
    );
  }

  function callSafe(fn, ...args) {
    try {
      if (typeof fn === "function") {
        return fn(...args);
      }
    } catch (error) {
      safeWarn("callSafe falló:", error);
    }

    return undefined;
  }

  /* =========================================================
     ADMIN ACCESS
  ========================================================= */

  function isAdminRole(value = "") {
    return ADMIN_ROLE_KEYS.has(normalizeKey(value));
  }

  function getCurrentUser() {
    return safeObject(
      first(
        AppCore?.state?.user,
        AppCore?.state?.currentUser,
        AppCore?.state?.sessionUser,
        AppCore?.state?.authUser,
        AppCore?.state?.session?.user,

        usuariosState?.user,
        usuariosState?.currentUser,
        usuariosState?.sessionUser,
        usuariosState?.authUser
      )
    );
  }

  function collectRoleCandidates() {
    const user = getCurrentUser();
    const raw = safeObject(user?.raw);
    const profile = safeObject(user?.profile);
    const rawProfile = safeObject(raw?.profile);
    const session = safeObject(AppCore?.state?.session);

    const roleValues = [
      AppCore?.state?.role,
      AppCore?.state?.rol,
      AppCore?.state?.userRole,
      AppCore?.state?.type,

      session?.role,
      session?.rol,
      session?.userRole,

      usuariosState?.role,
      usuariosState?.rol,
      usuariosState?.userRole,

      user?.role,
      user?.rol,
      user?.userRole,
      user?.type,
      user?.userType,
      user?.perfil,

      profile?.role,
      profile?.rol,
      profile?.userRole,
      profile?.type,
      profile?.perfil,

      raw?.role,
      raw?.rol,
      raw?.userRole,
      raw?.type,
      raw?.userType,
      raw?.perfil,

      rawProfile?.role,
      rawProfile?.rol,
      rawProfile?.userRole,
      rawProfile?.type,
      rawProfile?.perfil,
    ];

    const roleArrays = [
      AppCore?.state?.roles,
      AppCore?.state?.permissions,
      AppCore?.state?.scopes,
      AppCore?.state?.groups,

      session?.roles,
      session?.permissions,
      session?.scopes,
      session?.groups,

      usuariosState?.roles,
      usuariosState?.permissions,
      usuariosState?.scopes,
      usuariosState?.groups,

      user?.roles,
      user?.permissions,
      user?.scopes,
      user?.groups,
      user?.authorities,

      profile?.roles,
      profile?.permissions,
      profile?.scopes,
      profile?.groups,

      raw?.roles,
      raw?.permissions,
      raw?.scopes,
      raw?.groups,
      raw?.authorities,

      rawProfile?.roles,
      rawProfile?.permissions,
      rawProfile?.scopes,
      rawProfile?.groups,
    ];

    return [
      ...roleValues,
      ...roleArrays.flatMap((value) => toArray(value)),
    ]
      .flat(Infinity)
      .flatMap((value) => normalizeRoles(value))
      .filter(Boolean);
  }

  function hasPositiveAdminFlag() {
    const user = getCurrentUser();
    const raw = safeObject(user?.raw);
    const profile = safeObject(user?.profile);
    const rawProfile = safeObject(raw?.profile);
    const session = safeObject(AppCore?.state?.session);

    return [
      AppCore?.state?.isAdmin,
      AppCore?.state?.admin,
      AppCore?.state?.isSuperAdmin,
      AppCore?.state?.superAdmin,
      AppCore?.state?.canManageUsers,
      AppCore?.state?.canAccessUsers,

      session?.isAdmin,
      session?.admin,
      session?.isSuperAdmin,
      session?.superAdmin,
      session?.canManageUsers,
      session?.canAccessUsers,

      usuariosState?.isAdmin,
      usuariosState?.admin,
      usuariosState?.canManageUsers,
      usuariosState?.canAccessUsers,

      user?.isAdmin,
      user?.admin,
      user?.isSuperAdmin,
      user?.superAdmin,
      user?.canManageUsers,
      user?.canAccessUsers,

      profile?.isAdmin,
      profile?.admin,
      profile?.isSuperAdmin,
      profile?.superAdmin,
      profile?.canManageUsers,
      profile?.canAccessUsers,

      raw?.isAdmin,
      raw?.admin,
      raw?.isSuperAdmin,
      raw?.superAdmin,
      raw?.canManageUsers,
      raw?.canAccessUsers,

      rawProfile?.isAdmin,
      rawProfile?.admin,
      rawProfile?.isSuperAdmin,
      rawProfile?.superAdmin,
      rawProfile?.canManageUsers,
      rawProfile?.canAccessUsers,
    ].some((value) => {
      return value === true || value === "true" || value === 1 || value === "1";
    });
  }

  function isAuthPending() {
    const state = safeObject(AppCore?.state);
    const user = getCurrentUser();

    const hasKnownAuthFlag =
      typeof state.authenticated === "boolean" ||
      typeof state.ready === "boolean" ||
      typeof state.bootCompleted === "boolean" ||
      typeof state.appReady === "boolean";

    const hasToken = Boolean(
      safeText(
        first(
          state.token,
          state.accessToken,
          state.session?.token,
          state.session?.accessToken
        ),
        ""
      )
    );

    const hasUser = Boolean(Object.keys(user).length);

    return !hasKnownAuthFlag && !hasToken && !hasUser;
  }

  function getAdminAccessSnapshot() {
    const roles = collectRoleCandidates();
    const hasAdminRole = roles.some(isAdminRole);
    const hasAdminFlag = hasPositiveAdminFlag();

    const authenticated = Boolean(AppCore?.state?.authenticated);

    const hasToken = Boolean(
      safeText(
        first(
          AppCore?.state?.token,
          AppCore?.state?.accessToken,
          AppCore?.state?.session?.token,
          AppCore?.state?.session?.accessToken
        ),
        ""
      )
    );

    const pending = isAuthPending();
    const allowed = Boolean(hasAdminRole || hasAdminFlag);

    /*
      No se usa usuariosState.forbidden como fuente de verdad.
      Era sticky y bloqueaba la vista aunque luego el usuario fuese admin.
    */
    const denied = !pending && !allowed;

    return {
      allowed,
      denied,
      pending,
      roles,
      hasAdminRole,
      hasAdminFlag,
      authenticated,
      hasToken,
      user: getCurrentUser(),
    };
  }

  function isAdminAccessAllowed() {
    return getAdminAccessSnapshot().allowed;
  }

  function requireAdminAction() {
    const access = getAdminAccessSnapshot();

    if (access.allowed) {
      return true;
    }

    if (access.pending) {
      showToast("Validando permisos de administrador...", "info");
      return false;
    }

    showToast("La vista de usuarios está reservada para administradores.", "error");
    return false;
  }

  /* =========================================================
     ACCESS STATES UI
     CSS externo:
       /src/css/views/usuarios/index.css
  ========================================================= */

  function renderAccessPendingHtml() {
    return `
      <section
        class="usuarios-access-state usuarios-access-state--pending"
        data-usuarios-access-state="pending"
      >
        <div class="usuarios-access-card">
          <h1 class="usuarios-access-title">Validando permisos</h1>

          <p class="usuarios-access-text">
            Estamos comprobando tu sesión antes de cargar la administración de usuarios.
          </p>

          <span class="usuarios-access-debug">auth pending</span>
        </div>
      </section>
    `;
  }

  function renderRestrictedHtml() {
    const access = getAdminAccessSnapshot();

    return `
      <section
        class="usuarios-access-state usuarios-access-state--restricted"
        data-usuarios-access-state="restricted"
      >
        <div class="usuarios-access-card">
          <h1 class="usuarios-access-title">Acceso restringido</h1>

          <p class="usuarios-access-text">
            La vista de usuarios está reservada para administradores.
          </p>

          <span class="usuarios-access-debug">
            ${escapeForText(safeText(access.roles.join(" · "), "sin rol admin"))}
          </span>
        </div>
      </section>
    `;
  }

  function escapeForText(value = "") {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /* =========================================================
     CLEANUP
  ========================================================= */

  function cleanupBindings() {
    try {
      bindingsCleanup?.();
    } catch {}

    bindingsCleanup = null;

    try {
      AppCore?.cleanup?.run?.(SCOPE);
    } catch {}
  }

  function clearAccessSyncTimer() {
    try {
      if (accessSyncTimer) {
        clearTimeout(accessSyncTimer);
      }
    } catch {}

    accessSyncTimer = null;
  }

  function clearSearchDebounceTimer() {
    try {
      if (searchDebounceTimer) {
        clearTimeout(searchDebounceTimer);
      }
    } catch {}

    searchDebounceTimer = null;
  }

  /* =========================================================
     STATE HELPERS
  ========================================================= */

  function setState(patch = {}) {
    if (!patch || typeof patch !== "object") {
      return usuariosState;
    }

    Object.assign(usuariosState, patch);

    return usuariosState;
  }

  function syncAccessState() {
    const access = getAdminAccessSnapshot();

    setState({
      pageSize: PAGE_SIZE,

      isAdmin: access.allowed,
      canManageUsers: access.allowed,
      canAccessUsers: access.allowed,

      /*
        Informativo para template/debug.
        No alimenta isAdminAccessAllowed().
      */
      forbidden: access.denied,
      accessDenied: access.denied,
      accessPending: access.pending,
      accessRoles: access.roles,
    });

    return access;
  }

  function ensureBaseState() {
    usuariosState.pageSize = PAGE_SIZE;

    if (!Number.isFinite(Number(usuariosState.page))) {
      usuariosState.page = 1;
    }

    usuariosState.page = Math.max(1, safeNumber(usuariosState.page, 1));

    if (typeof usuariosState.loading !== "boolean") {
      usuariosState.loading = false;
    }

    if (typeof usuariosState.refreshing !== "boolean") {
      usuariosState.refreshing = false;
    }

    if (typeof usuariosState.creating !== "boolean") {
      usuariosState.creating = false;
    }

    usuariosState.openingUserId = safeText(
      usuariosState.openingUserId,
      ""
    );

    usuariosState.error = safeText(
      usuariosState.error,
      ""
    );

    usuariosState.search = normalizeSearch(
      first(
        usuariosState.search,
        usuariosState.searchQuery,
        usuariosState.query,
        ""
      )
    );

    usuariosState.searchQuery = usuariosState.search;
    usuariosState.query = usuariosState.search;

    usuariosState.statusFilter = normalizeFilter(
      first(
        usuariosState.statusFilter,
        usuariosState.activeFilter,
        usuariosState.filter,
        "all"
      )
    );

    usuariosState.activeFilter = usuariosState.statusFilter;
    usuariosState.filter = usuariosState.statusFilter;

    usuariosState.remoteCount = Math.max(
      0,
      safeNumber(usuariosState.remoteCount, 0)
    );

    syncAccessState();

    return usuariosState;
  }

  function markIdle() {
    setState({
      loading: false,
      refreshing: false,
    });
  }

  function markLoadedOk(items = []) {
    const total = Math.max(
      safeArray(items).length,
      safeNumber(usuariosState.remoteCount, safeArray(items).length)
    );

    const access = syncAccessState();

    setState({
      remoteCount: total,
      loaded: true,
      hydrated: true,
      error: "",
      loading: false,
      refreshing: false,
      pageSize: PAGE_SIZE,
      isAdmin: access.allowed,
    });

    try {
      setHydrated?.(true);
    } catch {}

    return total;
  }

  function getRawItems() {
    try {
      return getUsuarios();
    } catch {
      return [];
    }
  }

  function getStableUserId(item = {}) {
    return safeText(
      first(
        item?.userId,
        item?.usuarioId,
        item?.id,
        item?.code,
        item?.username,
        item?.userName,
        item?.email,

        item?.raw?.userId,
        item?.raw?.usuarioId,
        item?.raw?.id,
        item?.raw?.code,
        item?.raw?.username,
        item?.raw?.userName,
        item?.raw?.email
      ),
      ""
    );
  }

  function patchRawFallback(normalizedItem = {}, rawItem = {}) {
    const item = safeObject(normalizedItem);
    const raw = safeObject(first(item.raw, rawItem));

    return {
      ...item,
      raw,

      userId: first(item.userId, raw.userId, raw.usuarioId, raw.id, raw.username, raw.email),
      usuarioId: first(item.usuarioId, raw.usuarioId, raw.userId, raw.id),
      id: first(item.id, raw.id, raw.userId, raw.usuarioId, raw.username, raw.email),

      username: first(item.username, raw.username, raw.userName, raw.userId, raw.id),
      userName: first(item.userName, raw.userName, raw.username, raw.userId, raw.id),

      email: first(item.email, raw.email, raw.mail, raw.userEmail),
      mail: first(item.mail, raw.mail, raw.email),

      name: first(item.name, raw.name, raw.nombre, raw.fullName, raw.displayName),
      nombre: first(item.nombre, raw.nombre, raw.name, raw.fullName, raw.displayName),
      fullName: first(item.fullName, raw.fullName, raw.displayName, raw.name, raw.nombre),
      displayName: first(item.displayName, raw.displayName, raw.fullName, raw.name, raw.nombre),

      phone: first(item.phone, raw.phone, raw.telefono, raw.mobile),
      telefono: first(item.telefono, raw.telefono, raw.phone, raw.mobile),

      city: first(
        item.city,
        item.ciudad,
        item.locationCity,
        raw.city,
        raw.ciudad,
        raw.locationCity,
        raw?.location?.city,
        raw?.ubicacion?.ciudad,
        raw?.address?.city,
        raw?.direccion?.ciudad
      ),

      status: first(item.status, raw.status, raw.estado, raw.state),
      estado: first(item.estado, raw.estado, raw.status, raw.state),

      role: first(item.role, raw.role, raw.rol, raw.userRole),
      rol: first(item.rol, raw.rol, raw.role, raw.userRole),

      avatar: first(item.avatar, raw.avatar, raw.avatarUrl, raw.photoUrl, raw.imageUrl),
      avatarUrl: first(item.avatarUrl, raw.avatarUrl, raw.avatar, raw.photoUrl, raw.imageUrl),

      createdAt: first(item.createdAt, raw.createdAt, raw.created_at, raw.fechaCreacion, raw.registeredAt),
      updatedAt: first(item.updatedAt, raw.updatedAt, raw.updated_at, raw.modifiedAt),
      lastLoginAt: first(item.lastLoginAt, raw.lastLoginAt, raw.last_login_at, raw.lastAccessAt, raw.ultimoAcceso),
    };
  }

  function getItems() {
    try {
      const rawItems = safeArray(getRawItems());
      const rawById = new Map();

      rawItems.forEach((rawItem) => {
        const id = getStableUserId(rawItem);

        if (id && !rawById.has(id)) {
          rawById.set(id, rawItem);
        }
      });

      const normalizedItems = safeArray(
        normalizeUsuariosCollection(rawItems)
      );

      const patchedItems = normalizedItems.map((item, index) => {
        const id = getStableUserId(item);
        const matchingRaw = rawById.get(id) || rawItems[index] || {};

        return patchRawFallback(item, matchingRaw);
      });

      return sortUsuariosByUpdatedDesc(patchedItems);
    } catch (error) {
      safeWarn("getItems falló:", error);

      try {
        return sortUsuariosByUpdatedDesc(safeArray(getRawItems()));
      } catch {
        return [];
      }
    }
  }

  function getPaginationMeta(items = []) {
    return paginateUsuarios(
      safeArray(items),
      usuariosState.page || 1,
      usuariosState.pageSize || PAGE_SIZE || FALLBACK_MODEL_PAGE_SIZE
    );
  }

  function clampPageAgainstItems(items = []) {
    const pagination = getPaginationMeta(items);

    if (safeNumber(usuariosState.page, 1) !== pagination.page) {
      usuariosState.page = pagination.page;
    }

    usuariosState.pageSize = PAGE_SIZE;

    return pagination;
  }

  function hydrateBestEffort() {
    let hydrated = false;

    try {
      hydrateFromCache?.();
    } catch (error) {
      safeWarn("hydrateFromCache falló:", error);
    }

    try {
      if (getItems().length) {
        setState({
          hydrated: true,
          loaded: true,
        });

        setHydrated?.(true);
        hydrated = true;
      }
    } catch {}

    return hydrated;
  }

  /* =========================================================
     APP READY HARDENING
  ========================================================= */

  function isDomReady() {
    return Boolean(
      isBrowser() &&
      document.body &&
      document.readyState !== "loading"
    );
  }

  function isAppReady() {
    return Boolean(
      AppCore?.state?.ready ||
        AppCore?.state?.bootCompleted ||
        AppCore?.state?.appReady ||
        AppCore?.state?.authenticated !== undefined
    );
  }

  function canInteract() {
    return !destroyed && isDomReady() && isAppReady();
  }

  function throttleCreateClick() {
    const now = Date.now();

    if (now - lastCreateClickAt < CREATE_CLICK_THROTTLE_MS) {
      return false;
    }

    lastCreateClickAt = now;

    return true;
  }

  /* =========================================================
     MODAL BRIDGES
  ========================================================= */

  function openUsuarioModalBridge(detail = null) {
    if (!detail) return false;

    try {
      const modal = window?.OnionUsuariosModal;

      if (modal?.getState?.()?.isOpen && typeof modal.update === "function") {
        modal.update(detail);
        return true;
      }

      if (typeof modal?.open === "function") {
        modal.open(detail);
        return true;
      }

      if (typeof modal?.show === "function") {
        modal.show(detail);
        return true;
      }
    } catch (error) {
      safeWarn("OnionUsuariosModal hook falló:", error);
    }

    try {
      const hook =
        window?.renderUsuarioDetailModal ||
        window?.renderUsuarioModal ||
        window?.renderUsuariosModal ||
        window?.openUsuarioModal ||
        window?.openUsuariosModal;

      if (typeof hook === "function") {
        hook(detail);
        return true;
      }
    } catch (error) {
      safeWarn("usuario modal hook falló:", error);
    }

    safeEmit("usuarios:modal:open", {
      detail,
      source: MODULE,
      view: VIEW_NAME,
    });

    return true;
  }

  async function openCreateUsuarioBridge(draft = {}) {
    try {
      const modal = window?.OnionUsuariosCreateModal;

      if (typeof modal?.open === "function") {
        modal.open(draft);
        return true;
      }

      if (typeof modal?.show === "function") {
        modal.show(draft);
        return true;
      }
    } catch (error) {
      safeWarn("OnionUsuariosCreateModal hook falló:", error);
    }

    try {
      const hook =
        window?.renderUsuariosCreateModal ||
        window?.renderUsuarioCreateModal ||
        window?.openUsuarioCreateModal ||
        window?.openUsuariosCreateModal;

      if (typeof hook === "function") {
        hook(draft);
        return true;
      }
    } catch (error) {
      safeWarn("create modal hook falló:", error);
    }

    try {
      if (typeof createUsuarioAction === "function") {
        const result = await createUsuarioAction({
          silent: false,
          draft,
        });

        if (result !== false) {
          return Boolean(result ?? true);
        }
      }
    } catch (error) {
      safeWarn("createUsuarioAction falló:", error);
      throw error;
    }

    safeEmit("usuarios:create-modal:open", {
      draft,
      source: MODULE,
      view: VIEW_NAME,
    });

    return true;
  }

  function flushPendingCreate() {
    if (!pendingCreateRequest) return false;
    if (!canInteract()) return false;

    pendingCreateRequest = false;
    lastCreateClickAt = 0;

    setState({
      creating: false,
    });

    void handleCreateUsuario({
      skipThrottle: true,
      fromPending: true,
    });

    return true;
  }

  /* =========================================================
     DOM POST-RENDER
     Sin estilos inline: solo clases.
  ========================================================= */

  function removeErrorBanner(container) {
    try {
      container
        ?.querySelector?.("[data-usuarios-error-banner='true']")
        ?.remove?.();
    } catch {}
  }

  function applyErrorStateToDom(container) {
    if (!container) return;

    removeErrorBanner(container);

    const message = safeText(usuariosState.error, "");
    if (!message) return;

    const historyHead =
      container.querySelector(".usuarios-history-head") ||
      container.querySelector("[data-usuarios-history-head='true']") ||
      container.querySelector("[data-usuarios-table-head='true']") ||
      container.querySelector(".content-wrapper");

    if (!historyHead) return;

    const banner = document.createElement("div");

    banner.className = "usuarios-error-banner";
    banner.setAttribute("data-usuarios-error-banner", "true");
    banner.setAttribute("role", "status");
    banner.textContent = message;

    historyHead.insertAdjacentElement("afterend", banner);
  }

  function decorateDom(container) {
    if (!container) return container;

    applyErrorStateToDom(container);

    try {
      container.setAttribute("data-usuarios-mounted", "true");
      container.setAttribute("data-usuarios-view-version", VERSION);
    } catch {}

    return container;
  }

  /* =========================================================
     RENDER
  ========================================================= */

  function buildHtml() {
    const allItems = getItems();
    const pagination = clampPageAgainstItems(allItems);
    const access = syncAccessState();

    const remoteCount = Math.max(
      allItems.length,
      safeNumber(usuariosState.remoteCount, allItems.length)
    );

    let innerHtml = "";

    if (access.pending) {
      innerHtml = renderAccessPendingHtml();
    } else if (!access.allowed) {
      innerHtml = renderRestrictedHtml();
    } else {
      innerHtml = renderUsuariosTableTemplate({
        items: allItems,
        totalCount: remoteCount,
        remoteCount,

        page: pagination.page,
        pageSize: PAGE_SIZE,
        totalPages: pagination.totalPages,

        filter: usuariosState.statusFilter,
        statusFilter: usuariosState.statusFilter,
        activeFilter: usuariosState.statusFilter,

        search: usuariosState.search,
        searchQuery: usuariosState.search,
        query: usuariosState.search,

        lastUpdatedAt: usuariosState.lastSyncAt || "",

        title: "Usuarios y accesos",
        subtitle:
          "Consulta usuarios registrados, revisa su estado, ubicación y última conexión desde una vista clara, compacta y alineada con el sistema.",

        /*
          Siempre false aquí para evitar pantalla restringida duplicada.
          El bloqueo visual lo controla exclusivamente esta view.
        */
        forbidden: false,
        accessDenied: false,
        accessPending: false,

        isAdmin: true,
        canManageUsers: true,
        canAccessUsers: true,

        user: getCurrentUser(),

        state: {
          ...usuariosState,

          pageSize: PAGE_SIZE,

          filter: usuariosState.statusFilter,
          statusFilter: usuariosState.statusFilter,
          activeFilter: usuariosState.statusFilter,

          search: usuariosState.search,
          searchQuery: usuariosState.search,
          query: usuariosState.search,

          forbidden: false,
          accessDenied: false,
          accessPending: false,

          isAdmin: true,
          canManageUsers: true,
          canAccessUsers: true,
        },
      });
    }

    return `
      <section
        class="panel-content dashboard ready usuarios-panel"
        data-view="usuarios"
        data-module="usuarios"
        data-usuarios-view="true"
      >
        <div class="content-wrapper usuarios-content-wrapper">
          ${innerHtml}
        </div>
      </section>
    `;
  }

  function render() {
    if (destroyed) return null;

    const container = getContainer();

    if (!container) {
      safeWarn("No existe #view-container para renderizar usuarios.");
      return null;
    }

    ensureBaseState();

    try {
      AppCore?.setDocumentTitle?.("Usuarios");
    } catch {}

    try {
      AppCore?.clearDynamicContainers?.();
    } catch {}

    try {
      container.innerHTML = buildHtml();
      mounted = true;
    } catch (error) {
      safeWarn("Render HTML falló:", error);
      return null;
    }

    decorateDom(container);

    try {
      setHydrated?.(true);
    } catch {}

    setState({
      hydrated: true,
    });

    safeEmit("usuarios:rendered", {
      source: MODULE,
      view: VIEW_NAME,
      version: VERSION,
      mounted: true,
      state: getPublicStateSnapshot(),
    });

    return container;
  }

  function rerender() {
    if (destroyed) return null;

    const container = render();

    if (!destroyed && container) {
      bind();
    }

    return container;
  }

  /* =========================================================
     DATA
  ========================================================= */

  async function loadData({
    force = false,
    silent = false,
    asRefresh = false,
  } = {}) {
    if (destroyed) return getItems();

    const access = syncAccessState();

    if (!access.allowed) {
      setState({
        loading: false,
        refreshing: false,
        pageSize: PAGE_SIZE,
      });

      render();

      return getItems();
    }

    const itemsBefore = getItems();
    const hasVisibleData = itemsBefore.length > 0;

    setState({
      error: "",
      loading: !hasVisibleData && !silent,
      refreshing: hasVisibleData && asRefresh && !silent,
      pageSize: PAGE_SIZE,
    });

    render();

    try {
      await loadUsuarios({
        force,
      });

      const itemsAfter = getItems();

      markLoadedOk(itemsAfter);

      setState({
        lastSyncAt: new Date().toISOString(),
        pageSize: PAGE_SIZE,
      });

      clampPageAgainstItems(itemsAfter);

      safeEmit("usuarios:loaded", {
        items: itemsAfter,
        count: itemsAfter.length,
        source: MODULE,
        view: VIEW_NAME,
      });

      return itemsAfter;
    } catch (error) {
      const message = safeErrorMessage(error);

      safeWarn("loadUsuarios falló:", error);

      setState({
        error: message,
        loaded: true,
        hydrated: true,
        loading: false,
        refreshing: false,
      });

      try {
        setHydrated?.(true);
      } catch {}

      if (!silent) {
        showToast(message, "error");
      }

      safeEmit("usuarios:load:error", {
        error,
        message,
        source: MODULE,
        view: VIEW_NAME,
      });

      return getItems();
    } finally {
      markIdle();
    }
  }

  async function renderAndLoad({
    force = false,
    asRefresh = false,
    silent = false,
  } = {}) {
    const token = nextRenderToken();

    hydrateBestEffort();
    ensureBaseState();

    render();

    if (!destroyed) {
      bind();
    }

    flushPendingCreate();

    await loadData({
      force,
      silent,
      asRefresh,
    });

    if (!isActiveToken(token)) {
      return api;
    }

    render();

    if (!destroyed) {
      bind();
    }

    flushPendingCreate();

    return api;
  }

  /* =========================================================
     ACCESS SYNC
  ========================================================= */

  function scheduleAccessSync({ maybeLoad = true } = {}) {
    clearAccessSyncTimer();

    accessSyncTimer = setTimeout(async () => {
      if (destroyed) return;

      const beforeAllowed = Boolean(usuariosState.isAdmin);
      const access = syncAccessState();

      rerender();

      if (
        maybeLoad &&
        access.allowed &&
        !beforeAllowed &&
        !usuariosState.loading
      ) {
        await reload({
          force: false,
          asRefresh: false,
          silent: true,
        });
      }
    }, 0);

    return accessSyncTimer;
  }

  /* =========================================================
     FILTER / SEARCH FLOWS
  ========================================================= */

  function setSearchQuery(value = "") {
    const search = normalizeSearch(value);

    setState({
      search,
      searchQuery: search,
      query: search,
      page: 1,
      pageSize: PAGE_SIZE,
    });

    rerender();

    safeEmit("usuarios:search:change", {
      search,
      source: MODULE,
      view: VIEW_NAME,
    });

    return search;
  }

  function scheduleSearchQuery(value = "") {
    clearSearchDebounceTimer();

    searchDebounceTimer = setTimeout(() => {
      searchDebounceTimer = null;

      if (!destroyed) {
        setSearchQuery(value);
      }
    }, SEARCH_DEBOUNCE_MS);

    return searchDebounceTimer;
  }

  function setStatusFilter(value = "all") {
    const statusFilter = normalizeFilter(value);

    setState({
      filter: statusFilter,
      statusFilter,
      activeFilter: statusFilter,
      page: 1,
      pageSize: PAGE_SIZE,
    });

    rerender();

    safeEmit("usuarios:filter:change", {
      filter: statusFilter,
      statusFilter,
      source: MODULE,
      view: VIEW_NAME,
    });

    return statusFilter;
  }

  function clearFilters() {
    clearSearchDebounceTimer();

    setState({
      search: "",
      searchQuery: "",
      query: "",
      filter: "all",
      statusFilter: "all",
      activeFilter: "all",
      page: 1,
      pageSize: PAGE_SIZE,
    });

    rerender();

    safeEmit("usuarios:filters:clear", {
      source: MODULE,
      view: VIEW_NAME,
    });

    return true;
  }

  /* =========================================================
     PAGE ACTIONS
  ========================================================= */

  function goToPage(page = 1) {
    if (!requireAdminAction()) return usuariosState.page || 1;

    if (usuariosState.loading || usuariosState.refreshing) {
      return usuariosState.page || 1;
    }

    const items = getItems();

    const pagination = paginateUsuarios(
      items,
      page,
      PAGE_SIZE
    );

    setState({
      page: pagination.page,
      pageSize: PAGE_SIZE,
    });

    rerender();

    return pagination.page;
  }

  function goPrevPage() {
    return goToPage((usuariosState.page || 1) - 1);
  }

  function goNextPage() {
    return goToPage((usuariosState.page || 1) + 1);
  }

  function changePageSize() {
    setState({
      pageSize: PAGE_SIZE,
      page: 1,
    });

    rerender();

    return PAGE_SIZE;
  }

  /* =========================================================
     ACTION FLOWS
  ========================================================= */

  async function handleOpenUsuario(userId = "") {
    if (!requireAdminAction()) return null;

    const id = safeText(userId, "");

    if (!id) {
      showToast("Usuario inválido.", "error");
      return null;
    }

    if (usuariosState.openingUserId) {
      return null;
    }

    setState({
      openingUserId: id,
    });

    rerender();
    await waitForPaint();

    try {
      const detail = await openUsuarioAction({
        userId: id,
        preferFresh: true,
        silent: true,
      });

      if (!detail) {
        showToast("No se pudo abrir el usuario.", "error");
        return null;
      }

      openUsuarioModalBridge(detail);

      return detail;
    } catch (error) {
      safeWarn("handleOpenUsuario falló:", error);
      showToast("No se pudo abrir el usuario.", "error");
      return null;
    } finally {
      setState({
        openingUserId: "",
      });

      if (!destroyed) rerender();
    }
  }

  async function handleRefreshUsuarioFromModal(userId = "") {
    if (!requireAdminAction()) return null;

    const id = safeText(userId, "");

    if (!id) return null;

    try {
      const detail = await refreshUsuarioDetailAction({
        userId: id,
        silent: true,
      });

      if (detail) {
        openUsuarioModalBridge(detail);
      }

      return detail;
    } catch (error) {
      safeWarn("handleRefreshUsuarioFromModal falló:", error);
      showToast("No se pudo refrescar el usuario.", "error");
      return null;
    }
  }

  async function handleCopyUsuarioId(userId = "") {
    if (!requireAdminAction()) return false;

    const id = safeText(userId, "");

    if (!id) {
      showToast("No hay referencia para copiar.", "error");
      return false;
    }

    try {
      return await copyUsuarioIdAction({
        userId: id,
        silent: false,
      });
    } catch (error) {
      safeWarn("handleCopyUsuarioId falló:", error);
      showToast("No se pudo copiar la referencia.", "error");
      return false;
    }
  }

  function handleExportCsv() {
    if (!requireAdminAction()) return false;

    try {
      return exportUsuariosCsvAction({
        silent: false,
      });
    } catch (error) {
      safeWarn("handleExportCsv falló:", error);
      showToast("No se pudo exportar el historial.", "error");
      return false;
    }
  }

  async function handleCreateUsuario(options = {}) {
    if (!requireAdminAction()) return false;

    const opts = safeObject(options);
    const skipThrottle = Boolean(opts.skipThrottle);

    if (usuariosState.creating && !pendingCreateRequest) {
      return false;
    }

    if (!skipThrottle && !throttleCreateClick()) {
      return false;
    }

    if (!canInteract()) {
      pendingCreateRequest = true;

      setState({
        creating: true,
      });

      rerender();

      showToast("Preparando formulario...", "info");

      return false;
    }

    pendingCreateRequest = false;

    setState({
      creating: true,
    });

    rerender();
    await waitForPaint();

    try {
      const opened = await openCreateUsuarioBridge({});

      if (!opened) {
        showToast("No se pudo abrir el formulario de usuario.", "error");
      }

      return opened;
    } catch (error) {
      safeWarn("handleCreateUsuario falló:", error);
      showToast("No se pudo crear el usuario.", "error");
      return false;
    } finally {
      setState({
        creating: false,
      });

      if (!destroyed) rerender();
    }
  }

  /* =========================================================
     BINDINGS
  ========================================================= */

  function getActionTarget(event, actions = []) {
    const selectors = actions
      .map((action) => {
        return [
          `[data-usuarios-action="${action}"]`,
          `[data-action="${action}"]`,
        ].join(",");
      })
      .join(",");

    if (!selectors) return null;

    return event.target?.closest?.(selectors) || null;
  }

  function getUserIdFromElement(element = null) {
    if (!element) return "";

    return safeText(
      first(
        element.dataset?.userId,
        element.dataset?.usuarioId,
        element.dataset?.username,
        element.getAttribute?.("data-user-id"),
        element.getAttribute?.("data-usuario-id"),
        element.getAttribute?.("data-username")
      ),
      ""
    );
  }

  function bindNativeActions(container) {
    if (!container) {
      return () => {};
    }

    const onClick = async (event) => {
      if (destroyed) return;

      const detailBtn = getActionTarget(event, [
        "detail",
        "open",
        "open-user",
        "view-user",
      ]);

      if (detailBtn) {
        event.preventDefault();
        event.stopPropagation();

        await handleOpenUsuario(getUserIdFromElement(detailBtn));
        return;
      }

      const copyBtn = getActionTarget(event, [
        "copy",
        "copy-user-id",
        "copy-id",
      ]);

      if (copyBtn) {
        event.preventDefault();
        event.stopPropagation();

        await handleCopyUsuarioId(getUserIdFromElement(copyBtn));
        return;
      }

      const pageBtn = getActionTarget(event, [
        "page",
        "go-page",
      ]);

      if (pageBtn) {
        event.preventDefault();

        const page = safeNumber(
          first(
            pageBtn.dataset?.page,
            pageBtn.getAttribute?.("data-page")
          ),
          usuariosState.page || 1
        );

        goToPage(page);
        return;
      }

      const prevBtn = getActionTarget(event, [
        "prev-page",
        "pagination-prev",
      ]);

      if (prevBtn) {
        event.preventDefault();
        goPrevPage();
        return;
      }

      const nextBtn = getActionTarget(event, [
        "next-page",
        "pagination-next",
      ]);

      if (nextBtn) {
        event.preventDefault();
        goNextPage();
        return;
      }

      const filterBtn = getActionTarget(event, [
        "filter",
        "filter-usuarios",
      ]);

      if (filterBtn) {
        event.preventDefault();

        const filter = first(
          filterBtn.dataset?.filter,
          filterBtn.dataset?.filterStatus,
          filterBtn.getAttribute?.("data-filter"),
          filterBtn.getAttribute?.("data-filter-status"),
          "all"
        );

        setStatusFilter(filter);
        return;
      }

      const clearSearchBtn = getActionTarget(event, [
        "clear-search",
      ]);

      if (clearSearchBtn) {
        event.preventDefault();
        setSearchQuery("");
        return;
      }

      const clearFiltersBtn = getActionTarget(event, [
        "clear-filters",
      ]);

      if (clearFiltersBtn) {
        event.preventDefault();
        clearFilters();
        return;
      }

      const exportBtn =
        getActionTarget(event, [
          "export",
          "export-csv",
        ]) ||
        event.target?.closest?.("#usuarios-export-btn");

      if (exportBtn) {
        event.preventDefault();
        handleExportCsv();
        return;
      }

      const createBtn =
        getActionTarget(event, [
          "create",
          "new",
          "new-user",
          "create-user",
          "create-usuario",
        ]) ||
        event.target?.closest?.("#usuarios-create-btn") ||
        event.target?.closest?.("#usuarios-create-empty-btn");

      if (createBtn) {
        event.preventDefault();
        event.stopPropagation();

        await handleCreateUsuario();
        return;
      }

      const retryBtn =
        getActionTarget(event, [
          "retry",
        ]) ||
        event.target?.closest?.("#usuarios-retry-btn");

      if (retryBtn) {
        event.preventDefault();

        await reload({
          force: true,
          asRefresh: false,
        });

        return;
      }

      const refreshBtn =
        getActionTarget(event, [
          "refresh",
          "reload",
        ]) ||
        event.target?.closest?.("#usuarios-refresh-btn");

      if (refreshBtn) {
        event.preventDefault();

        await reload({
          force: true,
          asRefresh: true,
        });
      }
    };

    const onInput = (event) => {
      if (destroyed) return;

      const searchInput =
        event.target?.closest?.("[data-usuarios-search-input='true']") ||
        event.target?.closest?.("[data-usuarios-action='search']") ||
        event.target?.closest?.("[data-action='search-usuarios']") ||
        event.target?.closest?.("#usuarios-search-input");

      if (searchInput) {
        scheduleSearchQuery(searchInput.value || "");
      }
    };

    const onChange = (event) => {
      if (destroyed) return;

      const pageSizeField =
        event.target?.closest?.("[data-usuarios-field='page-size']") ||
        event.target?.closest?.("[data-field='page-size']");

      if (pageSizeField) {
        changePageSize(PAGE_SIZE);
        return;
      }

      const searchInput =
        event.target?.closest?.("[data-usuarios-search-input='true']") ||
        event.target?.closest?.("[data-usuarios-action='search']") ||
        event.target?.closest?.("[data-action='search-usuarios']") ||
        event.target?.closest?.("#usuarios-search-input");

      if (searchInput) {
        setSearchQuery(searchInput.value || "");
      }
    };

    container.addEventListener("click", onClick);
    container.addEventListener("input", onInput);
    container.addEventListener("change", onChange);

    return () => {
      try {
        container.removeEventListener("click", onClick);
        container.removeEventListener("input", onInput);
        container.removeEventListener("change", onChange);
      } catch {}
    };
  }

  function bindModalBridgeEvents() {
    const bus = AppCore?.events;

    if (!bus?.on) {
      return () => {};
    }

    const onRefresh = async (event) => {
      const payload = getEventPayload(event);

      await handleRefreshUsuarioFromModal(
        payload.userId ||
          payload.usuarioId ||
          payload.detail?.userId ||
          payload.detail?.usuarioId ||
          payload.detail?.id ||
          ""
      );
    };

    const onCopy = async (event) => {
      const payload = getEventPayload(event);

      await handleCopyUsuarioId(
        payload.userId ||
          payload.usuarioId ||
          payload.detail?.userId ||
          payload.detail?.usuarioId ||
          payload.detail?.id ||
          ""
      );
    };

    const onMutated = async () => {
      await reload({
        force: true,
        asRefresh: true,
        silent: true,
      });
    };

    const onReady = () => {
      flushPendingCreate();
      scheduleAccessSync({ maybeLoad: true });
    };

    const onAuthChanged = () => {
      scheduleAccessSync({ maybeLoad: true });
    };

    try {
      bus.on("usuarios:modal:refresh", onRefresh);
      bus.on("usuarios:modal:copy", onCopy);

      bus.on("usuarios:create:success", onMutated);
      bus.on("usuarios:created", onMutated);
      bus.on("usuarios:update:success", onMutated);
      bus.on("usuarios:updated", onMutated);
      bus.on("usuarios:delete:success", onMutated);
      bus.on("usuarios:deleted", onMutated);
      bus.on("usuarios:modal:updated", onMutated);
      bus.on("usuarios:status:success", onMutated);

      bus.on("app:ready", onReady);
      bus.on("app:boot:ready", onReady);
      bus.on("app:boot:complete", onReady);
      bus.on("router:rendered", onReady);

      bus.on("app:user:change", onAuthChanged);
      bus.on("app:user:updated", onAuthChanged);
      bus.on("app:user-ui:sync", onAuthChanged);
      bus.on("app:session:restored", onAuthChanged);
      bus.on("auth:session:applied", onAuthChanged);
      bus.on("auth:session:restored", onAuthChanged);
      bus.on("app:auth:change", onAuthChanged);
      bus.on("auth:change", onAuthChanged);
      bus.on("login:success", onAuthChanged);
      bus.on("auth:login:success", onAuthChanged);
    } catch {}

    return () => {
      try { bus.off("usuarios:modal:refresh", onRefresh); } catch {}
      try { bus.off("usuarios:modal:copy", onCopy); } catch {}

      try { bus.off("usuarios:create:success", onMutated); } catch {}
      try { bus.off("usuarios:created", onMutated); } catch {}
      try { bus.off("usuarios:update:success", onMutated); } catch {}
      try { bus.off("usuarios:updated", onMutated); } catch {}
      try { bus.off("usuarios:delete:success", onMutated); } catch {}
      try { bus.off("usuarios:deleted", onMutated); } catch {}
      try { bus.off("usuarios:modal:updated", onMutated); } catch {}
      try { bus.off("usuarios:status:success", onMutated); } catch {}

      try { bus.off("app:ready", onReady); } catch {}
      try { bus.off("app:boot:ready", onReady); } catch {}
      try { bus.off("app:boot:complete", onReady); } catch {}
      try { bus.off("router:rendered", onReady); } catch {}

      try { bus.off("app:user:change", onAuthChanged); } catch {}
      try { bus.off("app:user:updated", onAuthChanged); } catch {}
      try { bus.off("app:user-ui:sync", onAuthChanged); } catch {}
      try { bus.off("app:session:restored", onAuthChanged); } catch {}
      try { bus.off("auth:session:applied", onAuthChanged); } catch {}
      try { bus.off("auth:session:restored", onAuthChanged); } catch {}
      try { bus.off("app:auth:change", onAuthChanged); } catch {}
      try { bus.off("auth:change", onAuthChanged); } catch {}
      try { bus.off("login:success", onAuthChanged); } catch {}
      try { bus.off("auth:login:success", onAuthChanged); } catch {}
    };
  }

  function bindWindowEvents() {
    if (!isBrowser()) {
      return () => {};
    }

    const onMutated = async () => {
      await reload({
        force: true,
        asRefresh: true,
        silent: true,
      });
    };

    const onReady = () => {
      flushPendingCreate();
      scheduleAccessSync({ maybeLoad: true });
    };

    const onAuthChanged = () => {
      scheduleAccessSync({ maybeLoad: true });
    };

    try {
      window.addEventListener("usuarios:create:success", onMutated);
      window.addEventListener("usuarios:created", onMutated);
      window.addEventListener("usuarios:update:success", onMutated);
      window.addEventListener("usuarios:updated", onMutated);
      window.addEventListener("usuarios:delete:success", onMutated);
      window.addEventListener("usuarios:deleted", onMutated);
      window.addEventListener("usuarios:modal:updated", onMutated);
      window.addEventListener("usuarios:status:success", onMutated);

      window.addEventListener("app:ready", onReady);
      window.addEventListener("app:boot:ready", onReady);
      window.addEventListener("app:boot:complete", onReady);
      window.addEventListener("router:rendered", onReady);

      window.addEventListener("app:user:change", onAuthChanged);
      window.addEventListener("app:user:updated", onAuthChanged);
      window.addEventListener("app:user-ui:sync", onAuthChanged);
      window.addEventListener("app:session:restored", onAuthChanged);
      window.addEventListener("auth:session:applied", onAuthChanged);
      window.addEventListener("auth:session:restored", onAuthChanged);
      window.addEventListener("app:auth:change", onAuthChanged);
      window.addEventListener("auth:change", onAuthChanged);
      window.addEventListener("login:success", onAuthChanged);
      window.addEventListener("auth:login:success", onAuthChanged);
    } catch {}

    return () => {
      try {
        window.removeEventListener("usuarios:create:success", onMutated);
        window.removeEventListener("usuarios:created", onMutated);
        window.removeEventListener("usuarios:update:success", onMutated);
        window.removeEventListener("usuarios:updated", onMutated);
        window.removeEventListener("usuarios:delete:success", onMutated);
        window.removeEventListener("usuarios:deleted", onMutated);
        window.removeEventListener("usuarios:modal:updated", onMutated);
        window.removeEventListener("usuarios:status:success", onMutated);

        window.removeEventListener("app:ready", onReady);
        window.removeEventListener("app:boot:ready", onReady);
        window.removeEventListener("app:boot:complete", onReady);
        window.removeEventListener("router:rendered", onReady);

        window.removeEventListener("app:user:change", onAuthChanged);
        window.removeEventListener("app:user:updated", onAuthChanged);
        window.removeEventListener("app:user-ui:sync", onAuthChanged);
        window.removeEventListener("app:session:restored", onAuthChanged);
        window.removeEventListener("auth:session:applied", onAuthChanged);
        window.removeEventListener("auth:session:restored", onAuthChanged);
        window.removeEventListener("app:auth:change", onAuthChanged);
        window.removeEventListener("auth:change", onAuthChanged);
        window.removeEventListener("login:success", onAuthChanged);
        window.removeEventListener("auth:login:success", onAuthChanged);
      } catch {}
    };
  }

  function bind() {
    cleanupBindings();

    if (destroyed) return;

    const container = getContainer();
    const cleanups = [];

    cleanups.push(bindNativeActions(container));
    cleanups.push(bindModalBridgeEvents());
    cleanups.push(bindWindowEvents());

    bindingsCleanup = () => {
      for (const cleanup of cleanups) {
        try {
          cleanup?.();
        } catch {}
      }
    };
  }

  /* =========================================================
     PUBLIC FLOWS
  ========================================================= */

  async function reload(options = {}) {
    if (destroyed) return api;

    if (inflightReload) {
      return inflightReload;
    }

    inflightReload = (async () => {
      await renderAndLoad({
        force: options.force ?? true,
        asRefresh: options.asRefresh ?? true,
        silent: options.silent ?? false,
      });

      if (!destroyed) {
        bind();
      }

      return api;
    })();

    try {
      return await inflightReload;
    } finally {
      inflightReload = null;
    }
  }

  async function init() {
    if (destroyed) {
      destroyed = false;
    }

    if (inflightInit) {
      return inflightInit;
    }

    if (initialized && !destroyed) {
      ensureBaseState();
      rerender();
      flushPendingCreate();
      return api;
    }

    initialized = true;
    mounted = false;

    inflightInit = (async () => {
      safeLog("init");

      hydrateBestEffort();

      await renderAndLoad({
        force: false,
        asRefresh: false,
        silent: false,
      });

      if (!destroyed) {
        bind();
      }

      flushPendingCreate();

      safeEmit("usuarios:init:done", {
        source: MODULE,
        view: VIEW_NAME,
        version: VERSION,
        state: getPublicStateSnapshot(),
      });

      return api;
    })();

    try {
      return await inflightInit;
    } finally {
      inflightInit = null;
    }
  }

  function destroy() {
    destroyed = true;
    initialized = false;
    mounted = false;

    nextRenderToken();

    cleanupBindings();
    clearAccessSyncTimer();
    clearSearchDebounceTimer();

    setState({
      openingUserId: "",
      creating: false,
      refreshing: false,
      loading: false,
      pageSize: PAGE_SIZE,
    });

    pendingCreateRequest = false;
    inflightInit = null;
    inflightReload = null;

    safeEmit("usuarios:destroyed", {
      source: MODULE,
      view: VIEW_NAME,
      version: VERSION,
    });

    safeLog("destroy");

    return true;
  }

  function mount() {
    return init();
  }

  function bootstrap() {
    return init();
  }

  function unmount() {
    return destroy();
  }

  function dispose() {
    return destroy();
  }

  /* =========================================================
     SNAPSHOTS / PUBLIC API
  ========================================================= */

  function getPublicStateSnapshot() {
    return {
      initialized,
      mounted,
      destroyed,

      loading: Boolean(usuariosState.loading),
      refreshing: Boolean(usuariosState.refreshing),
      creating: Boolean(usuariosState.creating),
      hydrated: Boolean(usuariosState.hydrated),
      loaded: Boolean(usuariosState.loaded),

      openingUserId: safeText(usuariosState.openingUserId, ""),
      error: safeText(usuariosState.error, ""),

      page: safeNumber(usuariosState.page, 1),
      pageSize: PAGE_SIZE,

      search: safeText(usuariosState.search, ""),
      statusFilter: normalizeFilter(usuariosState.statusFilter),

      hasInflightInit: Boolean(inflightInit),
      hasInflightReload: Boolean(inflightReload),
      pendingCreateRequest,

      access: getAdminAccessSnapshot(),
      isAdmin: isAdminAccessAllowed(),
    };
  }

  function getState() {
    return {
      ...usuariosState,
      ...getPublicStateSnapshot(),
    };
  }

  function registerPublicBridge() {
    try {
      if (!AppCore.modules || typeof AppCore.modules !== "object") {
        AppCore.modules = {};
      }

      AppCore.modules.UsuariosView = api;
      AppCore.modules.Usuarios = api;
      AppCore.modules.OnionUsuariosView = api;
    } catch {}

    try {
      if (isBrowser()) {
        window.UsuariosView = api;
        window.OnionUsuariosView = api;

        window.OnionUsuarios = {
          ...(window.OnionUsuarios && typeof window.OnionUsuarios === "object"
            ? window.OnionUsuarios
            : {}),
          ...api,
        };
      }
    } catch {}

    return api;
  }

  /* =========================================================
     API
  ========================================================= */

  const api = {
    name: MODULE,
    viewName: VIEW_NAME,
    version: VERSION,
    source: "views:usuarios:usuariosView",

    init,
    mount,
    bootstrap,

    render: rerender,
    rerender,

    reload,
    refresh: reload,

    destroy,
    unmount,
    dispose,

    openUsuario: handleOpenUsuario,
    copyUsuarioId: handleCopyUsuarioId,
    exportCsv: handleExportCsv,
    createUsuario: handleCreateUsuario,

    goToPage,
    goPrevPage,
    goNextPage,
    changePageSize,

    setSearchQuery,
    setSearch: setSearchQuery,
    clearSearch: () => setSearchQuery(""),

    setStatusFilter,
    setFilter: setStatusFilter,
    clearFilters,

    getItems: () => getItems(),
    getPageItems: () => getPaginationMeta(getItems()).items,
    getPagination: () => getPaginationMeta(getItems()),
    getUsuarioById: (userId = "") => findUsuarioById(getItems(), userId),

    isAdmin: () => isAdminAccessAllowed(),
    getAccess: () => getAdminAccessSnapshot(),

    getState,
    getPublicStateSnapshot,

    get initialized() {
      return initialized;
    },

    get mounted() {
      return mounted;
    },

    get destroyed() {
      return destroyed;
    },
  };

  registerPublicBridge();

  return api;
})();

export default UsuariosView;

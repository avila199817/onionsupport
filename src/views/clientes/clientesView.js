/* =========================================================
   Onion SPA - Clientes View
   Archivo: src/views/clientes/clientesView.js

   FINAL PRO SYSTEM · VIEW REAL · HARDENED · FINAL 13/10
   CLIENTES EXPERIENCE MODE · CSP CLEAN · NO CSS INLINE

   RESPONSABILIDADES:
   - punto de entrada real de la vista clientes
   - render principal con template final unificado
   - paginación visual fija a 5 clientes por vista
   - carga inicial robusta con fallback a cache
   - refresh con loader SOLO en historial / tabla
   - apertura de cliente con estado visual de loading
   - apertura de modal / flujo de creación de cliente
   - filtros y búsqueda delegados por data-clientes-action / data-action
   - bind de eventos de pantalla
   - evitar doble bind de listeners
   - soportar destroy limpio del router
   - permitir reload con rerender seguro
   - coordinar acciones y modales sin mezclar responsabilidades
   - vista admin-safe sin sticky forbidden
   - template controlado por state real
   - límite fijo de 5 clientes por hoja
   - sin CSS in JS
   - sin style inline
   - sin handlers inline

   HARDENING PRO:
   - render inicial inmediato
   - bind inmediato tras primer render para evitar pérdida de clicks
   - carga posterior segura
   - anti-race token
   - cleanup total
   - click delegation sólida
   - fallback elegante si los modales aún no existen
   - bloqueo de acciones antes de app ready sin perder intención del usuario
   - anti spam click en apertura rápida
   - compatibilidad con template nuevo data-clientes-action
   - compatibilidad con data-action legacy
   - conservación de aliases backend heterogéneos
   - filtros/search/page en state real
   - acceso admin robusto sin alimentar permisos desde forbidden sticky
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  clientesState,
  setHydrated,
} from "./clientes.state.js";

import {
  loadClientes,
  hydrateFromCache,
} from "./clientes.api.js";

import {
  getClientes,
} from "./clientes.store.js";

import renderClientesTableTemplate from "./clientes.table.template.js";

import {
  DEFAULT_PAGE_SIZE as MODEL_DEFAULT_PAGE_SIZE,
  normalizeClientesCollection,
  sortClientesByUpdatedDesc,
  paginateClientes,
  findClienteById,
} from "./clientes.model.js";

import {
  openClienteAction,
  copyClienteIdAction,
  exportClientesCsvAction,
  createClienteAction,
  refreshClienteDetailAction,
} from "./clientes.actions.js";

export const ClientesView = (() => {
  "use strict";

  /* =========================================================
     CONSTANTS
  ========================================================= */

  const SCOPE = "view:clientes";
  const MODULE = "clientes";
  const VIEW_NAME = "ClientesView";
  const VERSION = "13.0.0";

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
      AppCore?.utils?.log?.("[ClientesView]", ...args);
    } catch {}

    try {
      console.log("[ClientesView]", ...args);
    } catch {}
  }

  function safeWarn(...args) {
    try {
      AppCore?.utils?.warn?.("[ClientesView]", ...args);
    } catch {}

    try {
      console.warn("[ClientesView]", ...args);
    } catch {}
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

  function normalizeFilter(value = "") {
    const key = normalizeKey(value);

    if (!key || ["all", "todo", "todos", "todas", "total", "totales"].includes(key)) {
      return "all";
    }

    if (["active", "activo", "activa", "activos", "activas", "enabled", "habilitado"].includes(key)) {
      return "active";
    }

    if (["pending", "pendiente", "pendientes", "invited", "invitado", "invitada", "invite"].includes(key)) {
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
        "inactivos",
        "inactivas",
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

    if (
      [
        "vip",
        "priority",
        "prioritario",
        "prioritaria",
        "enterprise",
        "empresa",
        "corporate",
        "corporativo",
        "corporativa",
      ].includes(key)
    ) {
      return "vip";
    }

    return "all";
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
    if (!text) return false;

    const normalizedType = normalizeKey(type) || "info";

    try {
      if (typeof AppCore?.toast?.[normalizedType] === "function") {
        AppCore.toast[normalizedType](text);
        return true;
      }
    } catch {}

    try {
      if (typeof AppCore?.toast?.show === "function") {
        AppCore.toast.show(text, normalizedType);
        return true;
      }
    } catch {}

    try {
      if (typeof AppCore?.ui?.toast?.[normalizedType] === "function") {
        AppCore.ui.toast[normalizedType](text);
        return true;
      }
    } catch {}

    try {
      if (typeof AppCore?.ui?.toast?.show === "function") {
        AppCore.ui.toast.show({
          message: text,
          type: normalizedType,
        });
        return true;
      }
    } catch {}

    try {
      if (isBrowser() && typeof window.Toast?.show === "function") {
        window.Toast.show({
          message: text,
          type: normalizedType,
        });
        return true;
      }
    } catch {}

    return false;
  }

  function safeErrorMessage(error = null, fallback = "No se pudo cargar la colección de clientes.") {
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
        fallback
      ),
      fallback
    );
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

        clientesState?.user,
        clientesState?.currentUser,
        clientesState?.sessionUser,
        clientesState?.authUser
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

      clientesState?.role,
      clientesState?.rol,
      clientesState?.userRole,

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

      clientesState?.roles,
      clientesState?.permissions,
      clientesState?.scopes,
      clientesState?.groups,

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
      AppCore?.state?.canManageClientes,
      AppCore?.state?.canManageClients,
      AppCore?.state?.canAccessClientes,
      AppCore?.state?.canAccessClients,

      session?.isAdmin,
      session?.admin,
      session?.isSuperAdmin,
      session?.superAdmin,
      session?.canManageClientes,
      session?.canManageClients,
      session?.canAccessClientes,
      session?.canAccessClients,

      clientesState?.isAdmin,
      clientesState?.admin,
      clientesState?.canManageClientes,
      clientesState?.canManageClients,
      clientesState?.canAccessClientes,
      clientesState?.canAccessClients,

      user?.isAdmin,
      user?.admin,
      user?.isSuperAdmin,
      user?.superAdmin,
      user?.canManageClientes,
      user?.canManageClients,
      user?.canAccessClientes,
      user?.canAccessClients,

      profile?.isAdmin,
      profile?.admin,
      profile?.isSuperAdmin,
      profile?.superAdmin,
      profile?.canManageClientes,
      profile?.canManageClients,
      profile?.canAccessClientes,
      profile?.canAccessClients,

      raw?.isAdmin,
      raw?.admin,
      raw?.isSuperAdmin,
      raw?.superAdmin,
      raw?.canManageClientes,
      raw?.canManageClients,
      raw?.canAccessClientes,
      raw?.canAccessClients,

      rawProfile?.isAdmin,
      rawProfile?.admin,
      rawProfile?.isSuperAdmin,
      rawProfile?.superAdmin,
      rawProfile?.canManageClientes,
      rawProfile?.canManageClients,
      rawProfile?.canAccessClientes,
      rawProfile?.canAccessClients,
    ].some((value) => value === true || value === "true" || value === 1 || value === "1");
  }

  function hasAuthRoleHelperAdmin() {
    try {
      if (typeof AppCore?.auth?.hasRole === "function") {
        return Boolean(
          AppCore.auth.hasRole("admin") ||
          AppCore.auth.hasRole("administrator") ||
          AppCore.auth.hasRole("super_admin") ||
          AppCore.auth.hasRole("owner")
        );
      }
    } catch {}

    try {
      if (typeof AppCore?.auth?.requireRole === "function") {
        return Boolean(
          AppCore.auth.requireRole("admin") ||
          AppCore.auth.requireRole("administrator") ||
          AppCore.auth.requireRole("super_admin") ||
          AppCore.auth.requireRole("owner")
        );
      }
    } catch {}

    return false;
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
    const hasAuthHelperAdmin = hasAuthRoleHelperAdmin();

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
    const allowed = Boolean(hasAdminRole || hasAdminFlag || hasAuthHelperAdmin);

    /*
      Importante:
      - No usamos clientesState.forbidden como fuente de verdad.
      - forbidden/accessDenied solo son informativos para render/debug.
      - Evita bloqueo sticky si la sesión se restaura tarde.
    */
    const denied = !pending && !allowed;

    return {
      allowed,
      denied,
      pending,
      roles,
      hasAdminRole,
      hasAdminFlag,
      hasAuthHelperAdmin,
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

    showToast("La vista de clientes está reservada para administradores.", "error");
    return false;
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
      return clientesState;
    }

    Object.assign(clientesState, patch);

    return clientesState;
  }

  function syncAccessState() {
    const access = getAdminAccessSnapshot();

    setState({
      pageSize: PAGE_SIZE,

      isAdmin: access.allowed,
      canManageClientes: access.allowed,
      canManageClients: access.allowed,
      canAccessClientes: access.allowed,
      canAccessClients: access.allowed,

      forbidden: access.denied,
      accessDenied: access.denied,
      restricted: access.denied,
      accessPending: access.pending,
      accessRoles: access.roles,
    });

    return access;
  }

  function ensureBaseState() {
    clientesState.pageSize = PAGE_SIZE;

    if (!Number.isFinite(Number(clientesState.page))) {
      clientesState.page = 1;
    }

    clientesState.page = Math.max(1, safeNumber(clientesState.page, 1));

    if (typeof clientesState.loading !== "boolean") {
      clientesState.loading = false;
    }

    if (typeof clientesState.refreshing !== "boolean") {
      clientesState.refreshing = false;
    }

    if (typeof clientesState.creating !== "boolean") {
      clientesState.creating = false;
    }

    if (typeof clientesState.exporting !== "boolean") {
      clientesState.exporting = false;
    }

    clientesState.openingClienteId = safeText(
      first(clientesState.openingClienteId, clientesState.openingClientId),
      ""
    );

    clientesState.openingClientId = clientesState.openingClienteId;
    clientesState.openingCustomerId = safeText(clientesState.openingCustomerId, "");

    clientesState.error = safeText(clientesState.error, "");

    clientesState.remoteCount = Math.max(
      0,
      safeNumber(clientesState.remoteCount, 0)
    );

    clientesState.filter = normalizeFilter(
      first(
        clientesState.filter,
        clientesState.statusFilter,
        clientesState.activeFilter,
        clientesState.tierFilter,
        "all"
      )
    );

    clientesState.statusFilter = clientesState.filter;
    clientesState.activeFilter = clientesState.filter;
    clientesState.tierFilter = clientesState.filter;

    clientesState.search = safeText(
      first(
        clientesState.search,
        clientesState.searchQuery,
        clientesState.query,
        clientesState.q,
        ""
      ),
      ""
    );

    clientesState.searchQuery = clientesState.search;
    clientesState.query = clientesState.search;
    clientesState.q = clientesState.search;

    syncAccessState();

    return clientesState;
  }

  function markIdle() {
    setState({
      loading: false,
      refreshing: false,
    });
  }

  function resolveRemoteCountFromLoadResult(result = null, items = []) {
    const response = safeObject(result);
    const data = safeObject(response.data);
    const payload = safeObject(response.payload);
    const body = safeObject(response.body);
    const stats = safeObject(first(response.stats, data.stats, payload.stats, body.stats));

    return Math.max(
      safeArray(items).length,
      safeNumber(
        first(
          response.remoteCount,
          response.totalCount,
          response.count,
          response.total,
          data.remoteCount,
          data.totalCount,
          data.count,
          data.total,
          payload.remoteCount,
          payload.totalCount,
          payload.count,
          payload.total,
          body.remoteCount,
          body.totalCount,
          body.count,
          body.total,
          stats.total,
          clientesState.remoteCount,
          safeArray(items).length
        ),
        safeArray(items).length
      )
    );
  }

  function markLoadedOk(items = [], result = null) {
    const total = resolveRemoteCountFromLoadResult(result, items);
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
      lastSyncAt: new Date().toISOString(),
    });

    try {
      setHydrated?.(true);
    } catch {}

    return total;
  }

  /* =========================================================
     ITEM NORMALIZATION
  ========================================================= */

  function getRawItems() {
    try {
      return getClientes();
    } catch {
      return [];
    }
  }

  function getStableClienteId(item = {}) {
    return safeText(
      first(
        item?.clienteId,
        item?.clientId,
        item?.customerId,
        item?.id,
        item?._id,
        item?.code,
        item?.clientCode,
        item?.clienteCode,
        item?.customerCode,
        item?.email,
        item?.raw?.clienteId,
        item?.raw?.clientId,
        item?.raw?.customerId,
        item?.raw?.id,
        item?.raw?._id,
        item?.raw?.code,
        item?.raw?.clientCode,
        item?.raw?.clienteCode,
        item?.raw?.customerCode,
        item?.raw?.email
      ),
      ""
    );
  }

  function patchRawFallback(normalizedItem = {}, rawItem = {}) {
    const item = safeObject(normalizedItem);
    const raw = safeObject(first(item.raw, rawItem));

    const clienteId = first(
      item.clienteId,
      item.clientId,
      item.customerId,
      item.id,
      raw.clienteId,
      raw.clientId,
      raw.customerId,
      raw.id,
      raw._id,
      raw.email
    );

    const code = first(
      item.clientCode,
      item.clienteCode,
      item.customerCode,
      item.code,
      raw.clientCode,
      raw.clienteCode,
      raw.customerCode,
      raw.code,
      clienteId
    );

    const name = first(
      item.clientName,
      item.clienteName,
      item.customerName,
      item.name,
      item.nombre,
      item.fullName,
      item.displayName,
      item.company,
      item.empresa,
      item.businessName,
      item.razonSocial,
      raw.clientName,
      raw.clienteName,
      raw.customerName,
      raw.name,
      raw.nombre,
      raw.fullName,
      raw.displayName,
      raw.company,
      raw.empresa,
      raw.businessName,
      raw.razonSocial,
      raw.email
    );

    const email = first(
      item.clientEmail,
      item.clienteEmail,
      item.customerEmail,
      item.email,
      item.mail,
      raw.clientEmail,
      raw.clienteEmail,
      raw.customerEmail,
      raw.email,
      raw.mail
    );

    const phone = first(
      item.phone,
      item.telefono,
      item.mobile,
      raw.phone,
      raw.telefono,
      raw.mobile
    );

    const city = first(
      item.city,
      item.ciudad,
      item.locationCity,
      item.location?.city,
      item.location?.ciudad,
      item.ubicacion?.city,
      item.ubicacion?.ciudad,
      item.address?.city,
      item.address?.ciudad,
      item.direccion?.city,
      item.direccion?.ciudad,
      raw.city,
      raw.ciudad,
      raw.locationCity,
      raw.location?.city,
      raw.location?.ciudad,
      raw.ubicacion?.city,
      raw.ubicacion?.ciudad,
      raw.address?.city,
      raw.address?.ciudad,
      raw.direccion?.city,
      raw.direccion?.ciudad
    );

    const managerName = first(
      item.managerName,
      item.responsableName,
      item.ownerName,
      item.assignedToName,
      item.accountManagerName,
      raw.managerName,
      raw.responsableName,
      raw.ownerName,
      raw.assignedToName,
      raw.accountManagerName
    );

    const status = first(
      item.status,
      item.estado,
      item.state,
      raw.status,
      raw.estado,
      raw.state
    );

    const tier = first(
      item.tier,
      item.plan,
      item.segment,
      item.category,
      item.categoria,
      item.tipo,
      item.customerType,
      item.clientType,
      item.level,
      item.nivel,
      raw.tier,
      raw.plan,
      raw.segment,
      raw.category,
      raw.categoria,
      raw.tipo,
      raw.customerType,
      raw.clientType,
      raw.level,
      raw.nivel
    );

    const avatar = first(
      item.avatar,
      item.avatarUrl,
      item.logo,
      item.logoUrl,
      item.image,
      item.imageUrl,
      raw.avatar,
      raw.avatarUrl,
      raw.logo,
      raw.logoUrl,
      raw.image,
      raw.imageUrl
    );

    const createdAt = first(
      item.createdAt,
      item.created_at,
      item.fechaCreacion,
      item.registeredAt,
      raw.createdAt,
      raw.created_at,
      raw.fechaCreacion,
      raw.registeredAt
    );

    const updatedAt = first(
      item.updatedAt,
      item.updated_at,
      item.lastContactAt,
      item.last_contact_at,
      item.modifiedAt,
      item.lastModifiedAt,
      item.lastActivityAt,
      raw.updatedAt,
      raw.updated_at,
      raw.lastContactAt,
      raw.last_contact_at,
      raw.modifiedAt,
      raw.lastModifiedAt,
      raw.lastActivityAt
    );

    return {
      ...item,
      raw,

      clienteId,
      clientId: first(item.clientId, raw.clientId, clienteId),
      customerId: first(item.customerId, raw.customerId, clienteId),
      id: first(item.id, raw.id, clienteId),

      code,
      clientCode: first(item.clientCode, raw.clientCode, code),
      clienteCode: first(item.clienteCode, raw.clienteCode, code),
      customerCode: first(item.customerCode, raw.customerCode, code),

      name,
      nombre: first(item.nombre, raw.nombre, name),
      fullName: first(item.fullName, raw.fullName, name),
      displayName: first(item.displayName, raw.displayName, name),
      company: first(item.company, raw.company, name),
      empresa: first(item.empresa, raw.empresa, name),
      businessName: first(item.businessName, raw.businessName, name),
      razonSocial: first(item.razonSocial, raw.razonSocial, name),
      clientName: first(item.clientName, raw.clientName, name),
      clienteName: first(item.clienteName, raw.clienteName, name),
      customerName: first(item.customerName, raw.customerName, name),

      email,
      mail: first(item.mail, raw.mail, email),
      clientEmail: first(item.clientEmail, raw.clientEmail, email),
      clienteEmail: first(item.clienteEmail, raw.clienteEmail, email),
      customerEmail: first(item.customerEmail, raw.customerEmail, email),

      phone,
      telefono: first(item.telefono, raw.telefono, phone),
      mobile: first(item.mobile, raw.mobile, phone),

      city,
      ciudad: first(item.ciudad, raw.ciudad, city),
      locationCity: first(item.locationCity, raw.locationCity, city),

      managerName,
      responsableName: first(item.responsableName, raw.responsableName, managerName),
      ownerName: first(item.ownerName, raw.ownerName, managerName),
      assignedToName: first(item.assignedToName, raw.assignedToName, managerName),
      accountManagerName: first(item.accountManagerName, raw.accountManagerName, managerName),

      status,
      estado: first(item.estado, raw.estado, status),
      state: first(item.state, raw.state, status),

      tier,
      plan: first(item.plan, raw.plan, tier),
      segment: first(item.segment, raw.segment, tier),
      category: first(item.category, raw.category, tier),
      categoria: first(item.categoria, raw.categoria, tier),
      tipo: first(item.tipo, raw.tipo, tier),

      avatar,
      avatarUrl: first(item.avatarUrl, raw.avatarUrl, avatar),
      logo: first(item.logo, raw.logo, avatar),
      logoUrl: first(item.logoUrl, raw.logoUrl, avatar),
      image: first(item.image, raw.image, avatar),
      imageUrl: first(item.imageUrl, raw.imageUrl, avatar),

      createdAt,
      created_at: first(item.created_at, raw.created_at, createdAt),
      fechaCreacion: first(item.fechaCreacion, raw.fechaCreacion, createdAt),

      updatedAt,
      updated_at: first(item.updated_at, raw.updated_at, updatedAt),
      lastContactAt: first(item.lastContactAt, raw.lastContactAt, updatedAt),
      last_contact_at: first(item.last_contact_at, raw.last_contact_at, updatedAt),
      modifiedAt: first(item.modifiedAt, raw.modifiedAt, updatedAt),
      lastModifiedAt: first(item.lastModifiedAt, raw.lastModifiedAt, updatedAt),
      lastActivityAt: first(item.lastActivityAt, raw.lastActivityAt, updatedAt),
    };
  }

  function getItems() {
    try {
      const rawItems = safeArray(getRawItems());

      const rawById = new Map();

      rawItems.forEach((rawItem) => {
        const id = getStableClienteId(rawItem);

        if (id && !rawById.has(id)) {
          rawById.set(id, rawItem);
        }
      });

      const normalizedItems = safeArray(
        normalizeClientesCollection(rawItems)
      );

      const patchedItems = normalizedItems.map((item, index) => {
        const id = getStableClienteId(item);
        const matchingRaw = rawById.get(id) || rawItems[index] || {};

        return patchRawFallback(item, matchingRaw);
      });

      return sortClientesByUpdatedDesc(patchedItems);
    } catch (error) {
      safeWarn("getItems falló:", error);

      try {
        return sortClientesByUpdatedDesc(safeArray(getRawItems()));
      } catch {
        return [];
      }
    }
  }

  function normalizePaginationResult(result = {}, items = []) {
    const pageSize = PAGE_SIZE || FALLBACK_MODEL_PAGE_SIZE;
    const rows = safeArray(items);
    const total = rows.length;
    const totalPages = Math.max(1, Math.ceil((total || 1) / pageSize));

    const page = Math.min(
      Math.max(1, safeNumber(first(result.page, result.currentPage, clientesState.page, 1), 1)),
      totalPages
    );

    const startIndex = (page - 1) * pageSize;
    const fallbackItems = rows.slice(startIndex, startIndex + pageSize);

    return {
      ...safeObject(result),
      page,
      currentPage: page,
      pageSize,
      limit: pageSize,
      totalPages: Math.max(1, safeNumber(first(result.totalPages, totalPages), totalPages)),
      totalCount: Math.max(total, safeNumber(first(result.totalCount, result.total, total), total)),
      items: safeArray(first(result.items, result.pageItems, fallbackItems)),
    };
  }

  function getPaginationMeta(items = []) {
    try {
      const result = paginateClientes(
        safeArray(items),
        clientesState.page || 1,
        clientesState.pageSize || PAGE_SIZE || FALLBACK_MODEL_PAGE_SIZE
      );

      return normalizePaginationResult(result, items);
    } catch {
      return normalizePaginationResult({}, items);
    }
  }

  function clampPageAgainstItems(items = []) {
    const pagination = getPaginationMeta(items);

    if (safeNumber(clientesState.page, 1) !== pagination.page) {
      clientesState.page = pagination.page;
    }

    clientesState.pageSize = PAGE_SIZE;

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

  function openClienteModalBridge(detail = null) {
    if (!detail) return false;

    try {
      const modal = window?.OnionClientesModal;

      if (modal?.getState?.()?.isOpen && typeof modal.update === "function") {
        modal.update(detail);
        return true;
      }

      if (typeof modal?.open === "function") {
        modal.open(detail);
        return true;
      }

      if (typeof modal?.render === "function") {
        modal.render(detail);
        return true;
      }

      if (typeof modal?.show === "function") {
        modal.show(detail);
        return true;
      }
    } catch (error) {
      safeWarn("OnionClientesModal hook falló:", error);
    }

    try {
      const hook =
        window?.renderClienteDetailModal ||
        window?.renderClienteModal ||
        window?.renderClientesModal ||
        window?.openClienteModal ||
        window?.openClientesModal;

      if (typeof hook === "function") {
        hook(detail);
        return true;
      }
    } catch (error) {
      safeWarn("cliente modal hook falló:", error);
    }

    safeEmit("clientes:modal:open", {
      detail,
      source: MODULE,
      view: VIEW_NAME,
    });

    return true;
  }

  async function openCreateClienteBridge(draft = {}) {
    try {
      const modal = window?.OnionClientesCreateModal;

      if (typeof modal?.open === "function") {
        modal.open(draft);
        return true;
      }

      if (typeof modal?.render === "function") {
        modal.render(draft);
        return true;
      }

      if (typeof modal?.show === "function") {
        modal.show(draft);
        return true;
      }
    } catch (error) {
      safeWarn("OnionClientesCreateModal hook falló:", error);
    }

    try {
      const hook =
        window?.renderClientesCreateModal ||
        window?.renderClienteCreateModal ||
        window?.openClienteCreateModal ||
        window?.openClientesCreateModal;

      if (typeof hook === "function") {
        hook(draft);
        return true;
      }
    } catch (error) {
      safeWarn("create modal hook falló:", error);
    }

    try {
      if (typeof createClienteAction === "function") {
        const result = await createClienteAction({
          silent: false,
          draft,
        });

        if (result !== false) {
          return Boolean(result ?? true);
        }
      }
    } catch (error) {
      safeWarn("createClienteAction falló:", error);
      throw error;
    }

    safeEmit("clientes:create-modal:open", {
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

    void handleCreateCliente({
      skipThrottle: true,
      fromPending: true,
    });

    return true;
  }

  /* =========================================================
     DOM POST-RENDER
  ========================================================= */

  function decorateDom(container) {
    if (!container) return container;

    try {
      container.setAttribute("data-clientes-mounted", "true");
      container.setAttribute("data-clientes-view-version", VERSION);
    } catch {}

    return container;
  }

  /* =========================================================
     RENDER
  ========================================================= */

  function buildTemplatePayload({
    items = getItems(),
    access = syncAccessState(),
    loadingOverride = null,
  } = {}) {
    const pagination = clampPageAgainstItems(items);

    const remoteCount = Math.max(
      safeArray(items).length,
      safeNumber(clientesState.remoteCount, safeArray(items).length)
    );

    const loading =
      typeof loadingOverride === "boolean"
        ? loadingOverride
        : Boolean(clientesState.loading);

    return {
      items,
      clientes: items,
      clients: items,
      customers: items,

      totalCount: remoteCount,
      remoteCount,
      count: remoteCount,
      total: remoteCount,

      page: pagination.page,
      currentPage: pagination.page,
      pageSize: PAGE_SIZE,
      limit: PAGE_SIZE,
      totalPages: pagination.totalPages,

      filter: clientesState.filter,
      statusFilter: clientesState.statusFilter,
      activeFilter: clientesState.activeFilter,
      tierFilter: clientesState.tierFilter,

      search: clientesState.search,
      searchQuery: clientesState.searchQuery,
      query: clientesState.query,
      q: clientesState.q,

      lastUpdatedAt: clientesState.lastSyncAt || "",
      updatedAt: clientesState.lastSyncAt || "",

      title: access.pending
        ? "Validando permisos"
        : "Centro de control de clientes",

      subtitle: access.pending
        ? "Estamos comprobando tu sesión antes de cargar la administración de clientes."
        : "Consulta clientes registrados, revisa su estado, nivel de cuenta, responsable y última actualización desde una vista clara, compacta y alineada con el sistema.",

      forbidden: false,
      accessDenied: false,
      restricted: false,
      accessPending: access.pending,

      isAdmin: access.allowed,
      canManageClientes: access.allowed,
      canManageClients: access.allowed,
      canAccessClientes: access.allowed,
      canAccessClients: access.allowed,

      user: getCurrentUser(),

      state: {
        ...clientesState,

        page: pagination.page,
        currentPage: pagination.page,
        pageSize: PAGE_SIZE,
        limit: PAGE_SIZE,
        totalPages: pagination.totalPages,

        loading,
        refreshing: Boolean(clientesState.refreshing),

        filter: clientesState.filter,
        statusFilter: clientesState.statusFilter,
        activeFilter: clientesState.activeFilter,
        tierFilter: clientesState.tierFilter,

        search: clientesState.search,
        searchQuery: clientesState.searchQuery,
        query: clientesState.query,
        q: clientesState.q,

        forbidden: false,
        accessDenied: false,
        restricted: false,
        accessPending: access.pending,

        isAdmin: access.allowed,
        canManageClientes: access.allowed,
        canManageClients: access.allowed,
        canAccessClientes: access.allowed,
        canAccessClients: access.allowed,

        user: getCurrentUser(),
      },
    };
  }

  function buildHtml() {
    const allItems = getItems();
    const access = syncAccessState();

    let innerHtml = "";

    if (access.pending) {
      innerHtml = renderClientesTableTemplate(
        buildTemplatePayload({
          items: [],
          access,
          loadingOverride: true,
        })
      );
    } else if (!access.allowed) {
      innerHtml = renderClientesTableTemplate({
        forbidden: true,
        accessDenied: true,
        restricted: true,
        state: {
          ...clientesState,
          forbidden: true,
          accessDenied: true,
          restricted: true,
          accessPending: false,
        },
      });
    } else {
      innerHtml = renderClientesTableTemplate(
        buildTemplatePayload({
          items: allItems,
          access,
        })
      );
    }

    return `
      <section
        class="panel-content dashboard ready"
        data-view="clientes"
        data-module="clientes"
        data-clientes-view="true"
      >
        <div class="content-wrapper clientes-view__content">
          ${innerHtml}
        </div>
      </section>
    `;
  }

  function render() {
    if (destroyed) return null;

    const container = getContainer();

    if (!container) {
      safeWarn("No existe #view-container para renderizar clientes.");
      return null;
    }

    ensureBaseState();

    try {
      AppCore?.setDocumentTitle?.("Clientes");
    } catch {}

    try {
      AppCore?.clearDynamicContainers?.();
    } catch {}

    try {
      container.innerHTML = buildHtml();
      mounted = true;
    } catch (error) {
      safeWarn("render HTML falló:", error);
      return null;
    }

    decorateDom(container);

    try {
      setHydrated?.(true);
    } catch {}

    setState({
      hydrated: true,
    });

    safeEmit("clientes:rendered", {
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

    if (!destroyed) {
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
        loading: access.pending,
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
      const result = await loadClientes({
        force,
      });

      const itemsAfter = getItems();

      markLoadedOk(itemsAfter, result);
      clampPageAgainstItems(itemsAfter);

      safeEmit("clientes:loaded", {
        items: itemsAfter,
        count: itemsAfter.length,
        source: MODULE,
        view: VIEW_NAME,
      });

      return itemsAfter;
    } catch (error) {
      const message = safeErrorMessage(error);

      safeWarn("loadClientes falló:", error);

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

      safeEmit("clientes:load:error", {
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

      const beforeAllowed = Boolean(clientesState.isAdmin);
      const access = syncAccessState();

      rerender();

      if (
        maybeLoad &&
        access.allowed &&
        !beforeAllowed &&
        !clientesState.loading
      ) {
        await reload({
          force: false,
          asRefresh: false,
          silent: true,
        });
      }
    }, 0);
  }

  /* =========================================================
     FILTER / SEARCH / PAGE ACTIONS
  ========================================================= */

  function goToPage(page = 1) {
    if (!requireAdminAction()) return clientesState.page || 1;

    if (clientesState.loading || clientesState.refreshing) {
      return clientesState.page || 1;
    }

    const items = getItems();

    const pagination = paginateClientes(
      items,
      page,
      PAGE_SIZE
    );

    setState({
      page: safeNumber(pagination?.page, page),
      pageSize: PAGE_SIZE,
    });

    rerender();

    return clientesState.page;
  }

  function goPrevPage() {
    return goToPage((clientesState.page || 1) - 1);
  }

  function goNextPage() {
    return goToPage((clientesState.page || 1) + 1);
  }

  function changePageSize() {
    setState({
      pageSize: PAGE_SIZE,
      page: 1,
    });

    rerender();

    return PAGE_SIZE;
  }

  function setFilter(filter = "all") {
    if (!requireAdminAction()) return clientesState.filter || "all";

    const nextFilter = normalizeFilter(filter);

    setState({
      filter: nextFilter,
      statusFilter: nextFilter,
      activeFilter: nextFilter,
      tierFilter: nextFilter,
      page: 1,
      pageSize: PAGE_SIZE,
    });

    rerender();

    return nextFilter;
  }

  function setSearch(query = "") {
    const nextSearch = safeText(query, "");

    setState({
      search: nextSearch,
      searchQuery: nextSearch,
      query: nextSearch,
      q: nextSearch,
      page: 1,
      pageSize: PAGE_SIZE,
    });

    rerender();

    return nextSearch;
  }

  function clearSearch() {
    return setSearch("");
  }

  function clearFilters() {
    if (!requireAdminAction()) return false;

    setState({
      filter: "all",
      statusFilter: "all",
      activeFilter: "all",
      tierFilter: "all",
      search: "",
      searchQuery: "",
      query: "",
      q: "",
      page: 1,
      pageSize: PAGE_SIZE,
    });

    rerender();

    return true;
  }

  function scheduleSearchUpdate(query = "") {
    clearSearchDebounceTimer();

    searchDebounceTimer = setTimeout(() => {
      searchDebounceTimer = null;

      if (!destroyed) {
        setSearch(query);
      }
    }, SEARCH_DEBOUNCE_MS);

    return searchDebounceTimer;
  }

  /* =========================================================
     ACTION FLOWS
  ========================================================= */

  async function handleOpenCliente(clientId = "") {
    if (!requireAdminAction()) return null;

    const id = safeText(clientId, "");

    if (!id) {
      showToast("Cliente inválido.", "error");
      return null;
    }

    if (clientesState.openingClienteId || clientesState.openingClientId) {
      return null;
    }

    setState({
      openingClienteId: id,
      openingClientId: id,
      openingCustomerId: id,
    });

    rerender();
    await waitForPaint();

    try {
      const detail = await openClienteAction({
        clientId: id,
        clienteId: id,
        customerId: id,
        preferFresh: true,
        silent: true,
      });

      if (!detail) {
        showToast("No se pudo abrir el cliente.", "error");
        return null;
      }

      openClienteModalBridge(detail);

      return detail;
    } catch (error) {
      safeWarn("handleOpenCliente falló:", error);
      showToast("No se pudo abrir el cliente.", "error");
      return null;
    } finally {
      setState({
        openingClienteId: "",
        openingClientId: "",
        openingCustomerId: "",
      });

      if (!destroyed) {
        rerender();
      }
    }
  }

  async function handleRefreshClienteFromModal(clientId = "") {
    if (!requireAdminAction()) return null;

    const id = safeText(clientId, "");
    if (!id) return null;

    try {
      const detail = await refreshClienteDetailAction({
        clientId: id,
        clienteId: id,
        customerId: id,
        silent: true,
      });

      if (detail) {
        openClienteModalBridge(detail);
      }

      return detail;
    } catch (error) {
      safeWarn("handleRefreshClienteFromModal falló:", error);
      showToast("No se pudo refrescar el cliente.", "error");
      return null;
    }
  }

  async function handleCopyClienteId(clientId = "") {
    if (!requireAdminAction()) return false;

    const id = safeText(clientId, "");

    if (!id) {
      showToast("No hay referencia para copiar.", "error");
      return false;
    }

    try {
      return await copyClienteIdAction({
        clientId: id,
        clienteId: id,
        customerId: id,
        silent: false,
      });
    } catch (error) {
      safeWarn("handleCopyClienteId falló:", error);
      showToast("No se pudo copiar la referencia.", "error");
      return false;
    }
  }

  async function handleExportCsv() {
    if (!requireAdminAction()) return false;

    if (clientesState.exporting) {
      return false;
    }

    setState({
      exporting: true,
    });

    rerender();
    await waitForPaint();

    try {
      return await exportClientesCsvAction({
        silent: false,
        items: getItems(),
        filter: clientesState.filter,
        search: clientesState.search,
      });
    } catch (error) {
      safeWarn("handleExportCsv falló:", error);
      showToast("No se pudo exportar el historial.", "error");
      return false;
    } finally {
      setState({
        exporting: false,
      });

      if (!destroyed) {
        rerender();
      }
    }
  }

  async function handleCreateCliente(options = {}) {
    if (!requireAdminAction()) return false;

    const opts = safeObject(options);
    const skipThrottle = Boolean(opts.skipThrottle);

    if (clientesState.creating && !pendingCreateRequest) {
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
      const opened = await openCreateClienteBridge({});

      if (!opened) {
        showToast("No se pudo abrir el formulario de cliente.", "error");
      }

      return opened;
    } catch (error) {
      safeWarn("handleCreateCliente falló:", error);
      showToast("No se pudo crear el cliente.", "error");
      return false;
    } finally {
      setState({
        creating: false,
      });

      if (!destroyed) {
        rerender();
      }
    }
  }

  /* =========================================================
     BINDINGS
  ========================================================= */

  function getActionTarget(event, actions = []) {
    const selectors = actions
      .map((action) => {
        return [
          `[data-clientes-action="${action}"]`,
          `[data-action="${action}"]`,
        ].join(",");
      })
      .join(",");

    if (!selectors) return null;

    return event.target?.closest?.(selectors) || null;
  }

  function getClienteIdFromElement(element = null) {
    if (!element) return "";

    const row = element.closest?.("[data-cliente-row='true'], [data-client-id], [data-cliente-id], [data-customer-id]");

    return safeText(
      first(
        element.dataset?.clienteId,
        element.dataset?.clientId,
        element.dataset?.customerId,
        element.dataset?.clienteCode,
        element.dataset?.clientCode,
        element.dataset?.customerCode,
        element.getAttribute?.("data-cliente-id"),
        element.getAttribute?.("data-client-id"),
        element.getAttribute?.("data-customer-id"),
        element.getAttribute?.("data-cliente-code"),
        element.getAttribute?.("data-client-code"),
        element.getAttribute?.("data-customer-code"),

        row?.dataset?.clienteId,
        row?.dataset?.clientId,
        row?.dataset?.customerId,
        row?.getAttribute?.("data-cliente-id"),
        row?.getAttribute?.("data-client-id"),
        row?.getAttribute?.("data-customer-id")
      ),
      ""
    );
  }

  function isInteractiveTarget(target = null) {
    return Boolean(
      target?.closest?.(
        [
          "button",
          "a",
          "input",
          "select",
          "textarea",
          "[role='button']",
          "[data-clientes-action]",
          "[data-action]",
        ].join(",")
      )
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
        "open-client",
        "open-cliente",
        "view-client",
        "view-cliente",
      ]);

      if (detailBtn) {
        event.preventDefault();
        event.stopPropagation();

        await handleOpenCliente(getClienteIdFromElement(detailBtn));
        return;
      }

      const copyBtn = getActionTarget(event, [
        "copy",
        "copy-client-id",
        "copy-cliente-id",
        "copy-id",
      ]);

      if (copyBtn) {
        event.preventDefault();
        event.stopPropagation();

        await handleCopyClienteId(getClienteIdFromElement(copyBtn));
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
          clientesState.page || 1
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
        "filter-clientes",
      ]);

      if (filterBtn) {
        event.preventDefault();

        setFilter(
          first(
            filterBtn.dataset?.filter,
            filterBtn.dataset?.filterStatus,
            filterBtn.getAttribute?.("data-filter"),
            filterBtn.getAttribute?.("data-filter-status"),
            "all"
          )
        );

        return;
      }

      const clearSearchBtn = getActionTarget(event, [
        "clear-search",
        "reset-search",
      ]);

      if (clearSearchBtn) {
        event.preventDefault();
        clearSearch();
        return;
      }

      const clearFiltersBtn = getActionTarget(event, [
        "clear-filters",
        "reset-filters",
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
        event.target?.closest?.("#clientes-export-btn");

      if (exportBtn) {
        event.preventDefault();
        await handleExportCsv();
        return;
      }

      const createBtn =
        getActionTarget(event, [
          "create",
          "new",
          "new-client",
          "new-cliente",
          "create-client",
          "create-cliente",
        ]) ||
        event.target?.closest?.("#clientes-create-btn") ||
        event.target?.closest?.("#clientes-create-empty-btn");

      if (createBtn) {
        event.preventDefault();
        event.stopPropagation();

        await handleCreateCliente();
        return;
      }

      const retryBtn =
        getActionTarget(event, [
          "retry",
        ]) ||
        event.target?.closest?.("#clientes-retry-btn");

      if (retryBtn) {
        event.preventDefault();

        await reload({
          force: true,
          asRefresh: false,
          silent: false,
        });

        return;
      }

      const refreshBtn =
        getActionTarget(event, [
          "refresh",
          "reload",
        ]) ||
        event.target?.closest?.("#clientes-refresh-btn");

      if (refreshBtn) {
        event.preventDefault();

        await reload({
          force: true,
          asRefresh: true,
          silent: false,
        });

        return;
      }

      const row = event.target?.closest?.("[data-cliente-row='true']");

      if (row && !isInteractiveTarget(event.target)) {
        const id = getClienteIdFromElement(row);

        if (id) {
          event.preventDefault();
          await handleOpenCliente(id);
        }
      }
    };

    const onInput = (event) => {
      if (destroyed) return;

      const searchInput =
        event.target?.closest?.("[data-clientes-search-input='true']") ||
        event.target?.closest?.("#clientes-search-input") ||
        event.target?.closest?.("[data-clientes-action='search']") ||
        event.target?.closest?.("[data-action='search-clientes']");

      if (searchInput) {
        scheduleSearchUpdate(searchInput.value || "");
      }
    };

    const onChange = (event) => {
      if (destroyed) return;

      const searchInput =
        event.target?.closest?.("[data-clientes-search-input='true']") ||
        event.target?.closest?.("#clientes-search-input") ||
        event.target?.closest?.("[data-clientes-action='search']") ||
        event.target?.closest?.("[data-action='search-clientes']");

      if (searchInput) {
        clearSearchDebounceTimer();
        setSearch(searchInput.value || "");
        return;
      }

      const pageSizeField =
        event.target?.closest?.("[data-clientes-field='page-size']") ||
        event.target?.closest?.("[data-field='page-size']");

      if (pageSizeField) {
        changePageSize(PAGE_SIZE);
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

      await handleRefreshClienteFromModal(
        first(
          payload.clientId,
          payload.clienteId,
          payload.customerId,
          payload.detail?.clientId,
          payload.detail?.clienteId,
          payload.detail?.customerId,
          payload.detail?.id,
          ""
        )
      );
    };

    const onCopy = async (event) => {
      const payload = getEventPayload(event);

      await handleCopyClienteId(
        first(
          payload.clientId,
          payload.clienteId,
          payload.customerId,
          payload.detail?.clientId,
          payload.detail?.clienteId,
          payload.detail?.customerId,
          payload.detail?.id,
          ""
        )
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
      bus.on("clientes:modal:refresh", onRefresh);
      bus.on("clientes:modal:copy", onCopy);

      bus.on("clientes:create:success", onMutated);
      bus.on("clientes:created", onMutated);
      bus.on("clientes:update:success", onMutated);
      bus.on("clientes:updated", onMutated);
      bus.on("clientes:delete:success", onMutated);
      bus.on("clientes:deleted", onMutated);
      bus.on("clientes:modal:updated", onMutated);
      bus.on("clientes:status:success", onMutated);

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
      try { bus.off("clientes:modal:refresh", onRefresh); } catch {}
      try { bus.off("clientes:modal:copy", onCopy); } catch {}

      try { bus.off("clientes:create:success", onMutated); } catch {}
      try { bus.off("clientes:created", onMutated); } catch {}
      try { bus.off("clientes:update:success", onMutated); } catch {}
      try { bus.off("clientes:updated", onMutated); } catch {}
      try { bus.off("clientes:delete:success", onMutated); } catch {}
      try { bus.off("clientes:deleted", onMutated); } catch {}
      try { bus.off("clientes:modal:updated", onMutated); } catch {}
      try { bus.off("clientes:status:success", onMutated); } catch {}

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
      window.addEventListener("clientes:create:success", onMutated);
      window.addEventListener("clientes:created", onMutated);
      window.addEventListener("clientes:update:success", onMutated);
      window.addEventListener("clientes:updated", onMutated);
      window.addEventListener("clientes:delete:success", onMutated);
      window.addEventListener("clientes:deleted", onMutated);
      window.addEventListener("clientes:modal:updated", onMutated);
      window.addEventListener("clientes:status:success", onMutated);

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
        window.removeEventListener("clientes:create:success", onMutated);
        window.removeEventListener("clientes:created", onMutated);
        window.removeEventListener("clientes:update:success", onMutated);
        window.removeEventListener("clientes:updated", onMutated);
        window.removeEventListener("clientes:delete:success", onMutated);
        window.removeEventListener("clientes:deleted", onMutated);
        window.removeEventListener("clientes:modal:updated", onMutated);
        window.removeEventListener("clientes:status:success", onMutated);

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

      safeEmit("clientes:init:done", {
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
      openingClienteId: "",
      openingClientId: "",
      openingCustomerId: "",
      creating: false,
      exporting: false,
      refreshing: false,
      loading: false,
      pageSize: PAGE_SIZE,
    });

    pendingCreateRequest = false;
    inflightReload = null;

    safeEmit("clientes:destroyed", {
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
     EXTRAS
  ========================================================= */

  function getCurrentItems() {
    return getItems();
  }

  function getCurrentPageItems() {
    const items = getItems();
    const pagination = getPaginationMeta(items);
    return pagination.items;
  }

  function getCurrentPagination() {
    return getPaginationMeta(getItems());
  }

  function getCurrentCliente(clientId = "") {
    return findClienteById(getItems(), clientId);
  }

  function getPublicStateSnapshot() {
    return {
      initialized,
      mounted,
      destroyed,

      loading: Boolean(clientesState.loading),
      refreshing: Boolean(clientesState.refreshing),
      creating: Boolean(clientesState.creating),
      exporting: Boolean(clientesState.exporting),
      hydrated: Boolean(clientesState.hydrated),
      loaded: Boolean(clientesState.loaded),

      page: safeNumber(clientesState.page, 1),
      pageSize: PAGE_SIZE,

      filter: clientesState.filter,
      search: clientesState.search,

      error: safeText(clientesState.error, ""),
      lastSyncAt: safeText(clientesState.lastSyncAt, ""),

      hasItems: getItems().length > 0,

      hasInflightInit: Boolean(inflightInit),
      hasInflightReload: Boolean(inflightReload),
      pendingCreateRequest,

      access: getAdminAccessSnapshot(),
      isAdmin: isAdminAccessAllowed(),
    };
  }

  function getState() {
    return {
      ...clientesState,
      ...getPublicStateSnapshot(),
      items: getItems(),
      pageItems: getCurrentPageItems(),
      pagination: getCurrentPagination(),
    };
  }

  function isInitialized() {
    return Boolean(initialized);
  }

  function isDestroyed() {
    return Boolean(destroyed);
  }

  function isMounted() {
    return Boolean(mounted);
  }

  function registerPublicBridge() {
    try {
      if (!AppCore.modules || typeof AppCore.modules !== "object") {
        AppCore.modules = {};
      }

      AppCore.modules.ClientesView = api;
      AppCore.modules.Clientes = api;
      AppCore.modules.OnionClientesView = api;
    } catch {}

    try {
      if (isBrowser()) {
        window.ClientesView = api;
        window.OnionClientesView = api;

        window.OnionClientes = {
          ...(window.OnionClientes && typeof window.OnionClientes === "object"
            ? window.OnionClientes
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
    source: "views:clientes:clientesView",

    init,
    mount,
    bootstrap,

    render: rerender,
    rerender,
    reload,

    destroy,
    unmount,
    dispose,

    openCliente: handleOpenCliente,
    refreshCliente: handleRefreshClienteFromModal,
    copyClienteId: handleCopyClienteId,
    exportCsv: handleExportCsv,
    createCliente: handleCreateCliente,

    goToPage,
    goPrevPage,
    goNextPage,
    changePageSize,

    setFilter,
    setSearch,
    clearSearch,
    clearFilters,

    getItems: getCurrentItems,
    getPageItems: getCurrentPageItems,
    getPagination: getCurrentPagination,
    getClienteById: getCurrentCliente,

    isAdmin: isAdminAccessAllowed,
    getAccess: getAdminAccessSnapshot,

    getState,
    getPublicStateSnapshot,

    isInitialized,
    isDestroyed,
    isMounted,

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

export default ClientesView;

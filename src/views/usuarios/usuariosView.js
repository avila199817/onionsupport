/* =========================================================
   Onion SPA - Usuarios View
   Archivo: src/views/usuarios/usuariosView.js

   ADMIN EXPERIENCE MODE · VIEW REAL · HARDENED · FINAL 10/10

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

  /*
    Requisito de vista:
    - 5 usuarios por hoja.
    - No dependemos de que el modelo venga con otro DEFAULT_PAGE_SIZE.
  */
  const PAGE_SIZE = 5;
  const FALLBACK_MODEL_PAGE_SIZE = Number(MODEL_DEFAULT_PAGE_SIZE || 5) || 5;
  const CREATE_CLICK_THROTTLE_MS = 450;

  /* =========================================================
     LOCAL RUNTIME
  ========================================================= */

  let initialized = false;
  let destroyed = false;
  let inflightInit = null;
  let inflightReload = null;
  let bindingsCleanup = null;
  let renderToken = 0;
  let pendingCreateRequest = false;
  let lastCreateClickAt = 0;

  /* =========================================================
     SAFE HELPERS
  ========================================================= */

  function safeLog(...args) {
    try {
      AppCore?.utils?.log?.("[UsuariosView]", ...args);
    } catch {}
  }

  function safeWarn(...args) {
    try {
      AppCore?.utils?.warn?.("[UsuariosView]", ...args);
    } catch {}
  }

  function safeEmit(event = "", payload = {}) {
    const eventName = safeText(event, "");
    if (!eventName) return false;

    try {
      AppCore?.events?.emit?.(eventName, payload);
      return true;
    } catch {}

    try {
      window.dispatchEvent(
        new CustomEvent(eventName, {
          detail: payload,
        })
      );
      return true;
    } catch {}

    return false;
  }

  function safeText(value, fallback = "") {
    if (value === null || value === undefined) return fallback;

    const text = String(value).trim();

    return text || fallback;
  }

  function safeNumber(value, fallback = 0) {
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
      .trim();
  }

  function waitForPaint() {
    return new Promise((resolve) => {
      try {
        if (typeof window === "undefined") {
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
    return (
      AppCore?.dom?.viewContainer ||
      document.getElementById("view-container") ||
      null
    );
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
    if (!text) return;

    try {
      if (typeof AppCore?.toast?.[type] === "function") {
        AppCore.toast[type](text);
        return;
      }
    } catch {}

    try {
      AppCore?.toast?.show?.(text, type);
      return;
    } catch {}

    try {
      AppCore?.ui?.toast?.[type]?.(text);
    } catch {}
  }

  function safeErrorMessage(error = null) {
    return safeText(
      first(
        error?.message,
        error?.response?.message,
        error?.response?.data?.message,
        error?.data?.message,
        error?.error,
        "No se pudo cargar la colección de usuarios."
      ),
      "No se pudo cargar la colección de usuarios."
    );
  }

  /* =========================================================
     ADMIN ACCESS
  ========================================================= */

  function isAdminRole(value = "") {
    const key = normalizeKey(value);

    return [
      "admin",
      "administrator",
      "administrador",
      "super_admin",
      "superadmin",
      "owner",
      "root",
    ].includes(key);
  }

  function getCurrentUser() {
    return safeObject(
      first(
        AppCore?.state?.user,
        AppCore?.state?.currentUser,
        AppCore?.state?.sessionUser,
        AppCore?.state?.authUser,
        usuariosState?.user,
        usuariosState?.currentUser,
        usuariosState?.sessionUser,
        usuariosState?.authUser
      )
    );
  }

  function isAdminAccessAllowed() {
    const user = getCurrentUser();

    if (
      usuariosState?.forbidden === true ||
      usuariosState?.accessDenied === true
    ) {
      return false;
    }

    const explicitAdmin = first(
      usuariosState?.isAdmin,
      usuariosState?.admin,
      usuariosState?.canManageUsers,
      usuariosState?.canAccessUsers,
      AppCore?.state?.isAdmin,
      AppCore?.state?.admin,
      AppCore?.state?.canManageUsers,
      AppCore?.state?.canAccessUsers,
      user?.isAdmin,
      user?.admin,
      user?.canManageUsers,
      user?.canAccessUsers
    );

    if (typeof explicitAdmin === "boolean") {
      return explicitAdmin;
    }

    const role = first(
      usuariosState?.role,
      usuariosState?.rol,
      usuariosState?.userRole,
      AppCore?.state?.role,
      AppCore?.state?.rol,
      AppCore?.state?.userRole,
      user?.role,
      user?.rol,
      user?.type,
      user?.userType
    );

    if (role) {
      return isAdminRole(role);
    }

    const roles = first(
      usuariosState?.roles,
      usuariosState?.permissions,
      AppCore?.state?.roles,
      AppCore?.state?.permissions,
      user?.roles,
      user?.permissions
    );

    if (Array.isArray(roles) && roles.length) {
      return roles.some((item) => isAdminRole(item));
    }

    /*
      Fail-open visual:
      - El bloqueo real debe vivir en router/guards.
      - Aquí solo bloqueamos si el estado indica claramente que NO hay acceso.
    */
    return true;
  }

  function requireAdminAction() {
    if (isAdminAccessAllowed()) {
      return true;
    }

    showToast("La vista de usuarios está reservada para administradores.", "error");
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

  function ensureBaseState() {
    /*
      Fijo a 5 por requisito.
      Aunque el modelo exporte otro DEFAULT_PAGE_SIZE, la vista manda.
    */
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

    usuariosState.remoteCount = Math.max(
      0,
      safeNumber(usuariosState.remoteCount, 0)
    );

    usuariosState.isAdmin = isAdminAccessAllowed();

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

    setState({
      remoteCount: total,
      loaded: true,
      hydrated: true,
      error: "",
      loading: false,
      refreshing: false,
      isAdmin: isAdminAccessAllowed(),
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
      typeof document !== "undefined" &&
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
    } catch (error) {
      safeWarn("OnionUsuariosModal hook falló:", error);
    }

    try {
      const hook =
        window?.renderUsuarioDetailModal ||
        window?.renderUsuarioModal ||
        window?.renderUsuariosModal;

      if (typeof hook === "function") {
        hook(detail);
        return true;
      }
    } catch (error) {
      safeWarn("usuario modal hook falló:", error);
    }

    safeEmit("usuarios:modal:open", { detail });

    return true;
  }

  async function openCreateUsuarioBridge(draft = {}) {
    try {
      const modal = window?.OnionUsuariosCreateModal;

      if (typeof modal?.open === "function") {
        modal.open(draft);
        return true;
      }
    } catch (error) {
      safeWarn("OnionUsuariosCreateModal hook falló:", error);
    }

    try {
      const hook =
        window?.renderUsuariosCreateModal ||
        window?.renderUsuarioCreateModal ||
        window?.openUsuarioCreateModal;

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

    safeEmit("usuarios:create-modal:open", { draft });

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
  ========================================================= */

  function applyErrorStateToDom(container) {
    if (!container) return;

    const oldBanner = container.querySelector(
      "[data-usuarios-error-banner='true']"
    );

    if (oldBanner) {
      oldBanner.remove();
    }

    const message = safeText(usuariosState.error, "");
    if (!message) return;

    const historyHead =
      container.querySelector(".usuarios-history-head") ||
      container.querySelector("[data-usuarios-history-head='true']") ||
      container.querySelector("[data-usuarios-table-head='true']") ||
      container.querySelector(".content-wrapper");

    if (!historyHead) return;

    const banner = document.createElement("div");
    banner.setAttribute("data-usuarios-error-banner", "true");

    Object.assign(banner.style, {
      margin: "0 18px 14px",
      padding: "11px 13px",
      borderRadius: "14px",
      border:
        "1px solid color-mix(in srgb, var(--danger-strong, #ff6b6b) 22%, var(--border-soft, rgba(15,23,42,.08)))",
      background:
        "linear-gradient(180deg, color-mix(in srgb, var(--danger-strong, #ff6b6b) 6%, transparent), transparent), var(--surface-1, rgba(255,255,255,.78))",
      color: "var(--text-soft, #4b5563)",
      fontSize: "12px",
      lineHeight: "1.5",
    });

    banner.textContent = message;
    historyHead.insertAdjacentElement("afterend", banner);
  }

  function decorateDom(container) {
    if (!container) return container;

    applyErrorStateToDom(container);

    return container;
  }

  /* =========================================================
     RENDER
  ========================================================= */

  function buildHtml() {
    const allItems = getItems();
    const pagination = clampPageAgainstItems(allItems);

    const remoteCount = Math.max(
      allItems.length,
      safeNumber(usuariosState.remoteCount, allItems.length)
    );

    const adminAllowed = isAdminAccessAllowed();

    setState({
      pageSize: PAGE_SIZE,
      isAdmin: adminAllowed,
      canManageUsers: adminAllowed,
      canAccessUsers: adminAllowed,
      forbidden: adminAllowed ? false : true,
    });

    return `
      <section class="panel-content dashboard ready" data-view="usuarios">
        <div class="content-wrapper" style="display:grid;gap:var(--space-lg);">
          ${renderUsuariosTableTemplate({
            items: allItems,
            totalCount: remoteCount,
            remoteCount,
            page: pagination.page,
            pageSize: PAGE_SIZE,
            totalPages: pagination.totalPages,
            lastUpdatedAt: usuariosState.lastSyncAt || "",
            title: "Usuarios y accesos",
            subtitle:
              "Consulta usuarios registrados, revisa su estado, ubicación y última conexión desde una vista clara, compacta y alineada con el sistema.",
            isAdmin: adminAllowed,
            canManageUsers: adminAllowed,
            canAccessUsers: adminAllowed,
            forbidden: adminAllowed ? false : true,
            user: getCurrentUser(),
            state: usuariosState,
          })}
        </div>
      </section>
    `;
  }

  function render() {
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

    container.innerHTML = buildHtml();
    decorateDom(container);

    try {
      setHydrated?.(true);
    } catch {}

    setState({
      hydrated: true,
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

    const itemsBefore = getItems();
    const hasVisibleData = itemsBefore.length > 0;

    setState({
      error: "",
      loading: !hasVisibleData && !silent,
      refreshing: hasVisibleData && asRefresh,
      pageSize: PAGE_SIZE,
      isAdmin: isAdminAccessAllowed(),
    });

    /*
      Listener en contenedor:
      aunque hacemos innerHTML, el listener sigue porque se re-bindea después.
    */
    render();

    if (!isAdminAccessAllowed()) {
      markIdle();
      return getItems();
    }

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

    /*
      FIX CRÍTICO DE CARRERA:
      1. Pintamos pantalla.
      2. Bindeamos inmediatamente el contenedor.
      3. Después cargamos datos.
      Así el usuario no pierde clicks si pulsa crear/refresh durante boot.
    */
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
     PAGE ACTIONS
  ========================================================= */

  function goToPage(page = 1) {
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
    /*
      La vista queda bloqueada a 5 por requisito.
      Se conserva el método por compatibilidad pública.
    */
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

    const onChange = (event) => {
      if (destroyed) return;

      const pageSizeField =
        event.target?.closest?.("[data-usuarios-field='page-size']") ||
        event.target?.closest?.("[data-field='page-size']");

      if (pageSizeField) {
        changePageSize(PAGE_SIZE);
      }
    };

    container.addEventListener("click", onClick);
    container.addEventListener("change", onChange);

    return () => {
      try {
        container.removeEventListener("click", onClick);
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
    };
  }

  function bindWindowEvents() {
    const onMutated = async () => {
      await reload({
        force: true,
        asRefresh: true,
        silent: true,
      });
    };

    const onReady = () => {
      flushPendingCreate();
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

    nextRenderToken();
    cleanupBindings();

    setState({
      openingUserId: "",
      creating: false,
      refreshing: false,
      loading: false,
      pageSize: PAGE_SIZE,
    });

    pendingCreateRequest = false;
    inflightReload = null;

    safeLog("destroy");
  }

  /* =========================================================
     API
  ========================================================= */

  const api = {
    init,
    render: rerender,
    reload,
    destroy,

    openUsuario: handleOpenUsuario,
    copyUsuarioId: handleCopyUsuarioId,
    exportCsv: handleExportCsv,
    createUsuario: handleCreateUsuario,

    goToPage,
    goPrevPage,
    goNextPage,
    changePageSize,

    getItems: () => getItems(),
    getPageItems: () => getPaginationMeta(getItems()).items,
    getPagination: () => getPaginationMeta(getItems()),
    getUsuarioById: (userId = "") =>
      findUsuarioById(getItems(), userId),

    isAdmin: () => isAdminAccessAllowed(),

    getState: () => ({
      ...usuariosState,
      initialized,
      destroyed,
      hasInflightInit: Boolean(inflightInit),
      hasInflightReload: Boolean(inflightReload),
      pendingCreateRequest,
      pageSize: PAGE_SIZE,
      isAdmin: isAdminAccessAllowed(),
    }),

    get initialized() {
      return initialized;
    },

    get destroyed() {
      return destroyed;
    },
  };

  return api;
})();

export default UsuariosView;

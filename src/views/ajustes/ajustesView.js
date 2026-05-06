/* =========================================================
   Onion SPA - Ajustes View
   Archivo: src/views/ajustes/ajustesView.js

   FINAL PRO SYSTEM · VIEW REAL · HARDENED · 10/10
   SETTINGS EXPERIENCE MODE · CSP CLEAN · NO INLINE CSS

   RESPONSABILIDADES:
   - punto de entrada real de la vista ajustes
   - render principal con template final unificado
   - paginación visual fija por vista
   - carga inicial robusta con fallback a cache
   - refresh con loader SOLO en contenido principal
   - apertura de ajuste con estado visual de loading
   - guardado / toggle delegados por bridge/evento
   - bind de eventos de pantalla
   - evitar doble bind de listeners
   - soportar destroy limpio del router
   - permitir reload con rerender seguro
   - coordinar acciones y modales sin mezclar responsabilidades
   - compatibilidad data-ajustes-action y data-action
   - sin estilos inline
   - sin CSS in JS

   HARDENING PRO:
   - render inicial inmediato
   - bind inmediato tras primer render para evitar pérdida de clicks
   - carga posterior segura
   - anti-race token
   - cleanup total
   - click delegation sólida
   - fallback elegante si el modal aún no existe
   - compatibilidad con template nuevo
   - estado openingAjusteId / openingSettingId sincronizado
   - paginación defensiva
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  ajustesState,
  setHydrated,
} from "./ajustes.state.js";

import {
  loadAjustes,
  hydrateFromCache,
} from "./ajustes.api.js";

import {
  getAjustes,
} from "./ajustes.store.js";

import {
  renderHeader,
  renderTable,
} from "./ajustes.table.template.js";

import {
  DEFAULT_PAGE_SIZE as MODEL_DEFAULT_PAGE_SIZE,
  normalizeAjustesCollection,
  sortAjustesByUpdatedDesc,
  paginateAjustes,
  findAjusteById,
  findAjusteByKey,
} from "./ajustes.model.js";

import {
  openAjusteAction,
  copyAjusteIdAction,
  copyAjusteKeyAction,
  exportAjustesCsvAction,
  createAjusteAction,
  refreshAjusteDetailAction,
} from "./ajustes.actions.js";

export const AjustesView = (() => {
  "use strict";

  /* =========================================================
     CONSTANTS
  ========================================================= */

  const SCOPE = "view:ajustes";
  const MODULE = "ajustes";
  const VIEW_NAME = "AjustesView";
  const VERSION = "10.0.0";

  const PAGE_SIZE = Number(MODEL_DEFAULT_PAGE_SIZE || 5) || 5;
  const CREATE_CLICK_THROTTLE_MS = 450;

  /* =========================================================
     LOCAL RUNTIME
  ========================================================= */

  let initialized = false;
  let mounted = false;
  let destroyed = false;

  let inflightInit = null;
  let inflightReload = null;
  let inflightOpen = null;
  let inflightSave = null;
  let inflightToggle = null;
  let inflightCreate = null;

  let bindingsCleanup = null;
  let renderToken = 0;
  let lastRenderedHtml = "";
  let lastCreateClickAt = 0;

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
      AppCore?.utils?.log?.("[AjustesView]", ...args);
    } catch {}
  }

  function safeWarn(...args) {
    try {
      AppCore?.utils?.warn?.("[AjustesView]", ...args);
    } catch {}

    try {
      console.warn("[AjustesView]", ...args);
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

  function first(...values) {
    for (const value of values) {
      if (value === undefined || value === null) continue;
      if (typeof value === "string" && value.trim() === "") continue;
      if (Array.isArray(value) && value.length === 0) continue;

      return value;
    }

    return null;
  }

  function normalizeKey(value = "") {
    return safeText(value, "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .replace(/[\s-]+/g, "_")
      .replace(/[^\w:.]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .trim();
  }

  function escapeHtml(value = "") {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
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

  function getEventPayload(event = null) {
    return safeObject(
      first(
        event?.detail,
        event?.payload,
        event
      )
    );
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

  function safeErrorMessage(error = null, fallback = "No se pudo cargar la colección de ajustes.") {
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

  function throttleCreateClick() {
    const now = Date.now();

    if (now - lastCreateClickAt < CREATE_CLICK_THROTTLE_MS) {
      return false;
    }

    lastCreateClickAt = now;
    return true;
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
      return ajustesState;
    }

    Object.assign(ajustesState, patch);

    return ajustesState;
  }

  function ensureBaseState() {
    ajustesState.pageSize = PAGE_SIZE;

    if (!Number.isFinite(Number(ajustesState.page))) {
      ajustesState.page = 1;
    }

    ajustesState.page = Math.max(1, safeNumber(ajustesState.page, 1));

    if (typeof ajustesState.loading !== "boolean") {
      ajustesState.loading = false;
    }

    if (typeof ajustesState.refreshing !== "boolean") {
      ajustesState.refreshing = false;
    }

    if (typeof ajustesState.saving !== "boolean") {
      ajustesState.saving = false;
    }

    if (typeof ajustesState.creating !== "boolean") {
      ajustesState.creating = false;
    }

    ajustesState.openingSettingId = safeText(
      first(
        ajustesState.openingSettingId,
        ajustesState.openingAjusteId,
        ""
      ),
      ""
    );

    ajustesState.openingAjusteId = ajustesState.openingSettingId;

    ajustesState.savingSettingId = safeText(
      first(
        ajustesState.savingSettingId,
        ajustesState.savingAjusteId,
        ""
      ),
      ""
    );

    ajustesState.savingAjusteId = ajustesState.savingSettingId;

    ajustesState.error = safeText(ajustesState.error, "");
    ajustesState.lastSyncAt = safeText(ajustesState.lastSyncAt, "");

    return ajustesState;
  }

  function markIdle() {
    setState({
      loading: false,
      refreshing: false,
    });

    return ajustesState;
  }

  function markLoadedOk(items = []) {
    const rows = safeArray(items);

    setState({
      remoteCount: Math.max(rows.length, safeNumber(ajustesState.remoteCount, rows.length)),
      loaded: true,
      hydrated: true,
      error: "",
      loading: false,
      refreshing: false,
      pageSize: PAGE_SIZE,
      lastSyncAt: new Date().toISOString(),
    });

    try {
      setHydrated?.(true);
    } catch {}

    return rows;
  }

  /* =========================================================
     ITEMS / MODEL HELPERS
  ========================================================= */

  function getRawItems() {
    try {
      return safeArray(getAjustes());
    } catch {
      return [];
    }
  }

  function getStableAjusteId(item = {}) {
    return safeText(
      first(
        item?.settingId,
        item?.ajusteId,
        item?.id,
        item?._id,
        item?.key,
        item?.code,
        item?.name,
        item?.raw?.settingId,
        item?.raw?.ajusteId,
        item?.raw?.id,
        item?.raw?._id,
        item?.raw?.key,
        item?.raw?.code,
        item?.raw?.name
      ),
      ""
    );
  }

  function getStableAjusteKey(item = {}) {
    return safeText(
      first(
        item?.key,
        item?.settingKey,
        item?.preferenceKey,
        item?.code,
        item?.name,
        item?.raw?.key,
        item?.raw?.settingKey,
        item?.raw?.preferenceKey,
        item?.raw?.code,
        item?.raw?.name
      ),
      ""
    );
  }

  function patchRawFallback(normalizedItem = {}, rawItem = {}) {
    const item = safeObject(normalizedItem);
    const raw = safeObject(first(item.raw, rawItem));

    const id = first(
      item.settingId,
      item.ajusteId,
      item.id,
      raw.settingId,
      raw.ajusteId,
      raw.id,
      raw._id,
      item.key,
      raw.key
    );

    const key = first(
      item.key,
      item.settingKey,
      item.preferenceKey,
      raw.key,
      raw.settingKey,
      raw.preferenceKey,
      item.code,
      raw.code
    );

    return {
      ...item,
      raw,

      id: first(item.id, raw.id, raw._id, id),
      settingId: first(item.settingId, raw.settingId, raw.ajusteId, id),
      ajusteId: first(item.ajusteId, raw.ajusteId, raw.settingId, id),

      key,
      settingKey: first(item.settingKey, raw.settingKey, key),
      preferenceKey: first(item.preferenceKey, raw.preferenceKey, key),

      code: first(item.code, raw.code, key, id),

      title: first(item.title, raw.title, item.name, raw.name, item.label, raw.label, key),
      name: first(item.name, raw.name, item.title, raw.title, key),
      label: first(item.label, raw.label, item.title, raw.title, item.name, raw.name),

      description: first(item.description, raw.description, item.descripcion, raw.descripcion, item.summary, raw.summary),
      descripcion: first(item.descripcion, raw.descripcion, item.description, raw.description),

      category: first(item.category, raw.category, item.categoria, raw.categoria, item.group, raw.group, item.section, raw.section),
      categoria: first(item.categoria, raw.categoria, item.category, raw.category),

      value: first(item.value, raw.value, item.valor, raw.valor, item.enabled, raw.enabled, item.active, raw.active),
      valor: first(item.valor, raw.valor, item.value, raw.value),

      enabled: first(item.enabled, raw.enabled, item.isEnabled, raw.isEnabled, item.active, raw.active),
      active: first(item.active, raw.active, item.enabled, raw.enabled),
      isEnabled: first(item.isEnabled, raw.isEnabled, item.enabled, raw.enabled),
      isActive: first(item.isActive, raw.isActive, item.active, raw.active),

      status: first(item.status, raw.status, item.estado, raw.estado),
      estado: first(item.estado, raw.estado, item.status, raw.status),

      clienteId: first(
        item.clienteId,
        item.clientId,
        item.customerId,
        raw.clienteId,
        raw.clientId,
        raw.customerId,
        raw.cliente?.id,
        raw.client?.id,
        raw.customer?.id
      ),

      clientId: first(item.clientId, raw.clientId, item.clienteId, raw.clienteId),
      customerId: first(item.customerId, raw.customerId, item.clienteId, raw.clienteId),

      cliente: first(item.cliente, raw.cliente, item.client, raw.client, item.customer, raw.customer),
      client: first(item.client, raw.client, item.cliente, raw.cliente),
      customer: first(item.customer, raw.customer, item.cliente, raw.cliente),

      clientName: first(item.clientName, raw.clientName, item.clienteName, raw.clienteName),
      clienteName: first(item.clienteName, raw.clienteName, item.clientName, raw.clientName),
      customerName: first(item.customerName, raw.customerName, item.clienteName, raw.clienteName),

      createdAt: first(item.createdAt, raw.createdAt, raw.created_at, item.created_at),
      created_at: first(item.created_at, raw.created_at, item.createdAt, raw.createdAt),
      updatedAt: first(item.updatedAt, raw.updatedAt, raw.updated_at, item.updated_at, item.modifiedAt, raw.modifiedAt),
      updated_at: first(item.updated_at, raw.updated_at, item.updatedAt, raw.updatedAt),
      modifiedAt: first(item.modifiedAt, raw.modifiedAt, item.updatedAt, raw.updatedAt),
    };
  }

  function getItems() {
    try {
      const rawItems = safeArray(getRawItems());

      const rawById = new Map();
      const rawByKey = new Map();

      rawItems.forEach((rawItem) => {
        const id = getStableAjusteId(rawItem);
        const key = getStableAjusteKey(rawItem);

        if (id && !rawById.has(id)) rawById.set(id, rawItem);
        if (key && !rawByKey.has(key)) rawByKey.set(key, rawItem);
      });

      const normalizedItems = safeArray(normalizeAjustesCollection(rawItems));

      const patchedItems = normalizedItems.map((item, index) => {
        const id = getStableAjusteId(item);
        const key = getStableAjusteKey(item);

        const matchingRaw =
          rawById.get(id) ||
          rawByKey.get(key) ||
          rawItems[index] ||
          {};

        return patchRawFallback(item, matchingRaw);
      });

      return sortAjustesByUpdatedDesc(patchedItems);
    } catch (error) {
      safeWarn("getItems falló:", error);

      try {
        return sortAjustesByUpdatedDesc(safeArray(getRawItems()));
      } catch {
        return [];
      }
    }
  }

  function normalizePaginationResult(result = {}, items = []) {
    const obj = safeObject(result);

    const pageItems = safeArray(
      first(
        obj.items,
        obj.pageItems,
        obj.rows,
        obj.data,
        []
      )
    );

    const totalCount = safeNumber(
      first(
        obj.totalCount,
        obj.total,
        obj.count,
        safeArray(items).length
      ),
      safeArray(items).length
    );

    const pageSize = Math.max(
      1,
      safeNumber(
        first(
          obj.pageSize,
          obj.limit,
          PAGE_SIZE
        ),
        PAGE_SIZE
      )
    );

    const totalPages = Math.max(
      1,
      safeNumber(
        first(
          obj.totalPages,
          obj.pages,
          Math.ceil((totalCount || 1) / pageSize)
        ),
        Math.ceil((totalCount || 1) / pageSize)
      )
    );

    const page = Math.min(
      totalPages,
      Math.max(
        1,
        safeNumber(
          first(
            obj.page,
            obj.currentPage,
            ajustesState.page,
            1
          ),
          1
        )
      )
    );

    const startIndex = totalCount && pageItems.length
      ? ((page - 1) * pageSize) + 1
      : 0;

    const endIndex = totalCount
      ? Math.min(((page - 1) * pageSize) + pageItems.length, totalCount)
      : 0;

    return {
      ...obj,
      items: pageItems,
      pageItems,
      page,
      currentPage: page,
      pageSize,
      totalCount,
      total: totalCount,
      totalPages,
      hasPrev: page > 1,
      hasNext: page < totalPages,
      rangeStart: startIndex,
      rangeEnd: endIndex,
    };
  }

  function getPaginationMeta(items = []) {
    const rows = safeArray(items);

    try {
      const result = paginateAjustes(
        rows,
        ajustesState.page || 1,
        ajustesState.pageSize || PAGE_SIZE
      );

      return normalizePaginationResult(result, rows);
    } catch {
      const pageSize = PAGE_SIZE;
      const totalCount = rows.length;
      const totalPages = Math.max(1, Math.ceil((totalCount || 1) / pageSize));
      const page = Math.min(
        totalPages,
        Math.max(1, safeNumber(ajustesState.page, 1))
      );

      const start = (page - 1) * pageSize;
      const pageItems = rows.slice(start, start + pageSize);

      return normalizePaginationResult(
        {
          items: pageItems,
          page,
          pageSize,
          totalCount,
          totalPages,
        },
        rows
      );
    }
  }

  function clampPageAgainstItems(items = []) {
    const pagination = getPaginationMeta(items);

    if (safeNumber(ajustesState.page, 1) !== pagination.page) {
      ajustesState.page = pagination.page;
    }

    ajustesState.pageSize = PAGE_SIZE;

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
     BRIDGES
  ========================================================= */

  function openAjusteModalBridge(detail = null) {
    if (!detail) return false;

    try {
      const modal = window?.OnionAjustesModal;

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
      safeWarn("OnionAjustesModal hook falló:", error);
    }

    try {
      const hook =
        window?.renderAjusteDetailModal ||
        window?.renderAjusteModal ||
        window?.openAjusteModal ||
        window?.showAjusteModal;

      if (typeof hook === "function") {
        hook(detail);
        return true;
      }
    } catch (error) {
      safeWarn("ajuste modal hook legacy falló:", error);
    }

    safeEmit("ajustes:modal:open", {
      detail,
      source: MODULE,
      view: VIEW_NAME,
    });

    return true;
  }

  function requestSaveBridge(payload = {}) {
    const data = {
      ...safeObject(payload),
      source: MODULE,
      view: VIEW_NAME,
    };

    try {
      const api = window?.OnionAjustes;

      if (typeof api?.save === "function") {
        api.save(data);
        return true;
      }

      if (typeof api?.update === "function") {
        api.update(data);
        return true;
      }

      if (typeof api?.persist === "function") {
        api.persist(data);
        return true;
      }
    } catch (error) {
      safeWarn("OnionAjustes save bridge falló:", error);
    }

    try {
      const hook =
        window?.saveAjustes ||
        window?.updateAjustes ||
        window?.persistAjustes;

      if (typeof hook === "function") {
        hook(data);
        return true;
      }
    } catch (error) {
      safeWarn("save ajustes legacy hook falló:", error);
    }

    return safeEmit("ajustes:save:requested", data);
  }

  function requestToggleBridge(payload = {}) {
    const data = {
      ...safeObject(payload),
      source: MODULE,
      view: VIEW_NAME,
    };

    try {
      const api = window?.OnionAjustes;

      if (typeof api?.toggle === "function") {
        api.toggle(data);
        return true;
      }

      if (typeof api?.updateSetting === "function") {
        api.updateSetting(data);
        return true;
      }

      if (typeof api?.change === "function") {
        api.change(data);
        return true;
      }
    } catch (error) {
      safeWarn("OnionAjustes toggle bridge falló:", error);
    }

    try {
      const hook =
        window?.toggleAjuste ||
        window?.updateAjusteSetting ||
        window?.changeAjuste;

      if (typeof hook === "function") {
        hook(data);
        return true;
      }
    } catch (error) {
      safeWarn("toggle ajuste legacy hook falló:", error);
    }

    return safeEmit("ajustes:toggle:requested", data);
  }

  /* =========================================================
     RENDER SAFE
  ========================================================= */

  function renderHeaderSafe(payload = {}) {
    try {
      if (typeof renderHeader === "function") {
        return renderHeader(payload);
      }
    } catch (error) {
      safeWarn("renderHeader ajustes falló:", error);
    }

    return `
      <section class="ajustes-state ajustes-state--error">
        <h1 class="ajustes-state-title">Ajustes</h1>
        <p class="ajustes-state-text">No se pudo renderizar la cabecera de ajustes.</p>
      </section>
    `;
  }

  function renderTableSafe(payload = {}) {
    try {
      if (typeof renderTable === "function") {
        return renderTable(payload);
      }
    } catch (error) {
      safeWarn("renderTable ajustes falló:", error);
    }

    return `
      <section class="ajustes-state ajustes-state--error">
        <h3 class="ajustes-state-title">No se pudo renderizar la vista de ajustes</h3>
        <p class="ajustes-state-text">Revisa el template de ajustes y vuelve a cargar la vista.</p>
      </section>
    `;
  }

  function renderPagination(pagination = {}) {
    const totalPages = Math.max(1, safeNumber(pagination.totalPages, 1));
    const currentPage = Math.min(
      totalPages,
      Math.max(1, safeNumber(pagination.page, 1))
    );

    return `
      <nav
        class="ajustes-pagination"
        aria-label="Paginación de ajustes"
        data-ajustes-pagination="true"
      >
        <button
          type="button"
          class="ajustes-pagination-btn"
          data-ajustes-action="prev-page"
          data-action="prev-page"
          data-page="${escapeHtml(String(Math.max(1, currentPage - 1)))}"
          ${currentPage <= 1 ? 'disabled aria-disabled="true"' : ""}
        >
          Anterior
        </button>

        <span class="ajustes-pagination-status">
          ${escapeHtml(`${currentPage}/${totalPages}`)}
        </span>

        <button
          type="button"
          class="ajustes-pagination-btn ajustes-pagination-btn--next"
          data-ajustes-action="next-page"
          data-action="next-page"
          data-page="${escapeHtml(String(Math.min(totalPages, currentPage + 1)))}"
          ${currentPage >= totalPages ? 'disabled aria-disabled="true"' : ""}
        >
          Siguiente
        </button>
      </nav>
    `;
  }

  function buildHtml() {
    const allItems = getItems();
    const pagination = clampPageAgainstItems(allItems);
    const pageItems = safeArray(pagination.items);

    const renderState = {
      ...ajustesState,

      page: pagination.page,
      currentPage: pagination.page,
      pageSize: PAGE_SIZE,
      totalPages: pagination.totalPages,
      totalCount: pagination.totalCount,
      rangeStart: pagination.rangeStart,
      rangeEnd: pagination.rangeEnd,

      openingAjusteId: safeText(
        first(
          ajustesState.openingAjusteId,
          ajustesState.openingSettingId,
          ""
        ),
        ""
      ),

      openingSettingId: safeText(
        first(
          ajustesState.openingSettingId,
          ajustesState.openingAjusteId,
          ""
        ),
        ""
      ),

      savingAjusteId: safeText(
        first(
          ajustesState.savingAjusteId,
          ajustesState.savingSettingId,
          ""
        ),
        ""
      ),

      savingSettingId: safeText(
        first(
          ajustesState.savingSettingId,
          ajustesState.savingAjusteId,
          ""
        ),
        ""
      ),
    };

    const headerPayload = {
      items: allItems,
      totalCount: allItems.length,
      pageItems,
      pagination,
      state: renderState,
      lastUpdatedAt: ajustesState.lastSyncAt || "",
      title: "Ajustes",
      subtitle:
        "Gestiona preferencias, configuración operativa y ajustes asociados a clientes desde un panel centralizado.",
    };

    const tablePayload = {
      items: pageItems,
      allItems,
      totalCount: allItems.length,
      page: pagination.page,
      pageSize: PAGE_SIZE,
      totalPages: pagination.totalPages,
      pagination,
      state: renderState,
    };

    return `
      <section
        class="panel-content dashboard ready"
        data-view="ajustes"
        data-module="ajustes"
        data-ajustes-view="true"
      >
        <div class="content-wrapper ajustes-view__content">
          <section class="ajustes-view-root" data-ajustes-scope="true">
            ${renderHeaderSafe(headerPayload)}
            ${renderTableSafe(tablePayload)}
            ${renderPagination(pagination)}
          </section>
        </div>
      </section>
    `;
  }

  function decorateDom(container) {
    if (!container) return container;

    try {
      container.setAttribute("data-ajustes-mounted", "true");
      container.setAttribute("data-ajustes-view-version", VERSION);
    } catch {}

    return container;
  }

  function render() {
    if (destroyed) return null;

    const container = getContainer();

    if (!container) {
      safeWarn("No existe #view-container para renderizar ajustes.");
      return null;
    }

    ensureBaseState();

    try {
      AppCore?.setDocumentTitle?.("Ajustes");
    } catch {}

    try {
      AppCore?.clearDynamicContainers?.();
    } catch {}

    const html = buildHtml();

    try {
      container.innerHTML = html;
      lastRenderedHtml = html;
      mounted = true;
    } catch (error) {
      safeWarn("Render HTML ajustes falló:", error);
      return null;
    }

    decorateDom(container);

    try {
      setHydrated?.(true);
    } catch {}

    setState({
      hydrated: true,
    });

    safeEmit("ajustes:rendered", {
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
      await loadAjustes({
        force,
      });

      const itemsAfter = getItems();

      markLoadedOk(itemsAfter);
      clampPageAgainstItems(itemsAfter);

      safeEmit("ajustes:loaded", {
        items: itemsAfter,
        count: itemsAfter.length,
        source: MODULE,
        view: VIEW_NAME,
      });

      return itemsAfter;
    } catch (error) {
      const message = safeErrorMessage(error);

      safeWarn("loadAjustes falló:", error);

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

      safeEmit("ajustes:load:error", {
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

    return api;
  }

  /* =========================================================
     PAGE ACTIONS
  ========================================================= */

  function goToPage(page = 1) {
    if (ajustesState.loading || ajustesState.refreshing) {
      return ajustesState.page || 1;
    }

    const items = getItems();
    const pagination = getPaginationMeta(items);

    const totalPages = Math.max(1, safeNumber(pagination.totalPages, 1));
    const nextPage = Math.min(
      totalPages,
      Math.max(1, safeNumber(page, ajustesState.page || 1))
    );

    setState({
      page: nextPage,
      pageSize: PAGE_SIZE,
    });

    rerender();

    return nextPage;
  }

  function goPrevPage() {
    return goToPage((ajustesState.page || 1) - 1);
  }

  function goNextPage() {
    return goToPage((ajustesState.page || 1) + 1);
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

  async function handleOpenAjuste(settingId = "") {
    if (destroyed) return null;

    if (inflightOpen) {
      return inflightOpen;
    }

    const id = safeText(settingId, "");

    if (!id) {
      showToast("Ajuste inválido.", "error");
      return null;
    }

    inflightOpen = (async () => {
      setState({
        openingSettingId: id,
        openingAjusteId: id,
      });

      rerender();
      await waitForPaint();

      try {
        const detail = await openAjusteAction({
          settingId: id,
          ajusteId: id,
          preferFresh: true,
          silent: true,
        });

        if (!detail) {
          showToast("No se pudo abrir el ajuste.", "error");
          return null;
        }

        openAjusteModalBridge(detail);

        safeEmit("ajustes:open:success", {
          detail,
          settingId: id,
          ajusteId: id,
          source: MODULE,
          view: VIEW_NAME,
        });

        return detail;
      } catch (error) {
        safeWarn("handleOpenAjuste falló:", error);

        safeEmit("ajustes:open:error", {
          error,
          settingId: id,
          ajusteId: id,
          source: MODULE,
          view: VIEW_NAME,
        });

        showToast("No se pudo abrir el ajuste.", "error");

        return null;
      } finally {
        setState({
          openingSettingId: "",
          openingAjusteId: "",
        });

        inflightOpen = null;

        if (!destroyed) {
          rerender();
        }
      }
    })();

    return inflightOpen;
  }

  async function handleRefreshAjusteFromModal(settingId = "") {
    const id = safeText(settingId, "");
    if (!id) return null;

    try {
      const detail = await refreshAjusteDetailAction({
        settingId: id,
        ajusteId: id,
        silent: true,
      });

      if (!detail) {
        showToast("No se pudo refrescar el ajuste.", "error");
        return null;
      }

      openAjusteModalBridge(detail);

      return detail;
    } catch (error) {
      safeWarn("handleRefreshAjusteFromModal falló:", error);
      showToast("No se pudo refrescar el ajuste.", "error");
      return null;
    }
  }

  async function handleCopyAjusteId(settingId = "") {
    const id = safeText(settingId, "");

    if (!id) {
      showToast("No hay referencia para copiar.", "error");
      return false;
    }

    try {
      return await copyAjusteIdAction({
        settingId: id,
        ajusteId: id,
        silent: false,
      });
    } catch (error) {
      safeWarn("handleCopyAjusteId falló:", error);
      showToast("No se pudo copiar la referencia.", "error");
      return false;
    }
  }

  async function handleCopyAjusteKey(key = "") {
    const finalKey = safeText(key, "");

    if (!finalKey) {
      showToast("No hay clave para copiar.", "error");
      return false;
    }

    try {
      return await copyAjusteKeyAction({
        key: finalKey,
        item: {
          key: finalKey,
        },
        silent: false,
      });
    } catch (error) {
      safeWarn("handleCopyAjusteKey falló:", error);
      showToast("No se pudo copiar la clave.", "error");
      return false;
    }
  }

  function handleExportCsv() {
    try {
      return exportAjustesCsvAction({
        silent: false,
      });
    } catch (error) {
      safeWarn("handleExportCsv falló:", error);
      showToast("No se pudo exportar la colección de ajustes.", "error");
      return false;
    }
  }

  async function handleCreateAjuste() {
    if (destroyed) return false;

    if (inflightCreate) {
      return inflightCreate;
    }

    if (!throttleCreateClick()) {
      return false;
    }

    inflightCreate = (async () => {
      setState({
        creating: true,
        saving: true,
      });

      rerender();
      await waitForPaint();

      try {
        const ok = await createAjusteAction({
          silent: false,
        });

        safeEmit("ajustes:create:requested", {
          ok,
          source: MODULE,
          view: VIEW_NAME,
        });

        return Boolean(ok ?? true);
      } catch (error) {
        safeWarn("handleCreateAjuste falló:", error);
        showToast("No se pudo crear el ajuste.", "error");
        return false;
      } finally {
        setState({
          creating: false,
          saving: false,
        });

        inflightCreate = null;

        if (!destroyed) {
          rerender();
        }
      }
    })();

    return inflightCreate;
  }

  async function handleSaveAjustes(payload = {}) {
    if (destroyed) return false;

    if (inflightSave) {
      return inflightSave;
    }

    inflightSave = (async () => {
      setState({
        saving: true,
        error: "",
      });

      rerender();
      await waitForPaint();

      try {
        const handled = requestSaveBridge({
          ...safeObject(payload),
          items: getItems(),
          state: {
            ...ajustesState,
          },
        });

        safeEmit("ajustes:save:sent", {
          handled,
          source: MODULE,
          view: VIEW_NAME,
        });

        if (handled) {
          showToast("Solicitud de guardado enviada.", "success");
        } else {
          showToast("Conecta el handler ajustes:save:requested para guardar cambios.", "info");
        }

        return handled;
      } catch (error) {
        const message = safeErrorMessage(error, "No se pudieron guardar los ajustes.");

        safeWarn("handleSaveAjustes falló:", error);
        showToast(message, "error");

        return false;
      } finally {
        setState({
          saving: false,
        });

        inflightSave = null;

        if (!destroyed) {
          rerender();
        }
      }
    })();

    return inflightSave;
  }

  async function handleToggleAjuste(settingId = "") {
    if (destroyed) return false;

    if (inflightToggle) {
      return inflightToggle;
    }

    const id = safeText(settingId, "");

    if (!id) {
      showToast("Ajuste inválido.", "error");
      return false;
    }

    inflightToggle = (async () => {
      const item =
        findAjusteById(getItems(), id) ||
        findAjusteByKey(getItems(), id) ||
        null;

      setState({
        saving: true,
        savingSettingId: id,
        savingAjusteId: id,
      });

      rerender();
      await waitForPaint();

      try {
        const handled = requestToggleBridge({
          settingId: id,
          ajusteId: id,
          item,
        });

        safeEmit("ajustes:toggle:sent", {
          handled,
          settingId: id,
          ajusteId: id,
          source: MODULE,
          view: VIEW_NAME,
        });

        if (handled) {
          showToast("Solicitud de cambio enviada.", "success");
        } else {
          showToast("Conecta el handler ajustes:toggle:requested para cambiar el ajuste.", "info");
        }

        return handled;
      } catch (error) {
        const message = safeErrorMessage(error, "No se pudo cambiar el ajuste.");

        safeWarn("handleToggleAjuste falló:", error);
        showToast(message, "error");

        return false;
      } finally {
        setState({
          saving: false,
          savingSettingId: "",
          savingAjusteId: "",
        });

        inflightToggle = null;

        if (!destroyed) {
          rerender();
        }
      }
    })();

    return inflightToggle;
  }

  /* =========================================================
     BINDINGS
  ========================================================= */

  function getActionTarget(event, actions = []) {
    const selectors = safeArray(actions)
      .map((action) => {
        const safeAction = CSS?.escape
          ? CSS.escape(String(action))
          : String(action).replace(/"/g, '\\"');

        return [
          `[data-ajustes-action="${safeAction}"]`,
          `[data-action="${safeAction}"]`,
        ].join(",");
      })
      .join(",");

    if (!selectors) return null;

    return event.target?.closest?.(selectors) || null;
  }

  function getClosestAjusteElement(element = null) {
    if (!element) return null;

    return (
      element.closest?.("[data-ajuste-id]") ||
      element.closest?.("[data-setting-id]") ||
      element.closest?.("[data-ajuste-card='true']") ||
      element.closest?.("[data-ajuste-row='true']") ||
      element.closest?.("[data-setting-row='true']") ||
      element
    );
  }

  function getAjusteIdFromElement(element = null) {
    const node = getClosestAjusteElement(element);

    if (!node) return "";

    return safeText(
      first(
        node.dataset?.settingId,
        node.dataset?.ajusteId,
        node.dataset?.id,
        node.dataset?.key,
        node.getAttribute?.("data-setting-id"),
        node.getAttribute?.("data-ajuste-id"),
        node.getAttribute?.("data-id"),
        node.getAttribute?.("data-key")
      ),
      ""
    );
  }

  function getAjusteKeyFromElement(element = null) {
    const node = getClosestAjusteElement(element);

    if (!node) return "";

    return safeText(
      first(
        node.dataset?.key,
        node.dataset?.settingKey,
        node.dataset?.preferenceKey,
        node.getAttribute?.("data-key"),
        node.getAttribute?.("data-setting-key"),
        node.getAttribute?.("data-preference-key")
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
        "open-ajuste",
        "open-setting",
        "view-ajuste",
        "view-setting",
      ]);

      if (detailBtn) {
        event.preventDefault();
        event.stopPropagation();

        await handleOpenAjuste(getAjusteIdFromElement(detailBtn));
        return;
      }

      const toggleBtn = getActionTarget(event, [
        "toggle",
        "toggle-ajuste",
        "toggle-setting",
        "change",
        "change-ajuste",
        "update-ajuste",
      ]);

      if (toggleBtn) {
        event.preventDefault();
        event.stopPropagation();

        await handleToggleAjuste(getAjusteIdFromElement(toggleBtn));
        return;
      }

      const copyIdBtn = getActionTarget(event, [
        "copy",
        "copy-id",
        "copy-ajuste-id",
        "copy-setting-id",
      ]);

      if (copyIdBtn) {
        event.preventDefault();
        event.stopPropagation();

        await handleCopyAjusteId(getAjusteIdFromElement(copyIdBtn));
        return;
      }

      const copyKeyBtn = getActionTarget(event, [
        "copy-key",
        "copy-ajuste-key",
        "copy-setting-key",
      ]);

      if (copyKeyBtn) {
        event.preventDefault();
        event.stopPropagation();

        await handleCopyAjusteKey(getAjusteKeyFromElement(copyKeyBtn));
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
          ajustesState.page || 1
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
          "export-ajustes",
        ]) ||
        event.target?.closest?.("#ajustes-export-btn");

      if (exportBtn) {
        event.preventDefault();
        handleExportCsv();
        return;
      }

      const createBtn =
        getActionTarget(event, [
          "create",
          "new",
          "new-ajuste",
          "create-ajuste",
          "create-setting",
        ]) ||
        event.target?.closest?.("#ajustes-create-btn");

      if (createBtn) {
        event.preventDefault();
        event.stopPropagation();

        await handleCreateAjuste();
        return;
      }

      const saveBtn =
        getActionTarget(event, [
          "save",
          "save-ajustes",
          "save-settings",
        ]) ||
        event.target?.closest?.("#ajustes-save-btn");

      if (saveBtn) {
        event.preventDefault();
        event.stopPropagation();

        await handleSaveAjustes();
        return;
      }

      const retryBtn =
        getActionTarget(event, [
          "retry",
          "retry-ajustes",
        ]) ||
        event.target?.closest?.("#ajustes-retry-btn");

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
          "refresh-ajustes",
        ]) ||
        event.target?.closest?.("#ajustes-refresh-btn") ||
        event.target?.closest?.("#ajustes-refresh-empty-btn");

      if (refreshBtn) {
        event.preventDefault();

        await reload({
          force: true,
          asRefresh: true,
          silent: false,
        });
      }
    };

    const onChange = (event) => {
      if (destroyed) return;

      const pageSizeField =
        event.target?.closest?.("[data-ajustes-field='page-size']") ||
        event.target?.closest?.("[data-field='page-size']");

      if (pageSizeField) {
        changePageSize();
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

      await handleRefreshAjusteFromModal(
        payload.settingId ||
          payload.ajusteId ||
          payload.id ||
          payload.detail?.settingId ||
          payload.detail?.ajusteId ||
          payload.detail?.id ||
          ""
      );
    };

    const onCopyId = async (event) => {
      const payload = getEventPayload(event);

      await handleCopyAjusteId(
        payload.settingId ||
          payload.ajusteId ||
          payload.id ||
          payload.detail?.settingId ||
          payload.detail?.ajusteId ||
          payload.detail?.id ||
          ""
      );
    };

    const onCopyKey = async (event) => {
      const payload = getEventPayload(event);

      await handleCopyAjusteKey(
        payload.key ||
          payload.settingKey ||
          payload.detail?.key ||
          payload.detail?.settingKey ||
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

    try {
      bus.on("ajustes:modal:refresh", onRefresh);
      bus.on("ajustes:modal:copy-id", onCopyId);
      bus.on("ajustes:modal:copy-key", onCopyKey);

      bus.on("ajustes:create:success", onMutated);
      bus.on("ajustes:created", onMutated);
      bus.on("ajustes:update:success", onMutated);
      bus.on("ajustes:updated", onMutated);
      bus.on("ajustes:toggle:success", onMutated);
      bus.on("ajustes:toggled", onMutated);
      bus.on("ajustes:delete:success", onMutated);
      bus.on("ajustes:deleted", onMutated);
      bus.on("ajustes:modal:updated", onMutated);
      bus.on("ajustes:preferences:mutated", onMutated);
    } catch (error) {
      safeWarn("bindModalBridgeEvents falló:", error);
    }

    return () => {
      try { bus.off?.("ajustes:modal:refresh", onRefresh); } catch {}
      try { bus.off?.("ajustes:modal:copy-id", onCopyId); } catch {}
      try { bus.off?.("ajustes:modal:copy-key", onCopyKey); } catch {}

      try { bus.off?.("ajustes:create:success", onMutated); } catch {}
      try { bus.off?.("ajustes:created", onMutated); } catch {}
      try { bus.off?.("ajustes:update:success", onMutated); } catch {}
      try { bus.off?.("ajustes:updated", onMutated); } catch {}
      try { bus.off?.("ajustes:toggle:success", onMutated); } catch {}
      try { bus.off?.("ajustes:toggled", onMutated); } catch {}
      try { bus.off?.("ajustes:delete:success", onMutated); } catch {}
      try { bus.off?.("ajustes:deleted", onMutated); } catch {}
      try { bus.off?.("ajustes:modal:updated", onMutated); } catch {}
      try { bus.off?.("ajustes:preferences:mutated", onMutated); } catch {}
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

    try {
      window.addEventListener("ajustes:create:success", onMutated);
      window.addEventListener("ajustes:created", onMutated);
      window.addEventListener("ajustes:update:success", onMutated);
      window.addEventListener("ajustes:updated", onMutated);
      window.addEventListener("ajustes:toggle:success", onMutated);
      window.addEventListener("ajustes:toggled", onMutated);
      window.addEventListener("ajustes:delete:success", onMutated);
      window.addEventListener("ajustes:deleted", onMutated);
      window.addEventListener("ajustes:modal:updated", onMutated);
      window.addEventListener("ajustes:preferences:mutated", onMutated);
    } catch {}

    return () => {
      try {
        window.removeEventListener("ajustes:create:success", onMutated);
        window.removeEventListener("ajustes:created", onMutated);
        window.removeEventListener("ajustes:update:success", onMutated);
        window.removeEventListener("ajustes:updated", onMutated);
        window.removeEventListener("ajustes:toggle:success", onMutated);
        window.removeEventListener("ajustes:toggled", onMutated);
        window.removeEventListener("ajustes:delete:success", onMutated);
        window.removeEventListener("ajustes:deleted", onMutated);
        window.removeEventListener("ajustes:modal:updated", onMutated);
        window.removeEventListener("ajustes:preferences:mutated", onMutated);
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
      return api;
    }

    initialized = true;
    mounted = false;

    inflightInit = (async () => {
      safeLog("init");

      await renderAndLoad({
        force: false,
        asRefresh: false,
        silent: false,
      });

      if (!destroyed) {
        bind();
      }

      safeEmit("ajustes:init:done", {
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

    setState({
      openingSettingId: "",
      openingAjusteId: "",
      savingSettingId: "",
      savingAjusteId: "",
      creating: false,
      saving: false,
      refreshing: false,
      loading: false,
      pageSize: PAGE_SIZE,
    });

    inflightInit = null;
    inflightReload = null;
    inflightOpen = null;
    inflightSave = null;
    inflightToggle = null;
    inflightCreate = null;

    safeEmit("ajustes:destroyed", {
      source: MODULE,
      view: VIEW_NAME,
      version: VERSION,
    });

    safeLog("destroy");

    return true;
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
    return safeArray(pagination.items);
  }

  function getCurrentPagination() {
    return getPaginationMeta(getItems());
  }

  function getCurrentAjuste(settingId = "") {
    const id = safeText(settingId, "");
    return findAjusteById(getItems(), id);
  }

  function getCurrentAjusteByKey(key = "") {
    const finalKey = safeText(key, "");
    return findAjusteByKey(getItems(), finalKey);
  }

  function getPublicStateSnapshot() {
    return {
      initialized,
      mounted,
      destroyed,

      loading: Boolean(ajustesState.loading),
      refreshing: Boolean(ajustesState.refreshing),
      saving: Boolean(ajustesState.saving),
      creating: Boolean(ajustesState.creating),
      hydrated: Boolean(ajustesState.hydrated),
      loaded: Boolean(ajustesState.loaded),

      page: safeNumber(ajustesState.page, 1),
      pageSize: PAGE_SIZE,

      error: safeText(ajustesState.error, ""),
      lastSyncAt: safeText(ajustesState.lastSyncAt, ""),

      openingSettingId: safeText(ajustesState.openingSettingId, ""),
      openingAjusteId: safeText(ajustesState.openingAjusteId, ""),
      savingSettingId: safeText(ajustesState.savingSettingId, ""),
      savingAjusteId: safeText(ajustesState.savingAjusteId, ""),

      count: getItems().length,

      hasInflightInit: Boolean(inflightInit),
      hasInflightReload: Boolean(inflightReload),
      hasInflightOpen: Boolean(inflightOpen),
      hasInflightSave: Boolean(inflightSave),
      hasInflightToggle: Boolean(inflightToggle),
      hasInflightCreate: Boolean(inflightCreate),
    };
  }

  function getState() {
    return {
      ...ajustesState,
      ...getPublicStateSnapshot(),
      items: getItems(),
      pageItems: getCurrentPageItems(),
      pagination: getCurrentPagination(),
      lastRenderedHtml,
    };
  }

  function mount() {
    return init();
  }

  function bootstrap() {
    return init();
  }

  function refreshAjustes() {
    return reload({
      force: true,
      asRefresh: true,
      silent: false,
    });
  }

  function registerPublicBridge() {
    try {
      if (!AppCore.modules || typeof AppCore.modules !== "object") {
        AppCore.modules = {};
      }

      AppCore.modules.AjustesView = api;
      AppCore.modules.Ajustes = api;
      AppCore.modules.OnionAjustesView = api;
    } catch {}

    try {
      if (isBrowser()) {
        window.AjustesView = api;
        window.OnionAjustesView = api;

        window.OnionAjustes = {
          ...(window.OnionAjustes && typeof window.OnionAjustes === "object"
            ? window.OnionAjustes
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
    source: "views:ajustes:ajustesView",

    init,
    mount,
    bootstrap,

    render: rerender,
    rerender,
    reload,
    refresh: refreshAjustes,
    refreshAjustes,

    destroy,
    unmount,
    dispose,

    openAjuste: handleOpenAjuste,
    openSetting: handleOpenAjuste,

    copyAjusteId: handleCopyAjusteId,
    copySettingId: handleCopyAjusteId,
    copyAjusteKey: handleCopyAjusteKey,
    copySettingKey: handleCopyAjusteKey,

    exportCsv: handleExportCsv,
    createAjuste: handleCreateAjuste,
    createSetting: handleCreateAjuste,

    save: handleSaveAjustes,
    saveAjustes: handleSaveAjustes,

    toggleAjuste: handleToggleAjuste,
    toggleSetting: handleToggleAjuste,

    goToPage,
    goPrevPage,
    goNextPage,
    changePageSize,

    getItems: getCurrentItems,
    getPageItems: getCurrentPageItems,
    getPagination: getCurrentPagination,
    getAjusteById: getCurrentAjuste,
    getSettingById: getCurrentAjuste,
    getAjusteByKey: getCurrentAjusteByKey,
    getSettingByKey: getCurrentAjusteByKey,

    getState,
    getPublicStateSnapshot,

    isInitialized: () => Boolean(initialized),
    isMounted: () => Boolean(mounted),
    isDestroyed: () => Boolean(destroyed),

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

export default AjustesView;

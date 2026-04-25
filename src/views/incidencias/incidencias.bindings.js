/* =========================================================
   Onion SPA - Incidencias Bindings
   Archivo: src/views/incidencias/incidencias.bindings.js

   CLIENT EXPERIENCE PRO · DOM BINDINGS · 10/10

   Responsabilidades:
   - bind DOM robusto por delegación
   - refresh / retry
   - export CSV
   - open ticket modal
   - copy id
   - rebind limpio tras rerender
   - cleanup sólido por scope
   - compatibilidad con actions antiguas y nuevas

   FIX CRÍTICO:
   - evita doble click handlers
   - soporta botones dinámicos
   - soporta openTicket(ticketId) y openTicket({ ticketId })
   - abre modal si la action solo devuelve el detail
   - refresca listado tras updates del modal
========================================================= */

import { AppCore } from "../../core/index.js";

const DEFAULT_SCOPE = "view:incidencias";

const ACTIONS = {
  refresh: new Set([
    "refresh-incidencias",
    "reload-incidencias",
    "incidencias-refresh",
    "refresh",
    "retry",
  ]),

  export: new Set([
    "export-incidencias",
    "export-incidencias-csv",
    "incidencias-export",
    "export-csv",
  ]),

  open: new Set([
    "open-ticket",
    "open-incidencia",
    "view-ticket",
    "view-incidencia",
    "ticket-open",
    "incidencia-open",
  ]),

  copy: new Set([
    "copy-ticket-id",
    "copy-incidencia-id",
    "copy-ticket",
    "copy-incidencia",
  ]),
};

const ROW_SELECTOR = [
  "[data-ticket-row]",
  "[data-incidencia-row]",
  "[data-ticket-id][data-row]",
  "[data-ticket-id][role='row']",
  "tr[data-ticket-id]",
  "article[data-ticket-id]",
].join(",");

const INTERACTIVE_SELECTOR = [
  "button",
  "a",
  "input",
  "select",
  "textarea",
  "label",
  "summary",
  "[role='button']",
  "[data-action]",
  "[data-spa]",
  "[data-no-row-open]",
].join(",");

const fallbackCleanups = new Map();
const busyKeys = new Set();

let reloadScheduled = false;

/* =========================================================
   SAFE HELPERS
========================================================= */

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value).trim();
  return text || fallback;
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function first(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;

    if (typeof value === "string" && value.trim() === "") {
      continue;
    }

    return value;
  }

  return null;
}

function safeWarn(...args) {
  try {
    AppCore?.utils?.warn?.("[IncidenciasBindings]", ...args);
    return;
  } catch {}

  try {
    console.warn("[IncidenciasBindings]", ...args);
  } catch {}
}

function safeError(...args) {
  try {
    AppCore?.utils?.error?.("[IncidenciasBindings]", ...args);
    return;
  } catch {}

  try {
    console.error("[IncidenciasBindings]", ...args);
  } catch {}
}

function showToast(message = "", type = "info") {
  try {
    if (typeof AppCore?.toast?.[type] === "function") {
      AppCore.toast[type](message);
      return;
    }
  } catch {}

  try {
    AppCore?.toast?.show?.(message, type);
    return;
  } catch {}

  try {
    AppCore?.ui?.toast?.[type]?.(message);
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
    window.dispatchEvent(
      new CustomEvent(eventName, {
        detail: payload,
      })
    );
    emitted = true;
  } catch {}

  return emitted;
}

/* =========================================================
   SCOPE / CLEANUP
========================================================= */

function resolveScopeName(scope = DEFAULT_SCOPE) {
  return safeText(scope, DEFAULT_SCOPE);
}

function addFallbackCleanup(scopeName = DEFAULT_SCOPE, cleanup) {
  const finalScope = resolveScopeName(scopeName);

  if (typeof cleanup !== "function") return;

  if (!fallbackCleanups.has(finalScope)) {
    fallbackCleanups.set(finalScope, new Set());
  }

  fallbackCleanups.get(finalScope).add(cleanup);
}

function runFallbackCleanup(scopeName = DEFAULT_SCOPE) {
  const finalScope = resolveScopeName(scopeName);
  const cleanups = fallbackCleanups.get(finalScope);

  if (!cleanups) return;

  cleanups.forEach((cleanup) => {
    try {
      cleanup();
    } catch {}
  });

  fallbackCleanups.delete(finalScope);
}

function runScopeCleanup(scopeName = DEFAULT_SCOPE) {
  const finalScope = resolveScopeName(scopeName);

  try {
    AppCore?.cleanup?.run?.(finalScope);
  } catch {}

  runFallbackCleanup(finalScope);
}

function getScope(scopeName = DEFAULT_SCOPE) {
  const finalScope = resolveScopeName(scopeName);

  runScopeCleanup(finalScope);

  try {
    return AppCore?.cleanup?.scope?.(finalScope) || finalScope;
  } catch {
    return finalScope;
  }
}

function bindDomEvent({
  scopeName = DEFAULT_SCOPE,
  scopeRef = null,
  target = null,
  eventName = "",
  handler = null,
  options = undefined,
} = {}) {
  if (!target || !eventName || typeof handler !== "function") return false;

  try {
    if (typeof AppCore?.cleanup?.on === "function") {
      AppCore.cleanup.on(scopeRef || scopeName, target, eventName, handler, options);
      return true;
    }
  } catch {}

  try {
    target.addEventListener(eventName, handler, options);
    addFallbackCleanup(scopeName, () => {
      try {
        target.removeEventListener(eventName, handler, options);
      } catch {}
    });
    return true;
  } catch {
    return false;
  }
}

function bindBusEvent({
  scopeName = DEFAULT_SCOPE,
  eventName = "",
  handler = null,
} = {}) {
  if (!eventName || typeof handler !== "function") return false;

  let bound = false;

  try {
    if (typeof AppCore?.events?.on === "function") {
      AppCore.events.on(eventName, handler);
      bound = true;

      addFallbackCleanup(scopeName, () => {
        try {
          AppCore?.events?.off?.(eventName, handler);
        } catch {}
      });
    }
  } catch {}

  if (!bound) {
    const windowHandler = (event) => handler(event);

    try {
      window.addEventListener(eventName, windowHandler);
      bound = true;

      addFallbackCleanup(scopeName, () => {
        try {
          window.removeEventListener(eventName, windowHandler);
        } catch {}
      });
    } catch {}
  }

  return bound;
}

/* =========================================================
   DOM HELPERS
========================================================= */

function getContainer() {
  return (
    AppCore?.dom?.viewContainer ||
    document.getElementById("view-container") ||
    document
  );
}

function isElementInsideRoot(root, element) {
  try {
    if (!root || !element) return false;
    if (root === document) return true;
    return root.contains(element);
  } catch {
    return true;
  }
}

function closestInside(root, target, selector = "") {
  if (!target || !selector || typeof target.closest !== "function") {
    return null;
  }

  const match = target.closest(selector);

  if (!match || !isElementInsideRoot(root, match)) {
    return null;
  }

  return match;
}

function getActionElement(root, target, actionSet) {
  const actionElement = closestInside(root, target, "[data-action]");
  if (!actionElement) return null;

  const action = safeText(actionElement.dataset?.action || "");
  if (!action || !actionSet.has(action)) return null;

  return actionElement;
}

function getDataSource(element) {
  return (
    element?.closest?.(
      [
        "[data-ticket-id]",
        "[data-incidencia-id]",
        "[data-id]",
        "[data-ticket-code]",
      ].join(",")
    ) || element
  );
}

function getTicketId(element) {
  const source = getDataSource(element);

  return safeText(
    first(
      element?.dataset?.ticketId,
      element?.dataset?.incidenciaId,
      element?.dataset?.id,
      element?.getAttribute?.("data-ticket-id"),
      element?.getAttribute?.("data-incidencia-id"),
      element?.getAttribute?.("data-id"),

      source?.dataset?.ticketId,
      source?.dataset?.incidenciaId,
      source?.dataset?.id,
      source?.getAttribute?.("data-ticket-id"),
      source?.getAttribute?.("data-incidencia-id"),
      source?.getAttribute?.("data-id"),

      element?.dataset?.ticketCode,
      element?.getAttribute?.("data-ticket-code"),
      source?.dataset?.ticketCode,
      source?.getAttribute?.("data-ticket-code")
    ),
    ""
  );
}

function getTicketCode(element) {
  const source = getDataSource(element);

  return safeText(
    first(
      element?.dataset?.ticketCode,
      element?.getAttribute?.("data-ticket-code"),
      source?.dataset?.ticketCode,
      source?.getAttribute?.("data-ticket-code"),
      getTicketId(element)
    ),
    ""
  );
}

function shouldOpenRowFromClick(root, event) {
  const target = event?.target;
  if (!target) return null;

  const row = closestInside(root, target, ROW_SELECTOR);
  if (!row) return null;

  const interactive = target.closest?.(INTERACTIVE_SELECTOR);

  if (interactive && row.contains(interactive)) {
    return null;
  }

  return row;
}

function setElementBusy(element, busy = false) {
  if (!element) return;

  try {
    element.setAttribute("aria-busy", busy ? "true" : "false");
  } catch {}

  const tagName = safeText(element.tagName, "").toLowerCase();

  if (["button", "input", "select", "textarea"].includes(tagName)) {
    try {
      element.disabled = Boolean(busy);
    } catch {}
  }
}

async function runBusy(key = "", element = null, task = null) {
  const finalKey = safeText(key, "");

  if (!finalKey || typeof task !== "function") return null;

  if (busyKeys.has(finalKey)) {
    return null;
  }

  busyKeys.add(finalKey);
  setElementBusy(element, true);

  try {
    return await task();
  } finally {
    busyKeys.delete(finalKey);
    setElementBusy(element, false);
  }
}

/* =========================================================
   CALLBACK COMPAT
========================================================= */

async function callFlexibleOpen(openTicket, payload = {}) {
  const ticketId = safeText(payload.ticketId, "");
  if (!ticketId) return null;

  const candidates = [];

  if (typeof openTicket === "function") {
    if (openTicket.length === 0) {
      candidates.push(() => openTicket(payload));
      candidates.push(() => openTicket(ticketId, payload));
    } else {
      candidates.push(() => openTicket(ticketId, payload));
      candidates.push(() => openTicket(payload));
    }
  }

  const globalOpen =
    window?.OnionIncidenciasActions?.openTicket ||
    window?.OnionIncidenciasActions?.getTicketDetail ||
    null;

  if (typeof globalOpen === "function" && globalOpen !== openTicket) {
    candidates.push(() => globalOpen(payload));
    candidates.push(() => globalOpen(ticketId, payload));
  }

  let lastError = null;

  for (const attempt of candidates) {
    try {
      const result = await attempt();

      if (result) {
        return result;
      }
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    throw lastError;
  }

  return null;
}

async function callFlexibleCopy(copyTicketIdAction, payload = {}) {
  const ticketId = safeText(payload.ticketId || payload.ticketCode, "");
  if (!ticketId) return false;

  const candidates = [];

  if (typeof copyTicketIdAction === "function") {
    candidates.push(() => copyTicketIdAction(payload));
    candidates.push(() => copyTicketIdAction(ticketId, payload));
  }

  const globalCopy = window?.OnionIncidenciasActions?.copyTicketId || null;

  if (typeof globalCopy === "function" && globalCopy !== copyTicketIdAction) {
    candidates.push(() => globalCopy(payload));
    candidates.push(() => globalCopy(ticketId, payload));
  }

  let lastError = null;

  for (const attempt of candidates) {
    try {
      const result = await attempt();

      if (result !== null && result !== undefined) {
        return result;
      }
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    throw lastError;
  }

  return false;
}

async function callFlexibleExport(exportIncidenciasCsvAction) {
  const candidates = [];

  if (typeof exportIncidenciasCsvAction === "function") {
    candidates.push(() => exportIncidenciasCsvAction());
    candidates.push(() =>
      exportIncidenciasCsvAction({
        silent: false,
      })
    );
  }

  const globalExport = window?.OnionIncidenciasActions?.exportCsv || null;

  if (typeof globalExport === "function" && globalExport !== exportIncidenciasCsvAction) {
    candidates.push(() => globalExport());
    candidates.push(() =>
      globalExport({
        silent: false,
      })
    );
  }

  let lastError = null;

  for (const attempt of candidates) {
    try {
      const result = await attempt();

      if (result !== null && result !== undefined) {
        return result;
      }
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    throw lastError;
  }

  return false;
}

/* =========================================================
   MODAL BRIDGE
========================================================= */

function pickDetailPayload(response = null) {
  const obj = safeObject(response);

  return (
    obj.detail ||
    obj.ticket ||
    obj.item ||
    obj.data ||
    obj.result ||
    obj.payload ||
    obj.incidencia ||
    obj
  );
}

function openModalBridge(detail = null, ticketId = "") {
  const payload = pickDetailPayload(detail);

  if (!payload || !Object.keys(safeObject(payload)).length) {
    return false;
  }

  try {
    if (typeof window?.OnionIncidenciasModal?.open === "function") {
      window.OnionIncidenciasModal.open(payload);
      return true;
    }
  } catch {}

  try {
    if (typeof window?.renderIncidenciaTicketModal === "function") {
      window.renderIncidenciaTicketModal(payload);
      return true;
    }
  } catch {}

  safeEmit("incidencias:modal:open", {
    ticketId,
    detail: payload,
  });

  return true;
}

/* =========================================================
   RELOAD
========================================================= */

async function safeReload(reload, loadIncidencias, meta = {}) {
  try {
    safeEmit("incidencias:bindings:reload:start", meta);

    if (typeof reload === "function") {
      const result = await reload({
        force: true,
        source: meta.source || "bindings",
      });

      safeEmit("incidencias:bindings:reload:success", {
        ...meta,
        result,
      });

      return result;
    }

    if (typeof loadIncidencias === "function") {
      const result = await loadIncidencias({
        force: true,
      });

      safeEmit("incidencias:bindings:reload:success", {
        ...meta,
        result,
      });

      return result;
    }

    return null;
  } catch (error) {
    safeWarn("reload falló", error);

    safeEmit("incidencias:bindings:reload:error", {
      ...meta,
      error,
    });

    return null;
  }
}

function scheduleReload(reload, loadIncidencias, meta = {}) {
  if (reloadScheduled) return;

  reloadScheduled = true;

  setTimeout(async () => {
    reloadScheduled = false;

    await safeReload(reload, loadIncidencias, {
      source: "scheduled",
      ...meta,
    });
  }, 80);
}

/* =========================================================
   ACTION HANDLERS
========================================================= */

async function handleRefresh({
  element = null,
  reload,
  loadIncidencias,
} = {}) {
  await runBusy("incidencias:refresh", element, async () => {
    await safeReload(reload, loadIncidencias, {
      source: "manual",
    });
  });
}

async function handleExport({
  element = null,
  exportIncidenciasCsvAction,
} = {}) {
  await runBusy("incidencias:export", element, async () => {
    try {
      const ok = await callFlexibleExport(exportIncidenciasCsvAction);

      safeEmit("incidencias:bindings:export", {
        ok: Boolean(ok),
      });
    } catch (error) {
      safeWarn("exportIncidenciasCsvAction falló", error);
      showToast("No se pudo exportar el historial.", "error");
    }
  });
}

async function handleOpenTicket({
  element = null,
  openTicket,
} = {}) {
  const ticketId = getTicketId(element);
  const ticketCode = getTicketCode(element);

  if (!ticketId) {
    safeWarn("open-ticket sin id", {
      element,
    });
    showToast("No se pudo identificar la incidencia.", "error");
    return;
  }

  await runBusy(`incidencias:open:${ticketId}`, element, async () => {
    try {
      safeEmit("incidencias:bindings:open:start", {
        ticketId,
        ticketCode,
      });

      const detail = await callFlexibleOpen(openTicket, {
        ticketId,
        ticketCode,
        preferFresh: true,
        silent: false,
      });

      if (detail) {
        openModalBridge(detail, ticketId);

        safeEmit("incidencias:bindings:open:success", {
          ticketId,
          ticketCode,
          detail,
        });

        return;
      }

      safeWarn("openTicket no devolvió detalle", {
        ticketId,
        ticketCode,
      });

      safeEmit("incidencias:bindings:open:empty", {
        ticketId,
        ticketCode,
      });
    } catch (error) {
      safeWarn("openTicket falló", error);

      safeEmit("incidencias:bindings:open:error", {
        ticketId,
        ticketCode,
        error,
      });

      showToast("No se pudo abrir la incidencia.", "error");
    }
  });
}

async function handleCopyTicket({
  element = null,
  copyTicketIdAction,
} = {}) {
  const ticketId = getTicketId(element);
  const ticketCode = getTicketCode(element);

  if (!ticketId && !ticketCode) {
    safeWarn("copy-ticket-id sin id", {
      element,
    });
    showToast("No hay referencia para copiar.", "error");
    return;
  }

  const finalId = ticketId || ticketCode;

  await runBusy(`incidencias:copy:${finalId}`, element, async () => {
    try {
      await callFlexibleCopy(copyTicketIdAction, {
        ticketId: finalId,
        ticketCode,
      });

      safeEmit("incidencias:bindings:copy", {
        ticketId: finalId,
        ticketCode,
      });
    } catch (error) {
      safeWarn("copyTicketIdAction falló", error);
      showToast("No se pudo copiar la referencia.", "error");
    }
  });
}

/* =========================================================
   MAIN
========================================================= */

export function bindIncidenciasEvents({
  loadIncidencias,
  openTicket,
  copyTicketIdAction,
  exportIncidenciasCsvAction,
  reload,
  scope = DEFAULT_SCOPE,
} = {}) {
  const scopeName = resolveScopeName(scope);
  const scopeRef = getScope(scopeName);
  const root = getContainer();

  if (!root) {
    safeWarn("No se encontró contenedor para bindings.");
    return () => {};
  }

  /* =======================================================
     DIRECT BUTTONS BY ID
     Compatibilidad con templates actuales.
  ======================================================= */

  const refreshBtn = document.getElementById("incidencias-refresh-btn");
  const retryBtn = document.getElementById("incidencias-retry-btn");
  const exportBtn = document.getElementById("incidencias-export-btn");

  if (refreshBtn) {
    bindDomEvent({
      scopeName,
      scopeRef,
      target: refreshBtn,
      eventName: "click",
      handler: async (event) => {
        event.preventDefault();
        event.stopPropagation();

        await handleRefresh({
          element: refreshBtn,
          reload,
          loadIncidencias,
        });
      },
    });
  }

  if (retryBtn) {
    bindDomEvent({
      scopeName,
      scopeRef,
      target: retryBtn,
      eventName: "click",
      handler: async (event) => {
        event.preventDefault();
        event.stopPropagation();

        await handleRefresh({
          element: retryBtn,
          reload,
          loadIncidencias,
        });
      },
    });
  }

  if (exportBtn) {
    bindDomEvent({
      scopeName,
      scopeRef,
      target: exportBtn,
      eventName: "click",
      handler: async (event) => {
        event.preventDefault();
        event.stopPropagation();

        await handleExport({
          element: exportBtn,
          exportIncidenciasCsvAction,
        });
      },
    });
  }

  /* =======================================================
     DELEGATED ACTIONS
     Soporta contenido dinámico tras rerender.
  ======================================================= */

  bindDomEvent({
    scopeName,
    scopeRef,
    target: root,
    eventName: "click",
    handler: async (event) => {
      const target = event.target;

      if (!target) return;

      const refreshAction = getActionElement(root, target, ACTIONS.refresh);

      if (refreshAction) {
        event.preventDefault();
        event.stopPropagation();

        await handleRefresh({
          element: refreshAction,
          reload,
          loadIncidencias,
        });

        return;
      }

      const exportAction = getActionElement(root, target, ACTIONS.export);

      if (exportAction) {
        event.preventDefault();
        event.stopPropagation();

        await handleExport({
          element: exportAction,
          exportIncidenciasCsvAction,
        });

        return;
      }

      const openAction = getActionElement(root, target, ACTIONS.open);

      if (openAction) {
        event.preventDefault();
        event.stopPropagation();

        await handleOpenTicket({
          element: openAction,
          openTicket,
        });

        return;
      }

      const copyAction = getActionElement(root, target, ACTIONS.copy);

      if (copyAction) {
        event.preventDefault();
        event.stopPropagation();

        await handleCopyTicket({
          element: copyAction,
          copyTicketIdAction,
        });

        return;
      }

      const row = shouldOpenRowFromClick(root, event);

      if (row) {
        event.preventDefault();

        await handleOpenTicket({
          element: row,
          openTicket,
        });
      }
    },
  });

  /* =======================================================
     KEYBOARD ACCESSIBILITY FOR ROWS
  ======================================================= */

  bindDomEvent({
    scopeName,
    scopeRef,
    target: root,
    eventName: "keydown",
    handler: async (event) => {
      const key = safeText(event.key, "");

      if (key !== "Enter" && key !== " ") {
        return;
      }

      const target = event.target;
      const row = closestInside(root, target, ROW_SELECTOR);

      if (!row) return;

      const interactive = target?.closest?.(INTERACTIVE_SELECTOR);

      if (interactive && row.contains(interactive)) {
        return;
      }

      event.preventDefault();

      await handleOpenTicket({
        element: row,
        openTicket,
      });
    },
  });

  /* =======================================================
     MODAL / MUTATION EVENTS
     Cuando el modal actualiza, refrescamos tabla/store.
  ======================================================= */

  const refreshAfterMutation = (event) => {
    const payload = event?.detail || event || {};

    scheduleReload(reload, loadIncidencias, {
      source: "mutation-event",
      event,
      payload,
    });
  };

  bindBusEvent({
    scopeName,
    eventName: "incidencias:modal:updated",
    handler: refreshAfterMutation,
  });

  bindBusEvent({
    scopeName,
    eventName: "incidencias:upload:success",
    handler: refreshAfterMutation,
  });

  bindBusEvent({
    scopeName,
    eventName: "incidencias:comment:success",
    handler: refreshAfterMutation,
  });

  bindBusEvent({
    scopeName,
    eventName: "incidencias:reopen:success",
    handler: refreshAfterMutation,
  });

  safeEmit("incidencias:bindings:ready", {
    scope: scopeName,
  });

  /* =======================================================
     CLEANUP
  ======================================================= */

  return () => {
    runScopeCleanup(scopeName);

    safeEmit("incidencias:bindings:destroyed", {
      scope: scopeName,
    });
  };
}

export default {
  bindIncidenciasEvents,
};

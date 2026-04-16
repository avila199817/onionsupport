/* =========================================================
   Onion SPA - Usuarios View
   Archivo: src/views/usuarios/usuarios.view.js

   SISTEMA ALINEADO 100% CON INCIDENCIAS
   - render por bloques: header + tabla
   - init/render/reload/destroy/reset robustos
   - carga inicial + refresh con loader de tabla
   - dedupe de requests en vuelo
   - cleanup de bindings sin duplicados
   - repaint reactivo ante cambios del módulo
   - bridge seguro entre actions / api / view
========================================================= */

import { AppCore } from "../../core/index.js";

import { bindUsuariosView } from "./usuarios.bindings.js";
import {
  renderHeader,
  renderTable,
} from "./usuarios.template.js";

import {
  getUsuariosSnapshot,
  getUsuariosStatus,
  readUsuariosRows,
  markUsuariosMounted,
  patchUsuariosUi,
  resetUsuariosStore,
  isUsuariosReady,
  readUsuariosUi,
} from "./usuarios.store.js";

import {
  hydrateUsuarios,
  refreshUsuariosList,
} from "./usuarios.actions.js";

const VIEW_NAME = "usuarios";
const SCOPE = "view:usuarios";

const REACTIVE_EVENTS = [
  "usuarios:list:loaded",
  "usuarios:action:hydrate:start",
  "usuarios:action:hydrate:success",
  "usuarios:action:hydrate:error",
  "usuarios:action:refresh:start",
  "usuarios:action:refresh:success",
  "usuarios:action:refresh:error",
  "usuarios:action:search",
  "usuarios:action:filter:role",
  "usuarios:action:filter:status",
  "usuarios:action:sort",
  "usuarios:action:page",
  "usuarios:action:page-size",
  "usuarios:action:filters:reset",
  "usuarios:action:select-user",
  "usuarios:action:clear-selection",
];

let initialized = false;
let destroyed = false;
let inflightLoad = null;
let bindingsCleanup = null;
let reactiveCleanup = null;
let renderToken = 0;
let lastRenderContext = {};

/* =========================================================
   BASICS
========================================================= */

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function safeBoolean(value, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function safeText(value = "", fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }

  const text = String(value).trim();
  return text || fallback;
}

function clone(value) {
  if (value === null || value === undefined) {
    return value ?? null;
  }

  try {
    if (typeof structuredClone === "function") {
      return structuredClone(value);
    }
  } catch {}

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

function safeEmit(eventName = "", payload = {}) {
  try {
    AppCore?.events?.emit?.(eventName, payload);
  } catch {}
}

function safeWarn(...args) {
  try {
    AppCore?.utils?.warn?.("[UsuariosView]", ...args);
  } catch {
    try {
      console.warn("[UsuariosView]", ...args);
    } catch {}
  }
}

function notifySuccess(message = "Operación completada") {
  try {
    AppCore?.toast?.success?.(message);
    return;
  } catch {}

  try {
    AppCore?.modules?.Toast?.success?.(message);
  } catch {}
}

function notifyError(message = "No se pudo completar la operación") {
  try {
    AppCore?.toast?.error?.(message);
    return;
  } catch {}

  try {
    AppCore?.modules?.Toast?.error?.(message);
  } catch {}
}

function getContainer() {
  if (typeof document === "undefined") {
    return null;
  }

  return (
    AppCore?.dom?.viewContainer ||
    document.getElementById("view-container") ||
    null
  );
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

function cleanupReactiveSubscriptions() {
  try {
    reactiveCleanup?.();
  } catch {}

  reactiveCleanup = null;
}

function cleanupAll() {
  cleanupBindings();
  cleanupReactiveSubscriptions();
}

/* =========================================================
   TEMPLATE STATE
========================================================= */

function getTemplateState({
  forceLoading = false,
  refreshing = false,
  error = null,
} = {}) {
  const snapshot = getUsuariosSnapshot();
  const status = getUsuariosStatus();

  return {
    ...snapshot,
    loading:
      forceLoading === true
        ? true
        : status.loading === true,
    refreshing:
      refreshing === true
        ? true
        : snapshot?.refreshing === true,
    loaded: status.loaded === true,
    source: status.source || snapshot.source || "idle",
    degraded:
      status.degraded === true || snapshot.degraded === true,
    error:
      error || snapshot.error || status.error || null,
    remoteCount:
      snapshot?.meta?.total ||
      snapshot?.stats?.total ||
      0,
  };
}

/* =========================================================
   DOM BIND
========================================================= */

function bindDom(root) {
  cleanupBindings();

  try {
    bindingsCleanup = bindUsuariosView({
      container: root,
    });
  } catch (error) {
    safeWarn("bind error", error);
    bindingsCleanup = null;
  }
}

/* =========================================================
   RENDER
========================================================= */

function renderShell({
  forceLoading = false,
  refreshing = false,
  error = null,
} = {}) {
  const container = getContainer();

  if (!container) {
    throw new Error('UsuariosView: no se encontró "#view-container".');
  }

  const users = readUsuariosRows();
  const state = getTemplateState({
    forceLoading,
    refreshing,
    error,
  });

  container.innerHTML = `
    <section
      class="usuarios-view view-shell"
      data-usuarios-view="true"
      data-usuarios-source="${safeText(state.source, "idle")}"
      data-usuarios-degraded="${state.degraded === true ? "true" : "false"}"
    >
      ${renderHeader({
        items: users,
        state,
        user: AppCore?.state?.user || null,
      })}

      ${renderTable({
        items: users,
        state,
      })}
    </section>
  `;

  return container.querySelector('[data-usuarios-view="true"]');
}

function repaint(
  overrides = {},
  options = {}
) {
  if (destroyed) {
    return null;
  }

  const config = safeObject(options);
  const rememberContext = config.rememberContext !== false;

  renderToken += 1;
  const token = renderToken;

  const payload = safeObject(overrides);

  if (rememberContext) {
    lastRenderContext = clone(payload);
  }

  const root = renderShell(payload);

  if (!root || token !== renderToken) {
    return root;
  }

  bindDom(root);

  safeEmit("usuarios:view:rendered", {
    token,
    status: getUsuariosStatus(),
  });

  return root;
}

/* =========================================================
   REACTIVE BRIDGE
========================================================= */

function safeSubscribe(eventName = "", handler = null) {
  const events = AppCore?.events;

  if (!events || typeof handler !== "function" || !safeText(eventName, "")) {
    return () => {};
  }

  try {
    if (typeof events.on === "function") {
      const maybeDisposer = events.on(eventName, handler);

      if (typeof maybeDisposer === "function") {
        return maybeDisposer;
      }
    }
  } catch (error) {
    safeWarn("subscribe error", eventName, error);
  }

  return () => {
    try {
      if (typeof events.off === "function") {
        events.off(eventName, handler);
        return;
      }
    } catch {}

    try {
      if (typeof events.removeListener === "function") {
        events.removeListener(eventName, handler);
        return;
      }
    } catch {}

    try {
      if (typeof events.unsubscribe === "function") {
        events.unsubscribe(eventName, handler);
      }
    } catch {}
  };
}

function setupReactiveBridge() {
  cleanupReactiveSubscriptions();

  const unsubscribers = [];

  const handleModuleEvent = (eventName, payload = {}) => {
    if (destroyed) {
      return;
    }

    const currentStatus = getUsuariosStatus();
    const currentContext = safeObject(lastRenderContext);

    if (eventName === "usuarios:action:hydrate:start") {
      repaint(
        {
          ...currentContext,
          forceLoading: isUsuariosReady() !== true,
          refreshing: isUsuariosReady() === true,
          error: null,
        },
        {
          rememberContext: false,
        }
      );
      return;
    }

    if (eventName === "usuarios:action:refresh:start") {
      repaint(
        {
          ...currentContext,
          refreshing: true,
          error: null,
        },
        {
          rememberContext: false,
        }
      );
      return;
    }

    if (
      eventName === "usuarios:action:hydrate:error" ||
      eventName === "usuarios:action:refresh:error"
    ) {
      repaint(
        {
          ...currentContext,
          refreshing: false,
          forceLoading: false,
          error:
            payload?.error?.message ||
            currentStatus?.error?.message ||
            currentStatus?.error ||
            "No se pudo cargar el listado de usuarios.",
        },
        {
          rememberContext: false,
        }
      );
      return;
    }

    if (
      eventName === "usuarios:list:loaded" ||
      eventName === "usuarios:action:hydrate:success" ||
      eventName === "usuarios:action:refresh:success" ||
      eventName === "usuarios:action:select-user" ||
      eventName === "usuarios:action:clear-selection"
    ) {
      repaint(
        {
          ...currentContext,
          forceLoading: false,
          refreshing: false,
          error: null,
        },
        {
          rememberContext: false,
        }
      );
      return;
    }

    if (
      eventName === "usuarios:action:search" ||
      eventName === "usuarios:action:filter:role" ||
      eventName === "usuarios:action:filter:status" ||
      eventName === "usuarios:action:sort" ||
      eventName === "usuarios:action:page" ||
      eventName === "usuarios:action:page-size" ||
      eventName === "usuarios:action:filters:reset"
    ) {
      repaint(
        {
          ...currentContext,
          refreshing: true,
          error: null,
        },
        {
          rememberContext: false,
        }
      );
    }
  };

  REACTIVE_EVENTS.forEach((eventName) => {
    const handler = (payload = {}) =>
      handleModuleEvent(eventName, payload);

    unsubscribers.push(
      safeSubscribe(eventName, handler)
    );
  });

  reactiveCleanup = () => {
    while (unsubscribers.length) {
      const unsubscribe = unsubscribers.pop();

      try {
        unsubscribe?.();
      } catch {}
    }
  };
}

/* =========================================================
   LOAD FLOW
========================================================= */

async function ensureLoaded(options = {}) {
  if (inflightLoad) {
    return inflightLoad;
  }

  const config = safeObject(options);

  inflightLoad = (async () => {
    try {
      if (config.showTableRefresh === true) {
        repaint(
          {
            ...safeObject(lastRenderContext),
            refreshing: true,
            error: null,
          },
          {
            rememberContext: false,
          }
        );
      }

      const params = safeObject(config.params || config.query);

      const result = config.force === true
        ? await refreshUsuariosList({ params })
        : await hydrateUsuarios({
            force: false,
            preferCache: config.preferCache !== false,
            params,
          });

      if (!destroyed) {
        repaint(
          {
            ...safeObject(lastRenderContext),
            forceLoading: false,
            refreshing: false,
            error:
              result?.ok === false
                ? safeText(
                    result?.error?.message || result?.error,
                    ""
                  ) || null
                : null,
          },
          {
            rememberContext: false,
          }
        );
      }

      if (config.silent !== true) {
        safeEmit("usuarios:view:data:loaded", {
          view: VIEW_NAME,
          result,
          status: getUsuariosStatus(),
        });
      }

      return result;
    } catch (error) {
      safeWarn("ensureLoaded error", error);

      if (!destroyed) {
        repaint(
          {
            ...safeObject(lastRenderContext),
            forceLoading: false,
            refreshing: false,
            error:
              error?.message ||
              "No se pudo cargar el listado de usuarios.",
          },
          {
            rememberContext: false,
          }
        );
      }

      if (config.notifyOnError === true) {
        notifyError(
          safeText(
            error?.message,
            "No se pudo cargar el listado de usuarios."
          )
        );
      }

      safeEmit("usuarios:view:data:error", {
        view: VIEW_NAME,
        error,
      });

      return {
        ok: false,
        error,
      };
    } finally {
      inflightLoad = null;
    }
  })();

  return inflightLoad;
}

/* =========================================================
   PUBLIC API
========================================================= */

export async function init(options = {}) {
  const context = safeObject(options);

  destroyed = false;

  setupReactiveBridge();

  patchUsuariosUi({
    mounted: true,
    lastAction: "init",
  });

  markUsuariosMounted(true);

  repaint(
    {
      forceLoading: true,
      refreshing: false,
      error: null,
    },
    {
      rememberContext: false,
    }
  );

  lastRenderContext = clone(context);

  const result = await ensureLoaded({
    force: context.force === true,
    preferCache: context.preferCache !== false,
    silent: false,
    notifyOnError: false,
    params: safeObject(context.params || context.query),
    showTableRefresh: false,
  });

  initialized = true;

  return {
    ok: result?.ok !== false,
    view: VIEW_NAME,
    status: getUsuariosStatus(),
    state: getUsuariosSnapshot(),
    ui: readUsuariosUi(),
    result,
  };
}

export async function render(options = {}) {
  const context = safeObject(options);

  destroyed = false;

  setupReactiveBridge();

  patchUsuariosUi({
    mounted: true,
    lastAction: "render",
  });

  markUsuariosMounted(true);

  lastRenderContext = clone(context);

  repaint({
    ...context,
    forceLoading: false,
    refreshing: false,
    error: null,
  });

  let result = null;

  if (context.load !== false && !isUsuariosReady()) {
    result = await ensureLoaded({
      force: context.force === true,
      preferCache: context.preferCache !== false,
      silent: false,
      notifyOnError: false,
      params: safeObject(context.params || context.query),
      showTableRefresh: false,
    });
  }

  initialized = true;

  return {
    ok: true,
    view: VIEW_NAME,
    status: getUsuariosStatus(),
    state: getUsuariosSnapshot(),
    ui: readUsuariosUi(),
    result,
  };
}

export async function reload(options = {}) {
  const context = safeObject(options);

  patchUsuariosUi({
    lastAction: "reload",
  });

  const result = await ensureLoaded({
    force: true,
    preferCache: false,
    silent: safeBoolean(context.silent, false),
    notifyOnError: true,
    params: safeObject(context.params || context.query),
    showTableRefresh: true,
  });

  if (result?.ok === true) {
    notifySuccess("Listado de usuarios actualizado.");
  }

  return {
    ok: result?.ok !== false,
    view: VIEW_NAME,
    status: getUsuariosStatus(),
    state: getUsuariosSnapshot(),
    ui: readUsuariosUi(),
    result,
  };
}

export function destroy() {
  destroyed = true;

  cleanupAll();

  markUsuariosMounted(false);

  patchUsuariosUi({
    mounted: false,
    lastAction: "destroy",
  });

  safeEmit("usuarios:view:destroyed", {
    view: VIEW_NAME,
    initialized,
  });

  return true;
}

export function reset() {
  destroy();
  resetUsuariosStore();
  initialized = false;
  lastRenderContext = {};

  safeEmit("usuarios:view:reset", {
    view: VIEW_NAME,
  });

  return true;
}

export function getState() {
  return getUsuariosSnapshot();
}

export function getStatus() {
  return getUsuariosStatus();
}

export function getElement() {
  const container = getContainer();

  return (
    container?.querySelector?.('[data-usuarios-view="true"]') || null
  );
}

export const UsuariosView = {
  init,
  render,
  reload,
  destroy,
  reset,
  getState,
  getStatus,
  getElement,
};

export default UsuariosView;

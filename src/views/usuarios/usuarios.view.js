/* =========================================================
   Onion SPA - Usuarios View
   Archivo: src/views/usuarios/usuarios.view.js

   FINAL PRO SYSTEM · ADMIN USERS VIEW · 10/10

   Responsabilidades:
   - orquestar el ciclo de vida completo de la vista Usuarios
   - montar y renderizar la vista sobre el contenedor SPA
   - disparar carga inicial del listado
   - repintar la UI con estado real del módulo
   - enlazar bindings desacoplados sin listeners duplicados
   - exponer init / render / reload / destroy / reset seguros
   - mantener compatibilidad con router legacy y moderna
   - evitar que el loading shell contamine el contexto real de render
========================================================= */

import { AppCore } from "../../core/index.js";

import getUsuariosTemplate from "./usuarios.template.js";
import { bindUsuariosView } from "./usuarios.bindings.js";

import {
  getUsuariosSnapshot,
  getUsuariosStatus,
  readUsuariosRows,
  readUsuariosMeta,
  readUsuariosStats,
  readUsuariosAlerts,
  readUsuariosParams,
  readUsuariosUi,
  markUsuariosMounted,
  patchUsuariosUi,
  resetUsuariosStore,
  isUsuariosReady,
} from "./usuarios.store.js";

import {
  hydrateUsuarios,
  refreshUsuariosList,
} from "./usuarios.actions.js";

/* =========================================================
   CONSTANTS
========================================================= */

const VIEW_NAME = "usuarios";
const VIEW_SELECTOR =
  '[data-usuarios-view="true"]';
const VIEW_CONTAINER_SELECTOR =
  "#view-container";

/* =========================================================
   INTERNAL STATE
========================================================= */

let rootElement = null;
let viewContainer = null;
let currentCleanup = null;
let destroyed = false;
let renderToken = 0;
let lastRenderContext = {};
let loadInFlight = null;

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function safeObject(value) {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value
    : {};
}

function safeText(
  value = "",
  fallback = ""
) {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const text = String(value).trim();
  return text || fallback;
}

function safeBool(
  value,
  fallback = false
) {
  return typeof value === "boolean"
    ? value
    : fallback;
}

function clone(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return value ?? null;
  }

  try {
    if (
      typeof structuredClone ===
      "function"
    ) {
      return structuredClone(value);
    }
  } catch {}

  try {
    return JSON.parse(
      JSON.stringify(value)
    );
  } catch {
    return value;
  }
}

function safeWarn(...args) {
  try {
    AppCore?.utils?.warn?.(...args);
  } catch {
    console.warn(...args);
  }
}

function safeError(...args) {
  try {
    AppCore?.utils?.error?.(...args);
  } catch {
    console.error(...args);
  }
}

function safeEmit(
  eventName,
  payload = {}
) {
  try {
    AppCore?.events?.emit?.(
      eventName,
      payload
    );
  } catch {}
}

function notifySuccess(
  message = "Actualizado"
) {
  try {
    AppCore?.modules?.Toast?.success?.(
      message
    );
    return;
  } catch {}

  try {
    AppCore?.toast?.success?.(
      message
    );
  } catch {}
}

function notifyError(
  message = "Se produjo un error."
) {
  try {
    AppCore?.modules?.Toast?.error?.(
      message
    );
    return;
  } catch {}

  try {
    AppCore?.toast?.error?.(
      message
    );
  } catch {}
}

function getCurrentUser() {
  return AppCore?.state?.user || null;
}

function getUsuariosData() {
  return {
    rows: readUsuariosRows(),
    meta: readUsuariosMeta(),
    stats: readUsuariosStats(),
    alerts: readUsuariosAlerts(),
    params: readUsuariosParams(),
  };
}

/* =========================================================
   DOM HELPERS
========================================================= */

function getContainer() {
  if (!isBrowser()) {
    return null;
  }

  const cached =
    viewContainer &&
    document.contains(
      viewContainer
    )
      ? viewContainer
      : null;

  if (cached) {
    return cached;
  }

  const found =
    document.querySelector(
      VIEW_CONTAINER_SELECTOR
    );

  viewContainer = found || null;
  return viewContainer;
}

function resolveRootElement() {
  const container =
    getContainer();

  if (!container) {
    return null;
  }

  const existing =
    container.querySelector(
      VIEW_SELECTOR
    );

  return existing || null;
}

function setDocumentTitle() {
  if (!isBrowser()) {
    return;
  }

  try {
    const routeTitle =
      AppCore?.state?.routeMeta
        ?.title ||
      AppCore?.state
        ?.routeTitle ||
      "Usuarios · Onion Support";

    document.title = String(
      routeTitle ||
        "Usuarios · Onion Support"
    );
  } catch (error) {
    safeWarn(
      "[UsuariosView] document title warning",
      error
    );
  }
}

function cleanupBindings() {
  if (
    typeof currentCleanup ===
    "function"
  ) {
    try {
      currentCleanup();
    } catch (error) {
      safeError(
        "[UsuariosView] cleanup error",
        error
      );
    }
  }

  currentCleanup = null;
}

function bindDom() {
  const container =
    getContainer();

  if (!container) {
    return false;
  }

  cleanupBindings();

  try {
    currentCleanup =
      bindUsuariosView({
        container,
      }) || null;

    return true;
  } catch (error) {
    safeError(
      "[UsuariosView] bind error",
      error
    );
    currentCleanup = null;
    return false;
  }
}

/* =========================================================
   STATE -> VIEW
========================================================= */

function ensureViewMountedFlag(
  value = true
) {
  try {
    markUsuariosMounted(
      value === true
    );
  } catch {}
}

function getRenderPayload(
  overrides = {}
) {
  const snapshot =
    getUsuariosSnapshot();

  return {
    usuarios: snapshot,
    data: getUsuariosData(),
    user: getCurrentUser(),
    ...safeObject(overrides),
  };
}

function syncDatasetFromState() {
  if (!rootElement) {
    return;
  }

  try {
    const status =
      getUsuariosStatus();

    rootElement.dataset.usuariosReady =
      isUsuariosReady() === true
        ? "true"
        : "false";

    rootElement.dataset.usuariosLoading =
      status.loading === true
        ? "true"
        : "false";

    rootElement.dataset.usuariosLoaded =
      status.loaded === true
        ? "true"
        : "false";

    rootElement.dataset.usuariosSource =
      safeText(
        status.source,
        "idle"
      );

    rootElement.dataset.usuariosCacheHit =
      status.cacheHit === true
        ? "true"
        : "false";

    rootElement.dataset.usuariosDegraded =
      status.degraded === true
        ? "true"
        : "false";
  } catch {}
}

/* =========================================================
   RENDER
========================================================= */

function renderIntoContainer(
  payload = {}
) {
  const container =
    getContainer();

  if (!container) {
    throw new Error(
      'UsuariosView: no se encontró "#view-container".'
    );
  }

  container.innerHTML =
    getUsuariosTemplate(payload);

  rootElement =
    resolveRootElement();

  if (!rootElement) {
    throw new Error(
      "UsuariosView: no se pudo resolver el root de la vista."
    );
  }

  setDocumentTitle();
  syncDatasetFromState();
  bindDom();

  return rootElement;
}

function repaint(
  overrides = {},
  options = {}
) {
  if (destroyed === true) {
    return null;
  }

  const config =
    safeObject(options);

  const rememberContext =
    config.rememberContext !== false;

  renderToken += 1;

  const payload =
    getRenderPayload(overrides);

  if (rememberContext) {
    lastRenderContext =
      clone(overrides);
  }

  const mounted =
    renderIntoContainer(payload);

  safeEmit(
    "usuarios:view:rendered",
    {
      view: VIEW_NAME,
      token: renderToken,
      status:
        getUsuariosStatus(),
    }
  );

  return mounted;
}

function renderLoadingShell(
  overrides = {}
) {
  return repaint(
    {
      ...safeObject(overrides),
      usuarios: {
        ...getUsuariosSnapshot(),
        loading: true,
        loaded: false,
        error: null,
      },
    },
    {
      rememberContext: false,
    }
  );
}

/* =========================================================
   LOAD FLOW
========================================================= */

async function ensureUsuariosLoaded(
  options = {}
) {
  const {
    force = false,
    preferCache = true,
    silent = false,
    notifyOnError = false,
  } = safeObject(options);

  if (loadInFlight) {
    return loadInFlight;
  }

  loadInFlight =
    (async () => {
      try {
        const requestParams =
          safeObject(
            options.params ||
              options.query
          );

        const result =
          force === true
            ? await refreshUsuariosList({
                params:
                  requestParams,
              })
            : await hydrateUsuarios({
                force: false,
                preferCache:
                  preferCache !==
                  false,
                params:
                  requestParams,
              });

        if (
          destroyed !== true
        ) {
          repaint(
            lastRenderContext
          );
        }

        if (
          silent !== true
        ) {
          safeEmit(
            "usuarios:view:data:loaded",
            {
              view: VIEW_NAME,
              result,
              status:
                getUsuariosStatus(),
            }
          );
        }

        return result;
      } catch (error) {
        safeError(
          "[UsuariosView] ensureUsuariosLoaded error",
          error
        );

        if (
          destroyed !== true
        ) {
          repaint(
            lastRenderContext
          );
        }

        if (
          notifyOnError === true
        ) {
          notifyError(
            safeText(
              error?.message,
              "No se pudo cargar el listado de usuarios."
            )
          );
        }

        safeEmit(
          "usuarios:view:data:error",
          {
            view: VIEW_NAME,
            error,
          }
        );

        return {
          ok: false,
          error,
        };
      } finally {
        loadInFlight = null;
      }
    })();

  return loadInFlight;
}

/* =========================================================
   PUBLIC API
========================================================= */

export async function init(
  options = {}
) {
  destroyed = false;

  const context =
    safeObject(options);

  lastRenderContext =
    clone(context);

  patchUsuariosUi({
    mounted: false,
    lastAction: "init",
  });

  renderLoadingShell(context);
  ensureViewMountedFlag(true);

  safeEmit(
    "usuarios:view:init",
    {
      view: VIEW_NAME,
    }
  );

  const result =
    await ensureUsuariosLoaded({
      force:
        context.force === true,
      preferCache:
        context.preferCache !==
        false,
      silent: false,
      notifyOnError: false,
      params:
        safeObject(
          context.params ||
            context.query
        ),
    });

  return {
    ok:
      result?.ok !== false,
    view: VIEW_NAME,
    element: rootElement,
    status: getUsuariosStatus(),
    data: getUsuariosData(),
    ui: readUsuariosUi(),
    result,
  };
}

export async function render(
  options = {}
) {
  destroyed = false;

  const context =
    safeObject(options);

  lastRenderContext =
    clone(context);

  patchUsuariosUi({
    mounted: false,
    lastAction: "render",
  });

  repaint(context);
  ensureViewMountedFlag(true);

  let result = null;

  if (
    context.load !== false &&
    isUsuariosReady() !== true
  ) {
    result =
      await ensureUsuariosLoaded({
        force:
          context.force === true,
        preferCache:
          context.preferCache !==
          false,
        silent: false,
        notifyOnError: false,
        params:
          safeObject(
            context.params ||
              context.query
          ),
      });
  }

  return {
    ok: true,
    view: VIEW_NAME,
    element: rootElement,
    status: getUsuariosStatus(),
    result,
  };
}

export async function reload(
  options = {}
) {
  const context =
    safeObject(options);

  patchUsuariosUi({
    lastAction: "reload",
  });

  const result =
    await ensureUsuariosLoaded({
      force: true,
      preferCache: false,
      silent:
        safeBool(
          context.silent,
          false
        ) === true,
      notifyOnError: true,
      params:
        safeObject(
          context.params ||
            context.query
        ),
    });

  if (result?.ok === true) {
    notifySuccess(
      "Listado de usuarios actualizado."
    );
  }

  return {
    ok:
      result?.ok !== false,
    view: VIEW_NAME,
    element: rootElement,
    status: getUsuariosStatus(),
    result,
  };
}

export function destroy() {
  destroyed = true;

  cleanupBindings();

  try {
    patchUsuariosUi({
      mounted: false,
      lastAction: "destroy",
    });
  } catch {}

  ensureViewMountedFlag(false);

  rootElement = null;
  viewContainer = null;
  loadInFlight = null;

  safeEmit(
    "usuarios:view:destroyed",
    {
      view: VIEW_NAME,
    }
  );

  return true;
}

export function reset() {
  destroy();
  resetUsuariosStore();

  safeEmit(
    "usuarios:view:reset",
    {
      view: VIEW_NAME,
    }
  );

  return true;
}

export function getState() {
  return getUsuariosSnapshot();
}

export function getStatus() {
  return getUsuariosStatus();
}

export function getElement() {
  return (
    rootElement ||
    resolveRootElement()
  );
}

/* =========================================================
   EXPORT OBJECT
========================================================= */

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

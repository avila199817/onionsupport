/* =========================================================
   Onion SPA - Home View
   Archivo: src/views/home/home.view.js

   FINAL PRO SYSTEM · VIEW ORCHESTRATOR · 10/10

   Responsabilidades:
   - orquestar el ciclo de vida completo de la vista Home
   - montar y renderizar la Home sobre el contenedor SPA
   - disparar carga inicial del summary
   - repintar la UI con estado real del módulo
   - enlazar bindings desacoplados sin listeners duplicados
   - exponer init / render / reload / destroy / reset seguros
   - mantener compatibilidad con router legacy y moderna
========================================================= */

import { AppCore } from "../../core/index.js";

import { HomeAPI } from "./home.api.js";
import getHomeTemplate from "./home.template.js";
import { bindHomeView } from "./home.bindings.js";

import {
  getHomeSnapshot,
  getHomeStatus,
  readHomeSummary,
  readHomeUi,
  markHomeMounted,
  patchHomeUi,
  resetHomeStore,
  isHomeReady,
} from "./home.store.js";

/* =========================================================
   CONSTANTS
========================================================= */

const VIEW_NAME = "home";
const VIEW_SELECTOR =
  '[data-home-view="true"]';
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

function safeLog(...args) {
  try {
    AppCore?.utils?.log?.(...args);
  } catch {}
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
      "Onion Support";

    document.title = String(
      routeTitle || "Onion Support"
    );
  } catch (error) {
    safeWarn(
      "[HomeView] document title warning",
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
        "[HomeView] cleanup error",
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
      bindHomeView({
        container,
      }) || null;

    return true;
  } catch (error) {
    safeError(
      "[HomeView] bind error",
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
    markHomeMounted(value === true);
  } catch {}
}

function getRenderPayload(
  overrides = {}
) {
  const payload = {
    home: getHomeSnapshot(),
    user: getCurrentUser(),
    ...safeObject(overrides),
  };

  return payload;
}

function syncDatasetFromState() {
  if (!rootElement) {
    return;
  }

  try {
    const status =
      getHomeStatus();

    rootElement.dataset.homeReady =
      isHomeReady() === true
        ? "true"
        : "false";

    rootElement.dataset.homeLoading =
      status.loading === true
        ? "true"
        : "false";

    rootElement.dataset.homeLoaded =
      status.loaded === true
        ? "true"
        : "false";

    rootElement.dataset.homeSource =
      safeText(
        status.source,
        "idle"
      );

    rootElement.dataset.homeCacheHit =
      status.cacheHit === true
        ? "true"
        : "false";

    rootElement.dataset.homeDegraded =
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
      'HomeView: no se encontró "#view-container".'
    );
  }

  container.innerHTML =
    getHomeTemplate(payload);

  rootElement =
    resolveRootElement();

  if (!rootElement) {
    throw new Error(
      "HomeView: no se pudo resolver el root de la vista."
    );
  }

  setDocumentTitle();
  syncDatasetFromState();
  bindDom();

  return rootElement;
}

function repaint(
  overrides = {}
) {
  if (destroyed === true) {
    return null;
  }

  renderToken += 1;

  const payload =
    getRenderPayload(overrides);

  lastRenderContext =
    clone(overrides);

  const mounted =
    renderIntoContainer(payload);

  safeEmit(
    "home:view:rendered",
    {
      view: VIEW_NAME,
      token: renderToken,
      status: getHomeStatus(),
    }
  );

  return mounted;
}

function renderLoadingShell(
  overrides = {}
) {
  return repaint({
    ...safeObject(overrides),
    home: {
      ...getHomeSnapshot(),
      loading: true,
      loaded: false,
      error: null,
    },
  });
}

/* =========================================================
   LOAD FLOW
========================================================= */

async function ensureHomeLoaded(
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
        const result =
          await HomeAPI.loadHomeSummary({
            force: force === true,
            preferCache:
              preferCache !== false,
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
            "home:view:data:loaded",
            {
              view: VIEW_NAME,
              result,
              status:
                getHomeStatus(),
            }
          );
        }

        return result;
      } catch (error) {
        safeError(
          "[HomeView] ensureHomeLoaded error",
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
              "No se pudo cargar el resumen de inicio."
            )
          );
        }

        safeEmit(
          "home:view:data:error",
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

  patchHomeUi({
    mounted: false,
    activeCard: "",
    lastAction: "init",
  });

  renderLoadingShell(context);
  ensureViewMountedFlag(true);

  safeEmit(
    "home:view:init",
    {
      view: VIEW_NAME,
    }
  );

  const result =
    await ensureHomeLoaded({
      force:
        context.force === true,
      preferCache:
        context.preferCache !==
        false,
      silent: false,
      notifyOnError: false,
    });

  return {
    ok:
      result?.ok !== false,
    view: VIEW_NAME,
    element: rootElement,
    status: getHomeStatus(),
    summary: readHomeSummary(),
    ui: readHomeUi(),
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

  patchHomeUi({
    mounted: false,
    lastAction: "render",
  });

  repaint(context);
  ensureViewMountedFlag(true);

  let result = null;

  if (
    context.load !== false &&
    isHomeReady() !== true
  ) {
    result =
      await ensureHomeLoaded({
        force:
          context.force === true,
        preferCache:
          context.preferCache !==
          false,
        silent: false,
        notifyOnError: false,
      });
  }

  return {
    ok: true,
    view: VIEW_NAME,
    element: rootElement,
    status: getHomeStatus(),
    result,
  };
}

export async function reload(
  options = {}
) {
  const context =
    safeObject(options);

  patchHomeUi({
    lastAction: "reload",
  });

  const result =
    await ensureHomeLoaded({
      force: true,
      preferCache: false,
      silent:
        safeBool(
          context.silent,
          false
        ) === true,
      notifyOnError: true,
    });

  if (result?.ok === true) {
    notifySuccess(
      "Inicio actualizado."
    );
  }

  return {
    ok:
      result?.ok !== false,
    view: VIEW_NAME,
    element: rootElement,
    status: getHomeStatus(),
    result,
  };
}

export function destroy() {
  destroyed = true;

  cleanupBindings();

  try {
    patchHomeUi({
      mounted: false,
      activeCard: "",
      lastAction: "destroy",
    });
  } catch {}

  ensureViewMountedFlag(false);

  rootElement = null;
  viewContainer = null;
  loadInFlight = null;

  safeEmit(
    "home:view:destroyed",
    {
      view: VIEW_NAME,
    }
  );

  return true;
}

export function reset() {
  destroy();
  resetHomeStore();

  safeEmit(
    "home:view:reset",
    {
      view: VIEW_NAME,
    }
  );

  return true;
}

export function getState() {
  return getHomeSnapshot();
}

export function getStatus() {
  return getHomeStatus();
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

export const HomeView = {
  init,
  render,
  reload,
  destroy,
  reset,
  getState,
  getStatus,
  getElement,
};

export default HomeView;

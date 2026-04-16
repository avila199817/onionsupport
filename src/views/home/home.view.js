/* =========================================================
   Onion SPA - Home View
   Archivo: src/views/home/home.view.js

   FINAL PRO SYSTEM · VIEW ORCHESTRATOR · 10/10

   Responsabilidades:
   - orquestar el ciclo de vida completo de la vista Home
   - montar y renderizar la Home sobre el contenedor SPA
   - disparar carga inicial del summary
   - repintar la UI con estado real del módulo
   - bindear acciones rápidas y refresh sin duplicar listeners
   - exponer init / render / reload / destroy seguros
   - mantener compatibilidad con router legacy y moderna
========================================================= */

import { AppCore } from "../../core/index.js";
import { HomeAPI } from "./home.api.js";
import {
  HomeStore,
  getHomeSnapshot,
  getHomeStatus,
  readHomeSummary,
  readHomeUi,
  markHomeMounted,
  setHomeAction,
  setHomeSelectedCard,
  patchHomeUi,
  resetHomeStore,
  isHomeReady,
} from "./home.store.js";
import getHomeTemplate from "./home.template.js";

/* =========================================================
   CONSTANTS
========================================================= */

const VIEW_NAME = "home";
const VIEW_SELECTOR = '[data-home-view="true"]';
const VIEW_CONTAINER_SELECTOR =
  "#view-container";

/* =========================================================
   INTERNAL STATE
========================================================= */

let rootElement = null;
let viewContainer = null;
let bound = false;
let destroyed = false;
let renderToken = 0;
let lastRenderContext = {};
let refreshInFlight = null;

/* =========================================================
   BASICS
========================================================= */

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

function getCurrentUser() {
  return AppCore?.state?.user || null;
}

function getRouter() {
  return AppCore?.modules?.Router ||
    AppCore?.Router ||
    null;
}

function getContainer() {
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
  const snapshot =
    getHomeSnapshot();

  const payload = {
    home: snapshot,
    user: getCurrentUser(),
    ...safeObject(overrides),
  };

  return payload;
}

function safeNavigate(
  href = "#",
  options = {}
) {
  const target = safeText(
    href,
    "#"
  );

  if (
    !target ||
    target === "#"
  ) {
    return false;
  }

  const router =
    getRouter();

  if (
    router &&
    typeof router.navigate ===
      "function"
  ) {
    router.navigate(target, {
      ...safeObject(options),
      force: options?.force === true,
    });
    return true;
  }

  try {
    window.location.assign(target);
    return true;
  } catch {
    return false;
  }
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

function notifyInfo(
  message = ""
) {
  try {
    AppCore?.modules?.Toast?.info?.(
      message
    );
    return;
  } catch {}

  try {
    AppCore?.toast?.info?.(
      message
    );
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
      "No se encontró #view-container para renderizar Home."
    );
  }

  const html =
    getHomeTemplate(payload);

  container.innerHTML = html;
  rootElement =
    resolveRootElement();

  if (!rootElement) {
    throw new Error(
      "No se pudo resolver el root de la vista Home."
    );
  }

  return rootElement;
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

  syncDatasetFromState();
  bindDomEvents();

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
   ACTIONS
========================================================= */

async function handleRefreshClick(
  event
) {
  event?.preventDefault?.();

  if (refreshInFlight) {
    return refreshInFlight;
  }

  setHomeAction("refresh");
  safeEmit(
    "home:view:refresh:start",
    {
      view: VIEW_NAME,
    }
  );

  notifyInfo(
    "Actualizando dashboard..."
  );

  refreshInFlight =
    (async () => {
      try {
        await HomeAPI.refreshHomeSummary();

        if (destroyed !== true) {
          repaint(
            lastRenderContext
          );
        }

        notifySuccess(
          "Dashboard actualizado."
        );

        safeEmit(
          "home:view:refresh:success",
          {
            view: VIEW_NAME,
            status:
              getHomeStatus(),
          }
        );

        return true;
      } catch (error) {
        safeError(
          "[HomeView] refresh error",
          error
        );

        if (destroyed !== true) {
          repaint(
            lastRenderContext
          );
        }

        notifyError(
          safeText(
            error?.message,
            "No se pudo actualizar el dashboard."
          )
        );

        safeEmit(
          "home:view:refresh:error",
          {
            view: VIEW_NAME,
            error,
          }
        );

        return false;
      } finally {
        refreshInFlight =
          null;
      }
    })();

  return refreshInFlight;
}

function handleActionClick(event) {
  const trigger =
    event?.target?.closest?.(
      "[data-home-action]"
    );

  if (!trigger) {
    return;
  }

  const actionKey = safeText(
    trigger.getAttribute(
      "data-home-action"
    ),
    ""
  );

  const href = safeText(
    trigger.getAttribute("href"),
    "#"
  );

  setHomeAction(actionKey);
  setHomeSelectedCard(actionKey);

  safeEmit(
    "home:view:action",
    {
      view: VIEW_NAME,
      action: actionKey,
      href,
    }
  );

  if (
    trigger.matches(
      '[data-home-action="refresh"]'
    )
  ) {
    handleRefreshClick(event);
    return;
  }

  if (
    trigger.hasAttribute(
      "data-spa"
    )
  ) {
    event.preventDefault();
    safeNavigate(href);
  }
}

function handleCardSelection(event) {
  const card =
    event?.target?.closest?.(
      "[data-home-card]"
    );

  if (!card) {
    return;
  }

  const cardKey = safeText(
    card.getAttribute(
      "data-home-card"
    ),
    ""
  );

  if (!cardKey) {
    return;
  }

  setHomeSelectedCard(cardKey);

  safeEmit(
    "home:view:card:selected",
    {
      view: VIEW_NAME,
      card: cardKey,
    }
  );
}

function handleDomClick(event) {
  handleActionClick(event);
  handleCardSelection(event);
}

/* =========================================================
   BINDINGS
========================================================= */

function bindDomEvents() {
  const root =
    resolveRootElement();

  if (!root) {
    return false;
  }

  rootElement = root;

  if (bound === true) {
    rootElement.removeEventListener(
      "click",
      handleDomClick
    );
  }

  rootElement.addEventListener(
    "click",
    handleDomClick
  );

  bound = true;
  return true;
}

function unbindDomEvents() {
  if (
    rootElement &&
    bound === true
  ) {
    rootElement.removeEventListener(
      "click",
      handleDomClick
    );
  }

  bound = false;
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
  } = safeObject(options);

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
  }
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

  await ensureHomeLoaded({
    force:
      context.force === true,
    preferCache:
      context.preferCache !==
      false,
    silent: false,
  });

  return {
    ok: true,
    view: VIEW_NAME,
    element: rootElement,
    status: getHomeStatus(),
    summary: readHomeSummary(),
    ui: readHomeUi(),
  };
}

export async function render(
  options = {}
) {
  const context =
    safeObject(options);

  destroyed = false;
  lastRenderContext =
    clone(context);

  patchHomeUi({
    mounted: false,
    lastAction: "render",
  });

  repaint(context);
  ensureViewMountedFlag(true);

  if (
    context.load !== false &&
    isHomeReady() !== true
  ) {
    await ensureHomeLoaded({
      force:
        context.force === true,
      preferCache:
        context.preferCache !==
        false,
      silent: false,
    });
  }

  return {
    ok: true,
    view: VIEW_NAME,
    element: rootElement,
    status: getHomeStatus(),
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

  await ensureHomeLoaded({
    force: true,
    preferCache: false,
    silent:
      safeBool(
        context.silent,
        false
      ) === true,
  });

  return {
    ok: true,
    view: VIEW_NAME,
    element: rootElement,
    status: getHomeStatus(),
  };
}

export function destroy() {
  destroyed = true;

  unbindDomEvents();

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
  refreshInFlight = null;

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

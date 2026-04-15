/* =========================================================
   Onion SPA - Home View
   Archivo: src/views/home/index.js

   Responsabilidades:
   - punto de entrada de la vista Home
   - renderizar el template principal en #view-container
   - coordinar init / render / destroy
   - enlazar bindings de la vista
   - cargar summary inicial de la Home
   - mantener compatibilidad con router basado en init()
   - dejar base preparada para futura hidratación visual
========================================================= */

import { AppCore } from "../../core/index.js";

import { getHomeTemplate } from "./home.template.js";
import { bindHomeView } from "./home.bindings.js";

import {
  loadHomeSummary,
} from "./home.api.js";

import {
  markHomeMounted,
  setHomeAction,
  resetHomeStore,
  getHomeSnapshot,
} from "./home.store.js";

/* =========================================================
   INTERNAL STATE
========================================================= */

let currentCleanup = null;
let isInitialized = false;
let currentRenderToken = 0;

/* =========================================================
   HELPERS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function getViewContainer() {
  if (!isBrowser()) {
    return null;
  }

  return document.getElementById(
    "view-container"
  );
}

function runCleanup() {
  if (typeof currentCleanup === "function") {
    try {
      currentCleanup();
    } catch (error) {
      console.error(
        "[HomeView] cleanup error",
        error
      );
    }
  }

  currentCleanup = null;
}

function getRouteTitleFallback() {
  return "Onion Support";
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
      getRouteTitleFallback();

    document.title = String(
      routeTitle ||
        getRouteTitleFallback()
    );
  } catch (error) {
    console.warn(
      "[HomeView] document title warning",
      error
    );
  }
}

function buildTemplatePayload() {
  return {
    appName:
      AppCore?.config?.appName ||
      "Onion Support",
    user:
      AppCore?.state?.user || null,
    home:
      getHomeSnapshot(),
  };
}

function renderIntoContainer(
  container
) {
  if (!container) {
    return;
  }

  container.innerHTML =
    getHomeTemplate(
      buildTemplatePayload()
    );
}

function bindView(container) {
  try {
    currentCleanup =
      bindHomeView({
        AppCore,
        container,
      }) || null;
  } catch (error) {
    console.error(
      "[HomeView] bind error",
      error
    );
    currentCleanup = null;
  }
}

async function hydrateHomeData(
  renderToken
) {
  try {
    setHomeAction("hydrate");

    const result =
      await loadHomeSummary({
        force: false,
        preferCache: true,
      });

    if (
      renderToken !==
      currentRenderToken
    ) {
      return {
        ok: false,
        stale: true,
      };
    }

    if (result?.ok !== true) {
      return result;
    }

    const container =
      getViewContainer();

    if (!container) {
      return {
        ok: false,
        missingContainer: true,
      };
    }

    renderIntoContainer(
      container
    );
    runCleanup();
    bindView(container);
    setDocumentTitle();

    return result;
  } catch (error) {
    console.error(
      "[HomeView] hydrate error",
      error
    );

    return {
      ok: false,
      error,
    };
  }
}

/* =========================================================
   VIEW API
========================================================= */

async function init() {
  const container =
    getViewContainer();

  if (!container) {
    throw new Error(
      'HomeView: no se encontró "#view-container".'
    );
  }

  currentRenderToken += 1;
  const renderToken =
    currentRenderToken;

  runCleanup();
  resetHomeStore();
  markHomeMounted(true);
  setHomeAction("init");

  renderIntoContainer(
    container
  );

  bindView(container);
  setDocumentTitle();

  isInitialized = true;

  await hydrateHomeData(
    renderToken
  );

  return {
    ok: true,
    view: "home",
  };
}

function render() {
  return init();
}

function destroy() {
  currentRenderToken += 1;
  setHomeAction("destroy");
  markHomeMounted(false);
  runCleanup();
  isInitialized = false;
}

function getState() {
  return {
    initialized:
      isInitialized === true,
    renderToken:
      currentRenderToken,
    home:
      getHomeSnapshot(),
  };
}

/* =========================================================
   EXPORT
========================================================= */

export const HomeView = {
  init,
  render,
  destroy,
  getState,
};

export default HomeView;

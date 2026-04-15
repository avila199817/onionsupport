/* =========================================================
   Onion SPA - Home View
   Archivo: src/views/home/index.js

   Responsabilidades:
   - punto de entrada de la vista Home
   - renderizar el template principal en #view-container
   - coordinar init / render / destroy
   - enlazar bindings de la vista
   - mantener compatibilidad con router basado en init()
   - dejar base preparada para futura carga de datos
========================================================= */

import { AppCore } from "../../core/index.js";
import { getHomeTemplate } from "./home.template.js";
import { bindHomeView } from "./home.bindings.js";

/* =========================================================
   INTERNAL STATE
========================================================= */

let currentCleanup = null;
let isInitialized = false;

/* =========================================================
   HELPERS
========================================================= */

function getViewContainer() {
  return document.getElementById("view-container");
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

function setDocumentTitle() {
  try {
    const routeTitle =
      AppCore?.state?.routeMeta?.title ||
      AppCore?.state?.routeTitle ||
      "Onion Support";

    document.title = String(routeTitle || "Onion Support");
  } catch (error) {
    console.warn(
      "[HomeView] document title warning",
      error
    );
  }
}

function renderIntoContainer(container) {
  container.innerHTML =
    getHomeTemplate({
      appName:
        AppCore?.config?.appName ||
        "Onion Support",
      user:
        AppCore?.state?.user || null,
    });
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

  runCleanup();

  renderIntoContainer(
    container
  );

  bindView(container);
  setDocumentTitle();

  isInitialized = true;

  return {
    ok: true,
    view: "home",
  };
}

function render() {
  return init();
}

function destroy() {
  runCleanup();
  isInitialized = false;
}

function getState() {
  return {
    initialized:
      isInitialized === true,
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

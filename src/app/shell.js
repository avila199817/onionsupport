/* =========================================================
   Onion Support - Shell
   Archivo: /src/app/shell.js

   Responsabilidad:
   - Controlar el shell real del index.html.
   - Mostrar/ocultar chrome.
   - Obtener #view-container.
   - Marcar ready/busy.
   - Sin imports.
   - Sin Router interno.
   - Sin Auth.
   - Sin eventos.
   - Sin debug.
   - Sin rutas inventadas.
========================================================= */

export const SHELL_VERSION = "simple";

const PUBLIC_PATHS = [
  "/login",
  "/password-reset",
  "/password-request",
  "/activate-account",
];

function byId(id) {
  return document.getElementById(id);
}

function path() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function cleanPath(value = "/") {
  const clean = String(value || "/").split("?")[0].split("#")[0] || "/";

  if (clean === "/") return "/";
  return clean.startsWith("/") ? clean.replace(/\/+$/g, "") : `/${clean}`;
}

function isPublicPath(value = path()) {
  const current = cleanPath(value);

  return PUBLIC_PATHS.some((route) => {
    return current === route || current.startsWith(`${route}/`);
  });
}

function setHidden(element, hidden) {
  if (!element) return;

  element.hidden = hidden;
  element.setAttribute("aria-hidden", hidden ? "true" : "false");
}

function setBusy(element, busy) {
  if (!element) return;

  element.setAttribute("aria-busy", busy ? "true" : "false");
}

function setData(element, key, value) {
  if (!element) return;

  element.dataset[key] = String(value);
}

function hasContent(element) {
  return Boolean(
    element &&
      (element.childElementCount > 0 || String(element.textContent || "").trim())
  );
}

function chromeNodes() {
  return [
    byId("sidebar-mount"),
    byId("topbar-mount"),
    byId("table-head"),
  ].filter(Boolean);
}

function shellNodes() {
  return [
    byId("app-shell"),
    byId("main-content"),
    byId("app-content"),
    byId("view-container"),
  ].filter(Boolean);
}

function roots() {
  return [document.documentElement, document.body].filter(Boolean);
}

function setChrome(visible) {
  const state = visible ? "visible" : "hidden";

  for (const element of chromeNodes()) {
    setHidden(element, !visible);
    setData(element, "chrome", state);
  }

  for (const element of roots()) {
    setData(element, "chrome", state);
  }
}

function setShellState(state) {
  for (const element of shellNodes()) {
    setHidden(element, false);
    setBusy(element, state === "busy");
    setData(element, "shellState", state);
  }

  for (const element of roots()) {
    setData(element, "shellState", state);
  }
}

function hideLoader() {
  const loader = byId("app-loader");

  if (!loader) return false;

  loader.hidden = true;
  loader.setAttribute("aria-hidden", "true");
  loader.setAttribute("aria-busy", "false");
  loader.classList.remove("is-visible");
  loader.classList.add("is-hidden");
  loader.dataset.loaderVisible = "false";
  loader.dataset.loaderState = "hidden";

  return true;
}

function routeFrom(AppCore = null, Router = null, options = {}) {
  if (options.path) return options.path;
  if (options.publicPath) return options.publicPath;

  if (typeof Router?.getCurrentPublicPath === "function") {
    return Router.getCurrentPublicPath();
  }

  if (typeof Router?.getCurrentPath === "function") {
    return Router.getCurrentPath();
  }

  return AppCore?.state?.publicPath || AppCore?.state?.route || path();
}

export function getShellElements() {
  return {
    html: document.documentElement,
    body: document.body,

    shell: byId("app-shell"),
    appShell: byId("app-shell"),

    main: byId("main-content"),
    mainContent: byId("main-content"),

    appContent: byId("app-content"),

    view: byId("view-container"),
    viewContainer: byId("view-container"),
    viewRoot: byId("view-container"),
    routerView: byId("view-container"),

    sidebarMount: byId("sidebar-mount"),
    topbarMount: byId("topbar-mount"),

    tablehead: byId("table-head"),
    tableHead: byId("table-head"),

    tableheadContainer: byId("tablehead-container"),
    tableHeadContainer: byId("tablehead-container"),

    loader: byId("app-loader"),
    appLoader: byId("app-loader"),
  };
}

export function getViewContainer() {
  return byId("view-container");
}

export function readShellVisibility() {
  return document.body?.dataset?.chrome !== "hidden";
}

export function setShellVisibility(_AppCore = null, visible = true) {
  setShellState("ready");
  setChrome(Boolean(visible));

  return Boolean(visible);
}

export function updateShellVisibilityByRoute(AppCore = null, Router = null, options = {}) {
  const current = routeFrom(AppCore, Router, options);
  return setShellVisibility(AppCore, !isPublicPath(current));
}

export function applyPostRenderLoaderPolicy({
  AppCore = null,
  Router = null,
  hideLoader: externalHideLoader = null,
} = {}) {
  updateShellVisibilityByRoute(AppCore, Router);
  markShellReady();

  if (typeof externalHideLoader === "function") {
    externalHideLoader();
  } else if (hasContent(getViewContainer())) {
    hideLoader();
  }

  return getShellSnapshot();
}

export function markShellReady() {
  setShellState("ready");
  return true;
}

export function markShellBusy() {
  setShellState("busy");
  return true;
}

export function isLoginPath(_AppCore = null, value = path()) {
  return cleanPath(value) === "/login";
}

export function isPasswordResetPath(_AppCore = null, value = path()) {
  return cleanPath(value) === "/password-reset";
}

export function isPasswordRequestPath(_AppCore = null, value = path()) {
  return cleanPath(value) === "/password-request";
}

export function isActivateAccountPath(_AppCore = null, value = path()) {
  return cleanPath(value) === "/activate-account";
}

export function isAuthLikePath(_AppCore = null, value = path()) {
  return isPublicPath(value);
}

export function isAuthLikeRoute(AppCore = null, Router = null) {
  return isPublicPath(routeFrom(AppCore, Router));
}

/* Compat mínima mientras limpiamos imports antiguos. */
export const isResetPasswordPath = isPasswordResetPath;
export const isResetPasswordConfirmPath = () => false;

export function refreshShellElements() {
  return getShellElements();
}

export function resetShellRuntimeState() {
  setShellVisibility(null, true);
  return getShellSnapshot();
}

export function getShellSnapshot() {
  const view = getViewContainer();

  return {
    version: SHELL_VERSION,
    chromeVisible: readShellVisibility(),
    hasShell: Boolean(byId("app-shell")),
    hasView: Boolean(view),
    hasViewContent: hasContent(view),
    shellState: byId("app-shell")?.dataset?.shellState || "",
  };
}

export default {
  SHELL_VERSION,

  getShellElements,
  getViewContainer,

  readShellVisibility,
  setShellVisibility,
  updateShellVisibilityByRoute,
  applyPostRenderLoaderPolicy,

  markShellReady,
  markShellBusy,

  isLoginPath,
  isPasswordResetPath,
  isPasswordRequestPath,
  isResetPasswordPath,
  isResetPasswordConfirmPath,
  isActivateAccountPath,
  isAuthLikePath,
  isAuthLikeRoute,

  refreshShellElements,
  resetShellRuntimeState,
  getShellSnapshot,
};

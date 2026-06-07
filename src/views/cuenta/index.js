/* =========================================================
   Onion SPA - Cuenta View Controller
   Archivo: src/views/cuenta/index.js

   Controlador real de la vista Cuenta.
   - Sin cuentaView.js legacy.
   - Sin router paralelo.
   - Sin HTTP directo.
   - Sin store propio.
========================================================= */

import * as CuentaTemplate from "./cuenta.template.js";
import * as CuentaApiModule from "./cuenta.api.js";

export const CUENTA_INDEX_VERSION = "cuenta.index.stable.v1";
export const CUENTA_VIEW_NAME = "cuenta";

const MOUNT_SELECTOR = "#view-container, #app-content, main";
const ACTION_SELECTOR = "[data-cuenta-action], [data-action]";
const FIELD_SELECTOR = "[data-cuenta-field], [data-field]";

const state = {
  mounted: false,
  loading: false,
  refreshing: false,
  saving: false,
  error: null,
  item: null,
  root: null,
  container: null,
  abortController: null,
  view: {
    form: {},
  },
};

/* =========================================================
   BASIC HELPERS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isElement(value) {
  return Boolean(value && value.nodeType === 1);
}

function safeObject(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : fallback;
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text || fallback;
}

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;

  const key = safeText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (["true", "1", "yes", "si", "sí", "on", "dark", "activo"].includes(key)) {
    return true;
  }

  if (["false", "0", "no", "off", "light", "inactivo"].includes(key)) {
    return false;
  }

  return Boolean(fallback);
}

function emit(eventName, detail = {}) {
  if (!isBrowser()) return false;

  try {
    window.dispatchEvent(
      new CustomEvent(eventName, {
        detail: {
          view: CUENTA_VIEW_NAME,
          version: CUENTA_INDEX_VERSION,
          ...safeObject(detail),
        },
      })
    );

    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   MODULE RESOLUTION
========================================================= */

function getCuentaApi() {
  return CuentaApiModule.CuentaApi || CuentaApiModule.default || CuentaApiModule;
}

function getApiMethod(name) {
  const api = getCuentaApi();
  const fn = CuentaApiModule[name] || api?.[name];

  return typeof fn === "function" ? fn.bind(api) : null;
}

function getTemplateMethod(name) {
  const template = CuentaTemplate.default || CuentaTemplate;
  const fn = CuentaTemplate[name] || template?.[name];

  return typeof fn === "function" ? fn.bind(template) : null;
}

function renderCuentaTemplate(payload = {}) {
  const renderer =
    getTemplateMethod("renderCuentaTemplate") ||
    getTemplateMethod("renderCuentaViewTemplate");

  if (!renderer) {
    throw new Error("CUENTA_TEMPLATE_RENDERER_MISSING");
  }

  return renderer(payload);
}

/* =========================================================
   DOM RESOLUTION
========================================================= */

function resolveContainer(target = null) {
  if (!isBrowser()) return null;
  if (isElement(target)) return target;

  const candidate =
    target?.container ||
    target?.root ||
    target?.el ||
    target?.element ||
    target?.target ||
    null;

  if (isElement(candidate)) return candidate;
  if (typeof candidate === "string") return document.querySelector(candidate);
  if (typeof target === "string") return document.querySelector(target);

  return document.querySelector(MOUNT_SELECTOR);
}

function getActionName(element) {
  return safeText(
    element?.dataset?.cuentaAction ||
      element?.dataset?.action ||
      element?.getAttribute?.("data-cuenta-action") ||
      element?.getAttribute?.("data-action") ||
      "",
    ""
  );
}

function getFieldName(element) {
  return safeText(
    element?.dataset?.cuentaField ||
      element?.dataset?.field ||
      element?.name ||
      "",
    ""
  );
}

function getFieldValue(element) {
  if (!element) return "";

  if (element.type === "checkbox") return Boolean(element.checked);
  if (element.type === "radio") return element.checked ? element.value : undefined;

  return element.value;
}

function readForm() {
  if (!state.root) return {};

  const form = {};

  state.root.querySelectorAll(FIELD_SELECTOR).forEach((field) => {
    const name = getFieldName(field);
    if (!name) return;

    const value = getFieldValue(field);
    if (value === undefined) return;

    form[name] = value;
  });

  return form;
}

/* =========================================================
   STATE
========================================================= */

function patchState(patch = {}) {
  const next = safeObject(patch);

  Object.assign(state, next, {
    view: {
      ...state.view,
      ...safeObject(next.view),
      form: {
        ...state.view.form,
        ...safeObject(next.view?.form),
      },
    },
  });
}

function getPublicState() {
  return {
    loading: state.loading,
    refreshing: state.refreshing,
    saving: state.saving,
    error: state.error,
    item: state.item,
    view: {
      form: { ...state.view.form },
    },
    action: {
      saving: state.saving,
    },
  };
}

/* =========================================================
   RENDER
========================================================= */

function renderFallback(type = "loading", message = "") {
  const cleanMessage = escapeHtml(
    safeText(
      message,
      type === "error" ? "No se pudo cargar la cuenta." : "Cargando cuenta..."
    )
  );

  if (type === "error") {
    return `
      <section class="cuenta-view cuenta-state cuenta-error-state" data-view="cuenta">
        <h2 class="cuenta-state-title">No se pudo cargar la cuenta</h2>
        <p class="cuenta-state-text">${cleanMessage}</p>
        <button
          type="button"
          class="cuenta-btn cuenta-btn-primary"
          data-action="refresh-cuenta"
          data-cuenta-action="refresh-cuenta"
        >
          Reintentar
        </button>
      </section>
    `;
  }

  return `
    <section
      class="cuenta-view cuenta-state cuenta-loading-state"
      data-view="cuenta"
      aria-busy="true"
    >
      <p class="cuenta-state-text">${cleanMessage}</p>
    </section>
  `;
}

function renderView() {
  if (!state.container) return null;

  let html = "";

  if (state.loading && !state.item) {
    const renderLoadingState = getTemplateMethod("renderLoadingState");

    html = renderLoadingState
      ? renderLoadingState()
      : renderFallback("loading");
  } else if (state.error && !state.item) {
    const renderErrorState = getTemplateMethod("renderErrorState");

    html = renderErrorState
      ? renderErrorState(state.error)
      : renderFallback("error", state.error);
  } else {
    html = renderCuentaTemplate({
      item: state.item,
      state: getPublicState(),
    });
  }

  state.container.innerHTML = html;

  state.root =
    state.container.querySelector('[data-view="cuenta"]') ||
    state.container.firstElementChild ||
    state.container;

  if (state.root?.dataset) {
    state.root.dataset.cuentaController = CUENTA_INDEX_VERSION;
    state.root.dataset.cuentaMounted = state.mounted ? "true" : "false";
    state.root.dataset.cuentaLoading = state.loading ? "true" : "false";
    state.root.dataset.cuentaSaving = state.saving ? "true" : "false";
  }

  return state.root;
}

/* =========================================================
   PAYLOADS
========================================================= */

function buildCuentaPayload(form = {}) {
  const source = safeObject(form);
  const payload = {};

  if (Object.prototype.hasOwnProperty.call(source, "name")) {
    payload.name = safeText(source.name, "");
  }

  if (Object.prototype.hasOwnProperty.call(source, "phone")) {
    payload.phone = safeText(source.phone, "");
    payload.telefono = payload.phone;
  }

  if (Object.prototype.hasOwnProperty.call(source, "privacyMode")) {
    payload.privacyMode = normalizeBoolean(source.privacyMode, false);
  }

  if (Object.prototype.hasOwnProperty.call(source, "darkMode")) {
    payload.darkMode = normalizeBoolean(source.darkMode, false);
  }

  if (Object.prototype.hasOwnProperty.call(source, "lang")) {
    payload.lang = safeText(source.lang, "es") || "es";
    payload.language = payload.lang;
    payload.locale = payload.lang;
  }

  return payload;
}

function buildPasswordPayload(form = {}) {
  return {
    currentPassword: safeText(form.currentPassword, ""),
    newPassword: safeText(form.newPassword, ""),
    confirmPassword: safeText(form.confirmPassword, ""),
  };
}

function validatePasswordPayload(payload = {}) {
  if (!payload.currentPassword || !payload.newPassword || !payload.confirmPassword) {
    return "Completa los tres campos de contraseña.";
  }

  if (payload.newPassword !== payload.confirmPassword) {
    return "La nueva contraseña no coincide.";
  }

  if (payload.newPassword.length < 8) {
    return "La nueva contraseña debe tener al menos 8 caracteres.";
  }

  return "";
}

/* =========================================================
   DATA FLOW
========================================================= */

async function loadCuentaData({ force = false, silent = false } = {}) {
  const hydrateFromCache = getApiMethod("hydrateCuentaFromCache");
  const loadCuentaApi = getApiMethod("loadCuenta");

  if (!loadCuentaApi) {
    patchState({
      loading: false,
      refreshing: false,
      error: "cuenta.api.js no expone loadCuenta().",
    });

    renderView();
    return null;
  }

  try {
    const cached = hydrateFromCache?.();

    if (cached && !state.item) {
      patchState({ item: cached });
    }
  } catch {}

  patchState({
    loading: !state.item && !silent,
    refreshing: Boolean(state.item || silent),
    error: null,
  });

  renderView();

  try {
    const item = await loadCuentaApi({ force, silent });

    patchState({
      item: item || state.item,
      loading: false,
      refreshing: false,
      error: null,
    });

    renderView();
    emit("cuenta:loaded", { item: state.item });

    return state.item;
  } catch (error) {
    const message = safeText(error?.message, "No se pudo cargar la cuenta.");

    patchState({
      loading: false,
      refreshing: false,
      error: message,
    });

    renderView();
    emit("cuenta:error", { error: message });

    return null;
  }
}

async function saveCuentaData() {
  const updateCuentaApi = getApiMethod("updateCuenta");
  const form = readForm();
  const payload = buildCuentaPayload(form);

  if (!updateCuentaApi) {
    patchState({
      error: "cuenta.api.js no expone updateCuenta().",
      view: { form },
    });

    renderView();
    return null;
  }

  patchState({
    saving: true,
    error: null,
    view: { form },
  });

  renderView();

  try {
    const item = await updateCuentaApi(payload);

    patchState({
      item: item || { ...safeObject(state.item), ...payload },
      saving: false,
      error: null,
    });

    renderView();
    emit("cuenta:saved", { item: state.item });

    return state.item;
  } catch (error) {
    const message = safeText(error?.message, "No se pudo guardar la cuenta.");

    patchState({
      saving: false,
      error: message,
      view: { form },
    });

    renderView();
    emit("cuenta:error", { error: message });

    return null;
  }
}

async function updateThemeData() {
  const form = readForm();
  const darkMode = normalizeBoolean(form.darkMode, false);
  const updateThemeApi = getApiMethod("updateCuentaTheme");
  const updateCuentaApi = getApiMethod("updateCuenta");

  patchState({
    saving: true,
    error: null,
    view: { form },
  });

  renderView();

  try {
    const item = updateThemeApi
      ? await updateThemeApi(darkMode)
      : await updateCuentaApi?.({ darkMode });

    patchState({
      item: item || state.item,
      saving: false,
      error: null,
    });

    renderView();
    emit("cuenta:theme:updated", { darkMode });

    return state.item;
  } catch (error) {
    const message = safeText(error?.message, "No se pudo actualizar la apariencia.");

    patchState({
      saving: false,
      error: message,
      view: { form },
    });

    renderView();
    emit("cuenta:error", { error: message });

    return null;
  }
}

async function updateLanguageData() {
  const form = readForm();
  const lang = safeText(form.lang, "es") || "es";
  const updateLanguageApi = getApiMethod("updateCuentaLanguage");
  const updateCuentaApi = getApiMethod("updateCuenta");

  patchState({
    saving: true,
    error: null,
    view: { form },
  });

  renderView();

  try {
    const item = updateLanguageApi
      ? await updateLanguageApi(lang)
      : await updateCuentaApi?.({ lang, language: lang, locale: lang });

    patchState({
      item: item || state.item,
      saving: false,
      error: null,
    });

    renderView();
    emit("cuenta:language:updated", { lang });

    return state.item;
  } catch (error) {
    const message = safeText(error?.message, "No se pudo actualizar el idioma.");

    patchState({
      saving: false,
      error: message,
      view: { form },
    });

    renderView();
    emit("cuenta:error", { error: message });

    return null;
  }
}

async function changePasswordData() {
  const changePasswordApi = getApiMethod("changePassword");
  const form = readForm();
  const payload = buildPasswordPayload(form);
  const validationError = validatePasswordPayload(payload);

  if (validationError) {
    patchState({
      error: validationError,
      view: { form },
    });

    renderView();
    return false;
  }

  if (!changePasswordApi) {
    patchState({
      error: "El cambio de contraseña todavía no está conectado en cuenta.api.js.",
      view: { form },
    });

    renderView();
    return false;
  }

  patchState({
    saving: true,
    error: null,
    view: { form },
  });

  renderView();

  try {
    await changePasswordApi(payload);

    patchState({
      saving: false,
      error: null,
      view: {
        form: {
          ...form,
          currentPassword: "",
          newPassword: "",
          confirmPassword: "",
        },
      },
    });

    renderView();
    emit("cuenta:password:changed");

    return true;
  } catch (error) {
    const message = safeText(error?.message, "No se pudo cambiar la contraseña.");

    patchState({
      saving: false,
      error: message,
      view: { form },
    });

    renderView();
    emit("cuenta:error", { error: message });

    return false;
  }
}

/* =========================================================
   EVENTS
========================================================= */

async function handleAction(action = "") {
  switch (safeText(action, "")) {
    case "refresh-cuenta":
    case "reload-cuenta":
    case "reload":
      return loadCuentaData({ force: true });

    case "save-cuenta":
    case "save":
      return saveCuentaData();

    case "toggle-theme":
    case "change-theme":
      return updateThemeData();

    case "change-language":
    case "update-language":
      return updateLanguageData();

    case "change-password":
      return changePasswordData();

    default:
      return null;
  }
}

function onClick(event) {
  const trigger = event.target?.closest?.(ACTION_SELECTOR);

  if (!trigger || !state.container?.contains(trigger)) return;

  const action = getActionName(trigger);
  if (!action) return;

  event.preventDefault();
  void handleAction(action);
}

function onChange(event) {
  const field = event.target?.closest?.(FIELD_SELECTOR);

  if (!field || !state.container?.contains(field)) return;

  const form = readForm();

  patchState({
    view: { form },
  });

  const action = getActionName(field);

  if (action === "change-language") {
    void updateLanguageData();
  }
}

function bindEvents() {
  if (!state.container || state.abortController) return;

  state.abortController = new AbortController();

  state.container.addEventListener("click", onClick, {
    signal: state.abortController.signal,
  });

  state.container.addEventListener("change", onChange, {
    signal: state.abortController.signal,
  });
}

function unbindEvents() {
  try {
    state.abortController?.abort();
  } catch {}

  state.abortController = null;
}

function setContainer(container) {
  if (!container || container === state.container) return;

  unbindEvents();

  state.container = container;
  state.container.dataset.view = CUENTA_VIEW_NAME;
  state.container.dataset.cuentaController = CUENTA_INDEX_VERSION;

  bindEvents();
}

/* =========================================================
   ROUTER PUBLIC API
========================================================= */

export async function mount(target = null, options = {}) {
  const container = resolveContainer(target);

  if (!container) {
    throw new Error("CUENTA_MOUNT_TARGET_MISSING");
  }

  setContainer(container);

  patchState({
    mounted: true,
    error: null,
    view: {
      form: safeObject(options?.form),
    },
  });

  await loadCuentaData({
    force: Boolean(options?.force),
    silent: Boolean(options?.silent),
  });

  emit("cuenta:mounted", { item: state.item });

  return CuentaView;
}

export function render(target = null, options = {}) {
  const container = resolveContainer(target) || state.container;

  if (container) {
    setContainer(container);
  }

  if (options?.item !== undefined) {
    patchState({ item: options.item });
  }

  if (options?.state) {
    patchState(options.state);
  }

  return renderView();
}

export async function reload(options = {}) {
  return loadCuentaData({
    force: true,
    silent: Boolean(options?.silent),
  });
}

export function destroy() {
  unbindEvents();

  if (state.container) {
    delete state.container.dataset.cuentaController;
  }

  patchState({
    mounted: false,
    loading: false,
    refreshing: false,
    saving: false,
    error: null,
    root: null,
    container: null,
    abortController: null,
  });

  emit("cuenta:destroyed");

  return true;
}

export const init = mount;
export const bootstrap = mount;
export const refresh = reload;
export const unmount = destroy;
export const dispose = destroy;

export function getState() {
  return {
    mounted: state.mounted,
    loading: state.loading,
    refreshing: state.refreshing,
    saving: state.saving,
    error: state.error,
    item: state.item,
    view: {
      form: { ...state.view.form },
    },
    version: CUENTA_INDEX_VERSION,
  };
}

export const getSnapshot = getState;
export const getCuentaSnapshot = getState;

export const getItem = () => state.item;
export const getCuenta = () => state.item;

export const loadCuenta = reload;
export const refreshCuenta = reload;

export const saveCuenta = saveCuentaData;
export const save = saveCuentaData;
export const saveProfile = saveCuentaData;
export const savePerfil = saveCuentaData;
export const updateProfile = saveCuentaData;
export const updatePerfil = saveCuentaData;
export const updateCuenta = saveCuentaData;

export const updateTheme = updateThemeData;
export const updateCuentaTheme = updateThemeData;
export const setTheme = updateThemeData;

export const updateLanguage = updateLanguageData;
export const updateCuentaLanguage = updateLanguageData;
export const setLanguage = updateLanguageData;

export const changePassword = changePasswordData;
export const updatePassword = changePasswordData;
export const savePassword = changePasswordData;

export const CuentaView = Object.freeze({
  name: CUENTA_VIEW_NAME,
  version: CUENTA_INDEX_VERSION,

  mount,
  init,
  bootstrap,
  render,
  reload,
  refresh,
  destroy,
  unmount,
  dispose,

  loadCuenta,
  refreshCuenta,

  saveCuenta,
  save,
  saveProfile,
  savePerfil,
  updateProfile,
  updatePerfil,
  updateCuenta,

  updateTheme,
  updateCuentaTheme,
  setTheme,

  updateLanguage,
  updateCuentaLanguage,
  setLanguage,

  changePassword,
  updatePassword,
  savePassword,

  getState,
  getSnapshot,
  getCuentaSnapshot,
  getItem,
  getCuenta,
});

export const View = CuentaView;
export const view = CuentaView;
export const component = CuentaView;
export const page = CuentaView;

export default CuentaView;

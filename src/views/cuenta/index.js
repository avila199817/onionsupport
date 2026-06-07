/* =========================================================
   Onion SPA - Cuenta View
   Archivo: src/views/cuenta/index.js

   Controlador real de Cuenta.
   - Patrón Router 1:1 con Home.
   - Render inmediato.
   - Carga API en background.
   - Sin cuentaView.js.
   - Sin store.
   - Sin storage.
   - Sin fetch directo.
   - Sin HTTP directo.
   - Sin Router paralelo.
   - Sin bridges globales.
========================================================= */

import * as CuentaTemplate from "./cuenta.template.js";
import * as CuentaApiModule from "./cuenta.api.js";

export const CUENTA_INDEX_VERSION = "cuenta.index.stable.v2.router-fast";
export const CUENTA_VIEW_VERSION = CUENTA_INDEX_VERSION;

const VIEW_NAME = "cuenta";
const SOURCE = "cuenta.view";

const ACTION_SELECTOR = "[data-cuenta-action], [data-action]";
const FIELD_SELECTOR = "[data-cuenta-field], [data-field]";

const ACTIONS = Object.freeze({
  REFRESH: "refresh-cuenta",
  RELOAD: "reload-cuenta",

  SAVE: "save-cuenta",

  TOGGLE_THEME: "toggle-theme",
  CHANGE_THEME: "change-theme",
  UPDATE_THEME: "update-theme",

  CHANGE_LANGUAGE: "change-language",
  UPDATE_LANGUAGE: "update-language",

  CHANGE_PASSWORD: "change-password",

  UPLOAD_AVATAR: "upload-avatar",
  DELETE_AVATAR: "delete-avatar",
});

const INSTANCES = new WeakMap();

let lastInstance = null;

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isFunction(value) {
  return typeof value === "function";
}

function isDomNode(value = null) {
  return Boolean(
    typeof Node !== "undefined" &&
      value &&
      value instanceof Node
  );
}

function cleanText(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function safeObject(value, fallback = {}) {
  return isObject(value) ? value : fallback;
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

function hasContent(value = null) {
  return isObject(value) && Object.keys(value).length > 0;
}

function normalizeKey(value = "") {
  return cleanText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^\w]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;

  const key = normalizeKey(value);

  if (
    [
      "true",
      "1",
      "yes",
      "y",
      "si",
      "sí",
      "on",
      "dark",
      "enabled",
      "activo",
      "activa",
    ].includes(key)
  ) {
    return true;
  }

  if (
    [
      "false",
      "0",
      "no",
      "n",
      "off",
      "light",
      "disabled",
      "inactivo",
      "inactiva",
    ].includes(key)
  ) {
    return false;
  }

  return Boolean(fallback);
}

function safeError(error = null, fallback = "No se pudo procesar la cuenta.") {
  return cleanText(
    first(
      error?.message,
      error?.data?.message,
      error?.payload?.message,
      error?.response?.message,
      error?.error,
      error?.code,
      fallback
    ),
    fallback
  );
}

function now() {
  return Date.now();
}

/* =========================================================
   MODULE RESOLUTION
========================================================= */

function getTemplateModule() {
  return CuentaTemplate.default || CuentaTemplate;
}

function getTemplateMethod(name = "") {
  const template = getTemplateModule();
  const fn = CuentaTemplate[name] || template?.[name];

  return isFunction(fn) ? fn.bind(template) : null;
}

function getCuentaApi() {
  return CuentaApiModule.CuentaApi || CuentaApiModule.default || CuentaApiModule;
}

function getApiMethod(name = "") {
  const api = getCuentaApi();
  const fn = CuentaApiModule[name] || api?.[name];

  return isFunction(fn) ? fn.bind(api) : null;
}

function renderCuentaTemplate(payload = {}) {
  const renderFn =
    getTemplateMethod("renderCuentaTemplate") ||
    getTemplateMethod("renderCuentaViewTemplate");

  if (!renderFn) {
    throw new Error("CUENTA_TEMPLATE_RENDERER_MISSING");
  }

  return renderFn(payload);
}

/* =========================================================
   DOM HELPERS
========================================================= */

function renderHtml(host = null, html = "") {
  if (!host) return false;

  host.innerHTML = String(html || "");
  return true;
}

function clearHost(host = null) {
  if (!host) return false;

  try {
    host.replaceChildren();
    return true;
  } catch {
    try {
      host.textContent = "";
      return true;
    } catch {
      return false;
    }
  }
}

function closestAction(target = null) {
  const element = target?.nodeType === 3
    ? target.parentElement
    : target;

  return element?.closest?.(ACTION_SELECTOR) || null;
}

function closestField(target = null) {
  const element = target?.nodeType === 3
    ? target.parentElement
    : target;

  return element?.closest?.(FIELD_SELECTOR) || null;
}

function getActionName(element = null) {
  return cleanText(
    element?.dataset?.cuentaAction ||
      element?.dataset?.action ||
      element?.getAttribute?.("data-cuenta-action") ||
      element?.getAttribute?.("data-action") ||
      "",
    ""
  );
}

function getFieldName(element = null) {
  return cleanText(
    element?.dataset?.cuentaField ||
      element?.dataset?.field ||
      element?.name ||
      "",
    ""
  );
}

function getFieldValue(element = null) {
  if (!element) return "";

  if (element.type === "checkbox") return Boolean(element.checked);

  if (element.type === "radio") {
    return element.checked ? element.value : undefined;
  }

  if (element.type === "file") {
    return element.files?.[0] || null;
  }

  return element.value;
}

/* =========================================================
   INSTANCE REGISTRY
========================================================= */

function destroyPrevious(host = null) {
  const previous = INSTANCES.get(host);

  if (previous?.destroy) {
    previous.destroy({
      remount: true,
    });

    return true;
  }

  return false;
}

function storeInstance(host = null, instance = null) {
  if (!host || !instance) return false;

  INSTANCES.set(host, instance);
  lastInstance = instance;

  return true;
}

function clearInstance(host = null, instance = null) {
  if (host && INSTANCES.get(host) === instance) {
    INSTANCES.delete(host);
  }

  if (lastInstance === instance) {
    lastInstance = null;
  }

  return true;
}

/* =========================================================
   PAYLOAD BUILDERS
========================================================= */

function buildCuentaPayload(form = {}) {
  const source = safeObject(form);
  const payload = {};

  if (Object.prototype.hasOwnProperty.call(source, "name")) {
    payload.name = cleanText(source.name, "");
  }

  if (Object.prototype.hasOwnProperty.call(source, "phone")) {
    payload.phone = cleanText(source.phone, "");
    payload.telefono = payload.phone;
    payload.mobile = payload.phone;
  }

  if (Object.prototype.hasOwnProperty.call(source, "privacyMode")) {
    payload.privacyMode = normalizeBoolean(source.privacyMode, false);
  }

  if (Object.prototype.hasOwnProperty.call(source, "darkMode")) {
    const darkMode = normalizeBoolean(source.darkMode, false);
    const theme = darkMode ? "dark" : "light";

    payload.darkMode = darkMode;
    payload.theme = theme;
    payload.mode = theme;
    payload.appearance = theme;
  }

  if (Object.prototype.hasOwnProperty.call(source, "lang")) {
    const lang = cleanText(source.lang, "es") || "es";

    payload.lang = lang;
    payload.language = lang;
    payload.locale = lang;
  }

  return payload;
}

function buildPasswordPayload(form = {}) {
  return {
    currentPassword: String(form.currentPassword ?? ""),
    newPassword: String(form.newPassword ?? ""),
    confirmPassword: String(form.confirmPassword ?? ""),
  };
}

function validatePasswordPayload(payload = {}) {
  const currentPassword = String(payload.currentPassword || "");
  const newPassword = String(payload.newPassword || "");
  const confirmPassword = String(payload.confirmPassword || "");

  if (!currentPassword || !newPassword || !confirmPassword) {
    return "Completa los tres campos de contraseña.";
  }

  if (newPassword !== confirmPassword) {
    return "La nueva contraseña no coincide.";
  }

  if (newPassword.length < 10) {
    return "La contraseña debe tener al menos 10 caracteres.";
  }

  if (!/[a-z]/.test(newPassword)) {
    return "La contraseña debe incluir una minúscula.";
  }

  if (!/[A-Z]/.test(newPassword)) {
    return "La contraseña debe incluir una mayúscula.";
  }

  if (!/\d/.test(newPassword)) {
    return "La contraseña debe incluir un número.";
  }

  if (!/[^A-Za-z\d]/.test(newPassword)) {
    return "La contraseña debe incluir un símbolo.";
  }

  return "";
}

/* =========================================================
   CONTROLLER
========================================================= */

function createCuentaController(host = null, context = {}) {
  let destroyed = false;
  let mounted = false;
  let bound = false;

  let loading = false;
  let refreshing = false;
  let saving = false;

  let item = null;
  let form = {};

  let lastError = null;
  let lastSuccess = "";
  let lastRenderAt = null;

  let loadSeq = 0;

  function getCachedCuenta() {
    const hydrate = getApiMethod("hydrateCuentaFromCache");

    try {
      const cached = hydrate?.();
      return hasContent(cached) ? cached : null;
    } catch {
      return null;
    }
  }

  function readForm() {
    if (!host) return {};

    const next = {};

    host.querySelectorAll(FIELD_SELECTOR).forEach((field) => {
      const name = getFieldName(field);
      if (!name) return;

      const value = getFieldValue(field);
      if (value === undefined) return;

      next[name] = value;
    });

    return next;
  }

  function viewState(extra = {}) {
    const extraView = safeObject(extra.view);
    const extraForm = safeObject(extraView.form);

    return {
      loading: extra.loading ?? loading,
      refreshing: extra.refreshing ?? refreshing,
      saving: extra.saving ?? saving,

      error: extra.error ?? lastError,
      item: extra.item ?? item,

      view: {
        ...extraView,
        form: {
          ...form,
          ...extraForm,
        },
        successMessage: extra.successMessage ?? lastSuccess,
      },

      action: {
        saving: extra.saving ?? saving,
      },
    };
  }

  function render(data = {}) {
    if (destroyed || !host) return false;

    const detail = data.item ?? item;

    lastRenderAt = now();

    try {
      host.dataset.view = VIEW_NAME;
      host.dataset.cuentaController = CUENTA_INDEX_VERSION;
      host.dataset.cuentaMounted = mounted ? "true" : "false";
      host.dataset.cuentaLoading = loading ? "true" : "false";
      host.dataset.cuentaRefreshing = refreshing ? "true" : "false";
      host.dataset.cuentaSaving = saving ? "true" : "false";
      host.setAttribute("aria-busy", loading || refreshing || saving ? "true" : "false");
    } catch {}

    return renderHtml(
      host,
      renderCuentaTemplate({
        item: detail,
        state: viewState(data),
      })
    );
  }

  function renderLoading({ preferCached = true } = {}) {
    if (destroyed || !host) return false;

    lastRenderAt = now();

    if (preferCached || item) {
      return render({
        item,
        loading: !item,
        refreshing: Boolean(item),
      });
    }

    try {
      return renderHtml(
        host,
        renderCuentaTemplate({
          item: null,
          state: viewState({
            loading: true,
            refreshing: false,
            saving: false,
            error: null,
          }),
        })
      );
    } catch {
      const renderLoadingState = getTemplateMethod("renderLoadingState");

      return renderHtml(
        host,
        renderLoadingState
          ? renderLoadingState()
          : `
            <section class="cuenta-state cuenta-loading-state" aria-busy="true">
              <p class="cuenta-state-text">Cargando cuenta...</p>
            </section>
          `
      );
    }
  }

  function renderError(error = null) {
    if (destroyed || !host) return false;

    const message = safeError(error, "No se pudo cargar la cuenta.");

    lastError = message;
    lastSuccess = "";
    lastRenderAt = now();

    if (item) {
      return render({
        item,
        loading: false,
        refreshing: false,
        saving: false,
        error: message,
      });
    }

    const renderErrorState = getTemplateMethod("renderErrorState");

    return renderHtml(
      host,
      renderErrorState
        ? renderErrorState(message)
        : `
          <section class="cuenta-state cuenta-error-state">
            <h3 class="cuenta-state-title">No se pudo cargar la cuenta</h3>
            <p class="cuenta-state-text">${message}</p>
            <button type="button" class="cuenta-btn cuenta-btn--primary" data-action="refresh-cuenta" data-cuenta-action="refresh-cuenta">
              Reintentar
            </button>
          </section>
        `
    );
  }

  async function load(options = {}) {
    const seq = ++loadSeq;
    const loadCuenta = getApiMethod("loadCuenta");

    if (!loadCuenta) {
      loading = false;
      refreshing = false;
      saving = false;
      lastError = "cuenta.api.js no expone loadCuenta().";
      lastSuccess = "";

      renderError(lastError);
      return null;
    }

    lastError = null;
    lastSuccess = "";

    loading = !item;
    refreshing = Boolean(item);
    saving = false;

    renderLoading({
      preferCached: true,
    });

    try {
      const nextItem = await loadCuenta({
        force: options.force === true || options.forceRefresh === true,
        silent: options.silent === true,
        source: cleanText(options.source, `${SOURCE}.load`),
      });

      if (destroyed || seq !== loadSeq) {
        return nextItem || null;
      }

      item = hasContent(nextItem) ? nextItem : item;

      loading = false;
      refreshing = false;
      saving = false;
      lastError = cleanText(nextItem?.error || "", "");
      lastSuccess = "";

      render({
        item,
        loading: false,
        refreshing: false,
        saving: false,
        error: lastError,
      });

      return item;
    } catch (error) {
      if (destroyed || seq !== loadSeq) {
        return null;
      }

      loading = false;
      refreshing = false;
      saving = false;

      renderError(error);

      return null;
    }
  }

  function refresh() {
    return load({
      force: true,
      source: `${SOURCE}.refresh`,
    });
  }

  async function saveCuenta() {
    const updateCuenta = getApiMethod("updateCuenta");

    form = readForm();

    if (!updateCuenta) {
      lastError = "cuenta.api.js no expone updateCuenta().";
      lastSuccess = "";

      render({
        error: lastError,
      });

      return null;
    }

    const payload = buildCuentaPayload(form);

    if (!Object.keys(payload).length) {
      lastError = null;
      lastSuccess = "No hay cambios para guardar.";

      render({
        error: null,
        successMessage: lastSuccess,
      });

      return item;
    }

    loading = false;
    refreshing = false;
    saving = true;

    lastError = null;
    lastSuccess = "";

    render({
      saving: true,
      error: null,
    });

    try {
      const updated = await updateCuenta(payload, {
        source: `${SOURCE}.save`,
      });

      item = hasContent(updated)
        ? updated
        : {
            ...safeObject(item),
            ...payload,
          };

      saving = false;
      lastError = null;
      lastSuccess = "Cambios guardados correctamente.";

      render({
        item,
        saving: false,
        error: null,
        successMessage: lastSuccess,
      });

      return item;
    } catch (error) {
      saving = false;
      lastError = safeError(error, "No se pudo guardar la cuenta.");
      lastSuccess = "";

      render({
        saving: false,
        error: lastError,
      });

      return null;
    }
  }

  async function updateTheme() {
    const updateCuentaTheme = getApiMethod("updateCuentaTheme");
    const updateCuenta = getApiMethod("updateCuenta");

    form = readForm();

    const darkMode = normalizeBoolean(form.darkMode, false);
    const payload = buildCuentaPayload({
      ...form,
      darkMode,
    });

    if (!updateCuentaTheme && !updateCuenta) {
      lastError = "cuenta.api.js no expone updateCuentaTheme() ni updateCuenta().";
      lastSuccess = "";

      render({
        error: lastError,
      });

      return null;
    }

    loading = false;
    refreshing = false;
    saving = true;

    lastError = null;
    lastSuccess = "";

    render({
      saving: true,
      error: null,
    });

    try {
      const updated = updateCuentaTheme
        ? await updateCuentaTheme(darkMode, {
            source: `${SOURCE}.theme`,
          })
        : await updateCuenta(payload, {
            source: `${SOURCE}.theme`,
          });

      item = hasContent(updated)
        ? updated
        : {
            ...safeObject(item),
            ...payload,
          };

      saving = false;
      lastError = null;
      lastSuccess = "Apariencia actualizada correctamente.";

      render({
        item,
        saving: false,
        error: null,
        successMessage: lastSuccess,
      });

      return item;
    } catch (error) {
      saving = false;
      lastError = safeError(error, "No se pudo actualizar la apariencia.");
      lastSuccess = "";

      render({
        saving: false,
        error: lastError,
      });

      return null;
    }
  }

  async function updateLanguage() {
    const updateCuentaLanguage = getApiMethod("updateCuentaLanguage");
    const updateCuenta = getApiMethod("updateCuenta");

    form = readForm();

    const lang = cleanText(form.lang, "es") || "es";
    const payload = buildCuentaPayload({
      ...form,
      lang,
    });

    if (!updateCuentaLanguage && !updateCuenta) {
      lastError = "cuenta.api.js no expone updateCuentaLanguage() ni updateCuenta().";
      lastSuccess = "";

      render({
        error: lastError,
      });

      return null;
    }

    loading = false;
    refreshing = false;
    saving = true;

    lastError = null;
    lastSuccess = "";

    render({
      saving: true,
      error: null,
    });

    try {
      const updated = updateCuentaLanguage
        ? await updateCuentaLanguage(lang, {
            source: `${SOURCE}.language`,
          })
        : await updateCuenta(payload, {
            source: `${SOURCE}.language`,
          });

      item = hasContent(updated)
        ? updated
        : {
            ...safeObject(item),
            ...payload,
          };

      saving = false;
      lastError = null;
      lastSuccess = "Idioma actualizado correctamente.";

      render({
        item,
        saving: false,
        error: null,
        successMessage: lastSuccess,
      });

      return item;
    } catch (error) {
      saving = false;
      lastError = safeError(error, "No se pudo actualizar el idioma.");
      lastSuccess = "";

      render({
        saving: false,
        error: lastError,
      });

      return null;
    }
  }

  async function changePassword() {
    const changePasswordApi =
      getApiMethod("changePassword") ||
      getApiMethod("updatePassword") ||
      getApiMethod("savePassword");

    form = readForm();

    const payload = buildPasswordPayload(form);
    const validationError = validatePasswordPayload(payload);

    if (validationError) {
      lastError = validationError;
      lastSuccess = "";

      render({
        error: lastError,
      });

      return false;
    }

    if (!changePasswordApi) {
      lastError = "cuenta.api.js no expone changePassword().";
      lastSuccess = "";

      render({
        error: lastError,
      });

      return false;
    }

    loading = false;
    refreshing = false;
    saving = true;

    lastError = null;
    lastSuccess = "";

    render({
      saving: true,
      error: null,
    });

    try {
      const result = await changePasswordApi(payload, {
        source: `${SOURCE}.password`,
      });

      const nextItem = result?.item || result?.user || result?.usuario || result?.account || null;

      if (hasContent(nextItem)) {
        item = nextItem;
      }

      form = {
        ...form,
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      };

      saving = false;
      lastError = null;
      lastSuccess = "Contraseña actualizada correctamente.";

      render({
        item,
        saving: false,
        error: null,
        successMessage: lastSuccess,
        view: {
          form,
        },
      });

      return true;
    } catch (error) {
      saving = false;
      lastError = safeError(error, "No se pudo cambiar la contraseña.");
      lastSuccess = "";

      render({
        saving: false,
        error: lastError,
      });

      return false;
    }
  }

  async function uploadAvatar(node = null) {
    const uploadCuentaAvatar = getApiMethod("uploadCuentaAvatar");

    if (!uploadCuentaAvatar) {
      lastError = "cuenta.api.js no expone uploadCuentaAvatar().";
      lastSuccess = "";

      render({
        error: lastError,
      });

      return null;
    }

    const fileInput =
      node?.matches?.('input[type="file"]')
        ? node
        : host?.querySelector?.('input[type="file"][data-cuenta-field="avatar"], input[type="file"][data-field="avatar"]');

    const file = fileInput?.files?.[0] || null;

    if (!file) {
      lastError = "Selecciona una imagen de avatar.";
      lastSuccess = "";

      render({
        error: lastError,
      });

      return null;
    }

    saving = true;
    lastError = null;
    lastSuccess = "";

    render({
      saving: true,
      error: null,
    });

    try {
      const updated = await uploadCuentaAvatar(file, {
        source: `${SOURCE}.avatar.upload`,
      });

      if (hasContent(updated)) {
        item = updated;
      }

      saving = false;
      lastError = null;
      lastSuccess = "Avatar actualizado correctamente.";

      render({
        item,
        saving: false,
        error: null,
        successMessage: lastSuccess,
      });

      return item;
    } catch (error) {
      saving = false;
      lastError = safeError(error, "No se pudo subir el avatar.");
      lastSuccess = "";

      render({
        saving: false,
        error: lastError,
      });

      return null;
    }
  }

  async function deleteAvatar() {
    const deleteCuentaAvatar = getApiMethod("deleteCuentaAvatar");

    if (!deleteCuentaAvatar) {
      lastError = "cuenta.api.js no expone deleteCuentaAvatar().";
      lastSuccess = "";

      render({
        error: lastError,
      });

      return null;
    }

    saving = true;
    lastError = null;
    lastSuccess = "";

    render({
      saving: true,
      error: null,
    });

    try {
      const updated = await deleteCuentaAvatar({
        source: `${SOURCE}.avatar.delete`,
      });

      if (hasContent(updated)) {
        item = updated;
      }

      saving = false;
      lastError = null;
      lastSuccess = "Avatar eliminado correctamente.";

      render({
        item,
        saving: false,
        error: null,
        successMessage: lastSuccess,
      });

      return item;
    } catch (error) {
      saving = false;
      lastError = safeError(error, "No se pudo eliminar el avatar.");
      lastSuccess = "";

      render({
        saving: false,
        error: lastError,
      });

      return null;
    }
  }

  async function handleAction(action = "", node = null) {
    const type = cleanText(action, "");

    switch (type) {
      case ACTIONS.REFRESH:
      case ACTIONS.RELOAD:
      case "refresh":
      case "reload":
        await refresh();
        return true;

      case ACTIONS.SAVE:
      case "save":
        await saveCuenta();
        return true;

      case ACTIONS.TOGGLE_THEME:
      case ACTIONS.CHANGE_THEME:
      case ACTIONS.UPDATE_THEME:
        await updateTheme();
        return true;

      case ACTIONS.CHANGE_LANGUAGE:
      case ACTIONS.UPDATE_LANGUAGE:
        await updateLanguage();
        return true;

      case ACTIONS.CHANGE_PASSWORD:
        await changePassword();
        return true;

      case ACTIONS.UPLOAD_AVATAR:
        await uploadAvatar(node);
        return true;

      case ACTIONS.DELETE_AVATAR:
        await deleteAvatar();
        return true;

      default:
        return false;
    }
  }

  function onClick(event) {
    if (destroyed) return;

    const node = closestAction(event.target);

    if (!node || !host?.contains?.(node)) return;
    if (node.disabled || node.getAttribute("aria-disabled") === "true") return;

    const action = getActionName(node);
    if (!action) return;

    event.preventDefault();

    void handleAction(action, node);
  }

  function onInput(event) {
    if (destroyed) return;

    const field = closestField(event.target);

    if (!field || !host?.contains?.(field)) return;

    form = readForm();
    lastSuccess = "";
  }

  function onChange(event) {
    if (destroyed) return;

    const field = closestField(event.target);

    if (!field || !host?.contains?.(field)) return;

    form = readForm();
    lastSuccess = "";

    if (
      field.tagName === "SELECT" ||
      field.type === "checkbox" ||
      field.type === "radio"
    ) {
      render({
        view: {
          form,
        },
      });
    }
  }

  function bind() {
    if (bound || !host) return false;

    host.addEventListener("click", onClick);
    host.addEventListener("input", onInput);
    host.addEventListener("change", onChange);

    bound = true;

    return true;
  }

  function unbind() {
    if (!bound || !host) return false;

    host.removeEventListener("click", onClick);
    host.removeEventListener("input", onInput);
    host.removeEventListener("change", onChange);

    bound = false;

    return true;
  }

  function mount(options = {}) {
    if (destroyed || !host) return null;
    if (mounted) return controller;

    mounted = true;

    bind();

    form = safeObject(options.form);

    item = getCachedCuenta();

    loading = !item;
    refreshing = false;
    saving = false;

    lastError = null;
    lastSuccess = "";

    if (item) {
      render({
        item,
        loading: false,
      });

      void load({
        force: Boolean(options.force),
        silent: true,
        source: `${SOURCE}.background`,
      });

      return controller;
    }

    renderLoading({
      preferCached: false,
    });

    void load({
      force: Boolean(options.force),
      silent: Boolean(options.silent),
      source: `${SOURCE}.initial`,
    });

    return controller;
  }

  function destroy() {
    destroyed = true;
    mounted = false;

    loading = false;
    refreshing = false;
    saving = false;

    loadSeq += 1;

    unbind();
    clearHost(host);
    clearInstance(host, controller);

    return true;
  }

  const controller = {
    version: CUENTA_VIEW_VERSION,
    name: VIEW_NAME,

    mount,
    destroy,

    unmount: destroy,
    cleanup: destroy,
    dispose: destroy,

    refresh,
    reload: refresh,

    saveCuenta,
    save: saveCuenta,
    saveProfile: saveCuenta,
    savePerfil: saveCuenta,
    updateProfile: saveCuenta,
    updatePerfil: saveCuenta,
    updateCuenta: saveCuenta,

    updateTheme,
    updateCuentaTheme: updateTheme,
    setTheme: updateTheme,
    setCuentaTheme: updateTheme,

    updateLanguage,
    updateCuentaLanguage: updateLanguage,
    setLanguage: updateLanguage,
    setCuentaLanguage: updateLanguage,

    changePassword,
    updatePassword: changePassword,
    savePassword: changePassword,

    uploadAvatar,
    uploadCuentaAvatar: uploadAvatar,
    deleteAvatar,
    deleteCuentaAvatar: deleteAvatar,

    getItem() {
      return item;
    },

    getCuenta() {
      return item;
    },

    getState() {
      return this.getSnapshot();
    },

    getSnapshot() {
      return {
        version: CUENTA_VIEW_VERSION,

        mounted,
        destroyed,
        loading,
        refreshing,
        saving,

        hasHost: Boolean(host),
        hasItem: hasContent(item),

        lastError,
        lastSuccess,
        lastRenderAt,

        source: SOURCE,
      };
    },

    getDebugSnapshot() {
      return this.getSnapshot();
    },
  };

  return controller;
}

/* =========================================================
   VIEW EXPORT
========================================================= */

export function CuentaView(host = null, context = {}) {
  if (!isDomNode(host)) {
    return null;
  }

  destroyPrevious(host);

  const controller = createCuentaController(host, context);

  storeInstance(host, controller);

  return controller.mount(
    safeObject(context)
  );
}

export const CuentaIndex = CuentaView;
export const View = CuentaView;
export const view = CuentaView;
export const component = CuentaView;
export const page = CuentaView;

export const mount = CuentaView;
export const init = CuentaView;
export const bootstrap = CuentaView;
export const render = CuentaView;

export function destroy() {
  try {
    return Boolean(lastInstance?.destroy?.());
  } catch {
    return false;
  }
}

export const unmount = destroy;
export const cleanup = destroy;
export const dispose = destroy;

export function refresh() {
  try {
    return lastInstance?.refresh?.() || null;
  } catch {
    return null;
  }
}

export const reload = refresh;
export const loadCuenta = refresh;
export const refreshCuenta = refresh;

export function saveCuenta() {
  try {
    return lastInstance?.saveCuenta?.() || null;
  } catch {
    return null;
  }
}

export const save = saveCuenta;
export const saveProfile = saveCuenta;
export const savePerfil = saveCuenta;
export const updateProfile = saveCuenta;
export const updatePerfil = saveCuenta;
export const updateCuenta = saveCuenta;

export function updateTheme() {
  try {
    return lastInstance?.updateTheme?.() || null;
  } catch {
    return null;
  }
}

export const updateCuentaTheme = updateTheme;
export const setTheme = updateTheme;
export const setCuentaTheme = updateTheme;

export function updateLanguage() {
  try {
    return lastInstance?.updateLanguage?.() || null;
  } catch {
    return null;
  }
}

export const updateCuentaLanguage = updateLanguage;
export const setLanguage = updateLanguage;
export const setCuentaLanguage = updateLanguage;

export function changePassword() {
  try {
    return lastInstance?.changePassword?.() || null;
  } catch {
    return null;
  }
}

export const updatePassword = changePassword;
export const savePassword = changePassword;

export function getItem() {
  try {
    return lastInstance?.getItem?.() || null;
  } catch {
    return null;
  }
}

export const getCuenta = getItem;

export function getSnapshot() {
  if (lastInstance?.getSnapshot) {
    return lastInstance.getSnapshot();
  }

  return {
    version: CUENTA_VIEW_VERSION,
    mounted: false,
    hasInstance: false,
    source: SOURCE,
  };
}

export const getDebugSnapshot = getSnapshot;

export default CuentaView;

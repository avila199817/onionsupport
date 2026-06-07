/* =========================================================
   Onion SPA - Cuenta Index
   Archivo: src/views/cuenta/index.js

   Responsabilidad:
   - Controlador mínimo de la vista Cuenta.
   - Montar template.
   - Hidratar desde memoria/Core.
   - Pintar inmediatamente sin bloquear el Router.
   - Cargar cuenta desde cuenta.api.js sólo cuando toca.
   - NO refrescar al cambiar de vista si ya está cargada.
   - Guardar perfil/preferencias.
   - Cambiar contraseña.
   - Delegar HTML en template.
   - Delegar API en cuenta.api.js.
   - Sin cuentaView.js.
   - Sin Store.
   - Sin State externo.
   - Sin storage.
   - Sin fetch propio.
   - Sin HTTP duplicado.
   - Sin Router paralelo.
========================================================= */

import * as CuentaTemplate from "./cuenta.template.js";
import * as CuentaApiModule from "./cuenta.api.js";

export const CUENTA_INDEX_VERSION = "cuenta.index.solid.v3.no-remount-refresh";
export const CUENTA_VIEW_VERSION = CUENTA_INDEX_VERSION;

const SOURCE = "cuenta.view";

const ACTION_SELECTOR = "[data-cuenta-action], [data-action]";
const FIELD_SELECTOR = "[data-cuenta-field], [data-field]";
const ROUTER_EVENT_HANDLED_KEY = "__onionRouterHandled";

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

const cuentaMemory = {
  item: null,
  userKey: "",
  loaded: false,
  loadedAt: 0,
  error: "",
};

let sharedLoadPromise = null;

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

function safeObject(value, fallback = {}) {
  return isObject(value) ? value : fallback;
}

function cleanText(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function first(...values) {
  for (const value of values.flat(Infinity)) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (isObject(value) && Object.keys(value).length === 0) continue;

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

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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

function renderCuentaTemplate(payload = {}) {
  const renderer =
    getTemplateMethod("renderCuentaTemplate") ||
    getTemplateMethod("renderCuentaViewTemplate");

  if (!renderer) {
    throw new Error("CUENTA_TEMPLATE_RENDERER_MISSING");
  }

  return renderer(payload);
}

function getCuentaApi() {
  return CuentaApiModule.CuentaApi || CuentaApiModule.default || CuentaApiModule;
}

function getApiMethod(name = "") {
  const api = getCuentaApi();
  const fn = CuentaApiModule[name] || api?.[name];

  return isFunction(fn) ? fn.bind(api) : null;
}

/* =========================================================
   MEMORY CACHE
========================================================= */

function getCuentaKey(item = null) {
  const raw = safeObject(item, {});

  return cleanText(
    first(
      raw.userId,
      raw.uid,
      raw.sub,
      raw.id,
      raw.email,
      raw.emailLower,
      raw.username,
      raw.usernameLower,
      raw.slug,
      ""
    ),
    ""
  ).toLowerCase();
}

function clearCuentaMemory() {
  cuentaMemory.item = null;
  cuentaMemory.userKey = "";
  cuentaMemory.loaded = false;
  cuentaMemory.loadedAt = 0;
  cuentaMemory.error = "";
  sharedLoadPromise = null;

  return true;
}

function setCuentaMemory(item = null, { loaded = true, error = "" } = {}) {
  if (!hasContent(item)) return null;

  const key = getCuentaKey(item);

  cuentaMemory.item = item;
  cuentaMemory.userKey = key;
  cuentaMemory.loaded = Boolean(loaded);
  cuentaMemory.loadedAt = loaded ? now() : cuentaMemory.loadedAt || 0;
  cuentaMemory.error = cleanText(error, "");

  return cuentaMemory.item;
}

function getHydratedCuenta() {
  const hydrate = getApiMethod("hydrateCuentaFromCache");

  try {
    const item = hydrate?.();
    return hasContent(item) ? item : null;
  } catch {
    return null;
  }
}

function getInitialCuenta() {
  const hydrated = getHydratedCuenta();
  const hydratedKey = getCuentaKey(hydrated);

  if (
    hydratedKey &&
    cuentaMemory.userKey &&
    hydratedKey !== cuentaMemory.userKey
  ) {
    clearCuentaMemory();
  }

  if (hasContent(cuentaMemory.item)) {
    return {
      item: cuentaMemory.item,
      loaded: cuentaMemory.loaded,
      source: cuentaMemory.loaded ? "memory.loaded" : "memory.hydrated",
    };
  }

  if (hasContent(hydrated)) {
    setCuentaMemory(hydrated, {
      loaded: false,
    });

    return {
      item: hydrated,
      loaded: false,
      source: "api.hydrated",
    };
  }

  return {
    item: null,
    loaded: false,
    source: "empty",
  };
}

/* =========================================================
   DOM
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
  const previous = host ? INSTANCES.get(host) : null;

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

  let lastError = "";
  let lastSuccess = "";
  let lastRenderAt = null;
  let mountedFrom = "";

  let loadSeq = 0;

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

    lastRenderAt = now();

    try {
      host.dataset.view = "cuenta";
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
        item: data.item ?? item,
        state: viewState(data),
      })
    );
  }

  function renderLoading() {
    if (destroyed || !host) return false;

    loading = true;
    refreshing = false;
    saving = false;

    return render({
      item,
      loading: true,
      refreshing: false,
      saving: false,
      error: "",
    });
  }

  function renderError(error = null) {
    if (destroyed || !host) return false;

    const message = safeError(error, "No se pudo cargar la cuenta.");

    lastError = message;
    lastSuccess = "";

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
            <p class="cuenta-state-text">${escapeHtml(message)}</p>
            <button
              type="button"
              class="cuenta-btn cuenta-btn--primary"
              data-action="refresh-cuenta"
              data-cuenta-action="refresh-cuenta"
            >
              Reintentar
            </button>
          </section>
        `
    );
  }

  async function fetchCuenta(options = {}) {
    const loadCuenta = getApiMethod("loadCuenta");

    if (!loadCuenta) {
      throw new Error("cuenta.api.js no expone loadCuenta().");
    }

    const force = options.force === true || options.forceRefresh === true;

    if (!force && sharedLoadPromise) {
      return sharedLoadPromise;
    }

    const promise = Promise.resolve(
      loadCuenta({
        force,
        silent: options.silent === true,
        source: cleanText(options.source, `${SOURCE}.load`),
      })
    );

    if (!force) {
      sharedLoadPromise = promise;
    }

    try {
      return await promise;
    } finally {
      if (sharedLoadPromise === promise) {
        sharedLoadPromise = null;
      }
    }
  }

  async function load(options = {}) {
    const seq = ++loadSeq;
    const force = options.force === true || options.forceRefresh === true;
    const silent = options.silent === true;

    lastError = "";
    lastSuccess = "";

    if (!silent) {
      loading = !item;
      refreshing = force && Boolean(item);
      saving = false;

      if (loading) {
        renderLoading();
      } else {
        render({
          loading: false,
          refreshing,
          saving: false,
          error: "",
        });
      }
    }

    try {
      const nextItem = await fetchCuenta({
        ...options,
        force,
        silent,
      });

      if (hasContent(nextItem)) {
        setCuentaMemory(nextItem, {
          loaded: true,
        });
      }

      if (destroyed || seq !== loadSeq) {
        return nextItem || null;
      }

      item = hasContent(nextItem)
        ? nextItem
        : item;

      loading = false;
      refreshing = false;
      saving = false;
      lastError = cleanText(nextItem?.error || "", "");

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
      lastError = safeError(error, "No se pudo cargar la cuenta.");

      if (item) {
        render({
          item,
          loading: false,
          refreshing: false,
          saving: false,
          error: lastError,
        });

        return null;
      }

      renderError(lastError);

      return null;
    }
  }

  async function refresh() {
    return load({
      force: true,
      silent: false,
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
      lastError = "";
      lastSuccess = "No hay cambios para guardar.";

      render({
        error: "",
        successMessage: lastSuccess,
      });

      return item;
    }

    saving = true;
    loading = false;
    refreshing = false;
    lastError = "";
    lastSuccess = "";

    render({
      saving: true,
      error: "",
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

      setCuentaMemory(item, {
        loaded: true,
      });

      saving = false;
      lastError = "";
      lastSuccess = "Cambios guardados correctamente.";

      render({
        item,
        saving: false,
        error: "",
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

    saving = true;
    loading = false;
    refreshing = false;
    lastError = "";
    lastSuccess = "";

    render({
      saving: true,
      error: "",
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

      setCuentaMemory(item, {
        loaded: true,
      });

      saving = false;
      lastError = "";
      lastSuccess = "Apariencia actualizada correctamente.";

      render({
        item,
        saving: false,
        error: "",
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

    saving = true;
    loading = false;
    refreshing = false;
    lastError = "";
    lastSuccess = "";

    render({
      saving: true,
      error: "",
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

      setCuentaMemory(item, {
        loaded: true,
      });

      saving = false;
      lastError = "";
      lastSuccess = "Idioma actualizado correctamente.";

      render({
        item,
        saving: false,
        error: "",
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

    saving = true;
    loading = false;
    refreshing = false;
    lastError = "";
    lastSuccess = "";

    render({
      saving: true,
      error: "",
    });

    try {
      const result = await changePasswordApi(payload, {
        source: `${SOURCE}.password`,
      });

      const nextItem = first(
        result?.item,
        result?.user,
        result?.usuario,
        result?.account,
        null
      );

      if (hasContent(nextItem)) {
        item = nextItem;

        setCuentaMemory(item, {
          loaded: true,
        });
      }

      form = {
        ...form,
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      };

      saving = false;
      lastError = "";
      lastSuccess = "Contraseña actualizada correctamente.";

      render({
        item,
        saving: false,
        error: "",
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
    lastError = "";
    lastSuccess = "";

    render({
      saving: true,
      error: "",
    });

    try {
      const updated = await uploadCuentaAvatar(file, {
        source: `${SOURCE}.avatar.upload`,
      });

      if (hasContent(updated)) {
        item = updated;

        setCuentaMemory(item, {
          loaded: true,
        });
      }

      saving = false;
      lastError = "";
      lastSuccess = "Avatar actualizado correctamente.";

      render({
        item,
        saving: false,
        error: "",
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
    lastError = "";
    lastSuccess = "";

    render({
      saving: true,
      error: "",
    });

    try {
      const updated = await deleteCuentaAvatar({
        source: `${SOURCE}.avatar.delete`,
      });

      if (hasContent(updated)) {
        item = updated;

        setCuentaMemory(item, {
          loaded: true,
        });
      }

      saving = false;
      lastError = "";
      lastSuccess = "Avatar eliminado correctamente.";

      render({
        item,
        saving: false,
        error: "",
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

    if (!type) return false;

    if (type === ACTIONS.REFRESH || type === ACTIONS.RELOAD || type === "refresh" || type === "reload") {
      await refresh();
      return true;
    }

    if (type === ACTIONS.SAVE || type === "save") {
      await saveCuenta();
      return true;
    }

    if (
      type === ACTIONS.TOGGLE_THEME ||
      type === ACTIONS.CHANGE_THEME ||
      type === ACTIONS.UPDATE_THEME
    ) {
      await updateTheme();
      return true;
    }

    if (
      type === ACTIONS.CHANGE_LANGUAGE ||
      type === ACTIONS.UPDATE_LANGUAGE
    ) {
      await updateLanguage();
      return true;
    }

    if (type === ACTIONS.CHANGE_PASSWORD) {
      await changePassword();
      return true;
    }

    if (type === ACTIONS.UPLOAD_AVATAR) {
      await uploadAvatar(node);
      return true;
    }

    if (type === ACTIONS.DELETE_AVATAR) {
      await deleteAvatar();
      return true;
    }

    return false;
  }

  function onClick(event) {
    if (destroyed) return;

    const node = closestAction(event.target);

    if (!node || !host?.contains?.(node)) return;
    if (node.disabled || node.getAttribute("aria-disabled") === "true") return;

    const action = getActionName(node);

    if (!action) return;

    event.preventDefault();
    event.stopPropagation();
    event[ROUTER_EVENT_HANDLED_KEY] = true;

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

  function onSubmit(event) {
    const formNode = event.target?.closest?.("form");

    if (!formNode || !host?.contains?.(formNode)) return;

    event.preventDefault();
    event.stopPropagation();
    event[ROUTER_EVENT_HANDLED_KEY] = true;

    void saveCuenta();
  }

  function bind() {
    if (bound || !host) return false;

    host.addEventListener("click", onClick);
    host.addEventListener("input", onInput);
    host.addEventListener("change", onChange);
    host.addEventListener("submit", onSubmit);

    bound = true;

    return true;
  }

  function unbind() {
    if (!bound || !host) return false;

    host.removeEventListener("click", onClick);
    host.removeEventListener("input", onInput);
    host.removeEventListener("change", onChange);
    host.removeEventListener("submit", onSubmit);

    bound = false;

    return true;
  }

  function shouldLoadOnMount(options = {}) {
    if (options.force === true || options.forceRefresh === true) return true;
    if (options.refreshOnMount === true) return true;
    if (!item) return true;
    if (!cuentaMemory.loaded) return true;

    return false;
  }

  function mount(options = {}) {
    if (destroyed || !host) return controller;
    if (mounted) return controller;

    mounted = true;
    bind();

    const initial = getInitialCuenta();

    item = initial.item;
    mountedFrom = initial.source;

    form = safeObject(options.form);

    loading = !item;
    refreshing = false;
    saving = false;
    lastError = "";
    lastSuccess = "";

    if (item) {
      render({
        item,
        loading: false,
        refreshing: false,
        saving: false,
      });
    } else {
      renderLoading();
    }

    if (shouldLoadOnMount(options)) {
      void load({
        force: options.force === true || options.forceRefresh === true,
        silent: Boolean(item),
        source: item
          ? `${SOURCE}.mount.background.once`
          : `${SOURCE}.mount.initial`,
      });
    }

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

        memory: {
          loaded: cuentaMemory.loaded,
          loadedAt: cuentaMemory.loadedAt,
          hasItem: hasContent(cuentaMemory.item),
          userKey: cuentaMemory.userKey ? "***" : "",
          inFlight: Boolean(sharedLoadPromise),
        },

        mountedFrom,

        lastError,
        lastSuccess,
        lastRenderAt,
      };
    },

    getDebugSnapshot() {
      return this.getSnapshot();
    },
  };

  return controller;
}

/* =========================================================
   VIEW ENTRY
========================================================= */

export async function CuentaView(host = null, context = {}) {
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
    return lastInstance?.getItem?.() || cuentaMemory.item || null;
  } catch {
    return cuentaMemory.item || null;
  }
}

export const getCuenta = getItem;

export function clearCuentaViewCache() {
  return clearCuentaMemory();
}

export function getSnapshot() {
  if (lastInstance?.getSnapshot) {
    return lastInstance.getSnapshot();
  }

  return {
    version: CUENTA_VIEW_VERSION,
    mounted: false,
    hasInstance: false,
    memory: {
      loaded: cuentaMemory.loaded,
      loadedAt: cuentaMemory.loadedAt,
      hasItem: hasContent(cuentaMemory.item),
      userKey: cuentaMemory.userKey ? "***" : "",
      inFlight: Boolean(sharedLoadPromise),
    },
  };
}

export const getDebugSnapshot = getSnapshot;

export default CuentaView;

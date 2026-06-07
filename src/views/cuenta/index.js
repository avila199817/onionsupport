/* =========================================================
   Onion SPA - Cuenta Index
   Archivo: src/views/cuenta/index.js

   Cuenta controller slim / no-flicker.
   - Montaje SPA directo.
   - Sin Store.
   - Sin storage.
   - Sin fetch propio.
   - Sin Router paralelo.
   - Sin re-render inútil.
   - Sin limpiar el host en remount interno.
========================================================= */

import * as CuentaTemplate from "./cuenta.template.js";
import * as CuentaApiModule from "./cuenta.api.js";

export const CUENTA_INDEX_VERSION = "cuenta.index.slim.v4.no-flicker";
export const CUENTA_VIEW_VERSION = CUENTA_INDEX_VERSION;

const SOURCE = "cuenta.view";
const ACTION_SELECTOR = "[data-cuenta-action], [data-action]";
const FIELD_SELECTOR = "[data-cuenta-field], [data-field]";
const ROUTER_EVENT_HANDLED_KEY = "__onionRouterHandled";

const INSTANCES = new WeakMap();

const REFRESH_ACTIONS = new Set(["refresh-cuenta", "reload-cuenta", "refresh", "reload"]);
const SAVE_ACTIONS = new Set(["save-cuenta", "save", "save-profile", "save-perfil"]);
const THEME_ACTIONS = new Set(["toggle-theme", "change-theme", "update-theme", "set-theme"]);
const LANGUAGE_ACTIONS = new Set(["change-language", "update-language", "set-language"]);
const PASSWORD_ACTIONS = new Set(["change-password", "update-password", "save-password"]);
const UPLOAD_AVATAR_ACTIONS = new Set(["upload-avatar", "upload-cuenta-avatar"]);
const DELETE_AVATAR_ACTIONS = new Set(["delete-avatar", "delete-cuenta-avatar", "remove-avatar"]);

let lastInstance = null;
let sharedLoadPromise = null;

const cuentaMemory = {
  item: null,
  key: "",
  loaded: false,
  loadedAt: 0,
};

/* =========================================================
   BASICS
========================================================= */

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isFunction(value) {
  return typeof value === "function";
}

function isDomNode(value) {
  return Boolean(value && value.nodeType === 1 && isFunction(value.querySelectorAll));
}

function safeObject(value, fallback = {}) {
  return isObject(value) ? value : fallback;
}

function cleanText(value = "", fallback = "") {
  const text = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text || fallback;
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

  if (["true", "1", "yes", "y", "si", "on", "dark", "enabled", "active", "activo", "activa"].includes(key)) {
    return true;
  }

  if (["false", "0", "no", "n", "off", "light", "disabled", "inactive", "inactivo", "inactiva"].includes(key)) {
    return false;
  }

  return Boolean(fallback);
}

function normalizeLang(value = "es") {
  const key = normalizeKey(value);

  if (["en", "eng", "english", "en_us", "en_gb"].includes(key)) return "en";
  if (["ca", "cat", "catala", "catalan", "ca_es"].includes(key)) return "ca";

  return "es";
}

function first(...values) {
  const stack = values.flat(Infinity);

  for (const value of stack) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (isObject(value) && Object.keys(value).length === 0) continue;

    return value;
  }

  return null;
}

function hasContent(value) {
  return isObject(value) && Object.keys(value).length > 0;
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(Object(object), key);
}

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeError(error, fallback = "No se pudo procesar la cuenta.") {
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

function signature(value) {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return String(value ?? "");
  }
}

/* =========================================================
   TEMPLATE / API
========================================================= */

function getTemplateModule() {
  return CuentaTemplate.default || CuentaTemplate;
}

function getTemplateMethod(name) {
  const template = getTemplateModule();
  const method = CuentaTemplate[name] || template?.[name];

  return isFunction(method) ? method.bind(template) : null;
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

function renderErrorState(message = "No se pudo cargar la cuenta.") {
  const renderer = getTemplateMethod("renderErrorState");

  if (renderer) return renderer(message);

  return `
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
  `;
}

function getCuentaApi() {
  return CuentaApiModule.CuentaApi || CuentaApiModule.default || CuentaApiModule;
}

function getApiMethod(name) {
  const api = getCuentaApi();
  const method = CuentaApiModule[name] || api?.[name];

  return isFunction(method) ? method.bind(api) : null;
}

/* =========================================================
   MEMORY
========================================================= */

function getCuentaKey(item = null) {
  const source = safeObject(item);

  return cleanText(
    first(
      source.userId,
      source.uid,
      source.sub,
      source.id,
      source.email,
      source.emailLower,
      source.username,
      source.usernameLower,
      source.slug,
      ""
    ),
    ""
  ).toLowerCase();
}

function clearCuentaMemory() {
  cuentaMemory.item = null;
  cuentaMemory.key = "";
  cuentaMemory.loaded = false;
  cuentaMemory.loadedAt = 0;
  sharedLoadPromise = null;

  return true;
}

function setCuentaMemory(item = null, { loaded = true } = {}) {
  if (!hasContent(item)) return cuentaMemory.item;

  cuentaMemory.item = item;
  cuentaMemory.key = getCuentaKey(item);
  cuentaMemory.loaded = Boolean(loaded);

  if (loaded) {
    cuentaMemory.loadedAt = Date.now();
  }

  return cuentaMemory.item;
}

function hydrateCuentaMemory() {
  const hydrate = getApiMethod("hydrateCuentaFromCache");
  let hydrated = null;

  try {
    hydrated = hydrate?.() || null;
  } catch {
    hydrated = null;
  }

  if (!hasContent(hydrated)) {
    return cuentaMemory.item;
  }

  const hydratedKey = getCuentaKey(hydrated);

  if (hydratedKey && cuentaMemory.key && hydratedKey !== cuentaMemory.key) {
    clearCuentaMemory();
  }

  if (!hasContent(cuentaMemory.item)) {
    setCuentaMemory(hydrated, { loaded: false });
  }

  return cuentaMemory.item;
}

async function fetchCuenta({ force = false, silent = false, source = `${SOURCE}.load` } = {}) {
  const loadCuenta = getApiMethod("loadCuenta");

  if (!loadCuenta) {
    throw new Error("cuenta.api.js no expone loadCuenta().");
  }

  if (!force && sharedLoadPromise) {
    return sharedLoadPromise;
  }

  const promise = Promise.resolve(
    loadCuenta({
      force,
      silent,
      source,
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

/* =========================================================
   DOM
========================================================= */

function closestFrom(target, selector) {
  const node = target?.nodeType === 3 ? target.parentElement : target;
  return node?.closest?.(selector) || null;
}

function getActionName(node = null) {
  return cleanText(
    node?.dataset?.cuentaAction ||
      node?.dataset?.action ||
      node?.getAttribute?.("data-cuenta-action") ||
      node?.getAttribute?.("data-action") ||
      "",
    ""
  );
}

function getFieldName(node = null) {
  return cleanText(
    node?.dataset?.cuentaField ||
      node?.dataset?.field ||
      node?.name ||
      "",
    ""
  );
}

function getFieldValue(node = null) {
  if (!node) return "";
  if (node.type === "checkbox") return Boolean(node.checked);
  if (node.type === "radio") return node.checked ? node.value : undefined;
  if (node.type === "file") return node.files?.[0] || null;

  return node.value;
}

function readForm(host = null) {
  const form = {};

  if (!host) return form;

  host.querySelectorAll(FIELD_SELECTOR).forEach((field) => {
    const name = getFieldName(field);
    if (!name) return;

    const value = getFieldValue(field);
    if (value === undefined) return;

    form[name] = value;
  });

  return form;
}

function syncNativeControlVisual(field = null) {
  if (!field || field.type !== "checkbox") return;

  const area = field.closest?.(".cuenta-switch-area");
  const switchNode = area?.querySelector?.(".cuenta-switch");
  const stateNode = area?.querySelector?.(".cuenta-control-state");
  const name = getFieldName(field);

  switchNode?.classList?.toggle("is-checked", Boolean(field.checked));

  if (!stateNode) return;

  if (name === "darkMode") {
    stateNode.textContent = field.checked ? "Dark" : "Light";
    return;
  }

  stateNode.textContent = field.checked ? "Activo" : "Estándar";
}

function clearHost(host = null) {
  try {
    host?.replaceChildren?.();
  } catch {
    if (host) host.textContent = "";
  }
}

/* =========================================================
   PAYLOADS
========================================================= */

function buildCuentaPayload(form = {}) {
  const source = safeObject(form);
  const payload = {};

  if (hasOwn(source, "name")) {
    payload.name = cleanText(source.name, "");
  }

  if (hasOwn(source, "phone")) {
    payload.phone = cleanText(source.phone, "");
    payload.telefono = payload.phone;
    payload.mobile = payload.phone;
  }

  if (hasOwn(source, "privacyMode")) {
    payload.privacyMode = normalizeBoolean(source.privacyMode, false);
  }

  if (hasOwn(source, "darkMode")) {
    const darkMode = normalizeBoolean(source.darkMode, false);
    const theme = darkMode ? "dark" : "light";

    payload.darkMode = darkMode;
    payload.theme = theme;
    payload.mode = theme;
    payload.appearance = theme;
  }

  if (hasOwn(source, "lang")) {
    const lang = normalizeLang(source.lang);

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

  if (!/[a-z]/.test(newPassword)) return "La contraseña debe incluir una minúscula.";
  if (!/[A-Z]/.test(newPassword)) return "La contraseña debe incluir una mayúscula.";
  if (!/\d/.test(newPassword)) return "La contraseña debe incluir un número.";
  if (!/[^A-Za-z\d]/.test(newPassword)) return "La contraseña debe incluir un símbolo.";

  return "";
}

function pickItem(result = null) {
  const nested = first(
    result?.item,
    result?.user,
    result?.usuario,
    result?.account,
    result?.profile,
    result?.cuenta,
    result?.data?.item,
    result?.data?.user,
    result?.data?.account,
    null
  );

  if (hasContent(nested)) return nested;
  if (hasContent(result) && !("ok" in result && "success" in result)) return result;

  return null;
}

/* =========================================================
   CONTROLLER
========================================================= */

function destroyPrevious(host = null) {
  const previous = host ? INSTANCES.get(host) : null;

  if (!previous?.destroy) return false;

  previous.destroy({ keepDom: true, remount: true });
  return true;
}

function createCuentaController(host = null, context = {}) {
  let destroyed = false;
  let mounted = false;
  let bound = false;

  let item = null;
  let form = {};

  let loading = false;
  let refreshing = false;
  let saving = false;

  let lastError = "";
  let lastSuccess = "";
  let lastHTML = "";
  let lastRenderAt = 0;
  let mountedFrom = "empty";
  let loadSeq = 0;

  function makeState(extra = {}) {
    const extraView = safeObject(extra.view);

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
          ...safeObject(extraView.form),
        },
        successMessage: extra.successMessage ?? lastSuccess,
      },
      action: {
        saving: extra.saving ?? saving,
      },
    };
  }

  function setHostFlags() {
    if (!host) return;

    const busy = loading || refreshing || saving;

    try {
      host.dataset.view = "cuenta";
      host.dataset.cuentaController = CUENTA_VIEW_VERSION;
      host.dataset.cuentaMounted = mounted ? "true" : "false";
      host.dataset.cuentaLoading = loading ? "true" : "false";
      host.dataset.cuentaRefreshing = refreshing ? "true" : "false";
      host.dataset.cuentaSaving = saving ? "true" : "false";
      host.setAttribute("aria-busy", busy ? "true" : "false");
    } catch {}
  }

  function render(extra = {}) {
    if (destroyed || !host) return false;

    setHostFlags();

    let html = "";

    try {
      html = renderCuentaTemplate({
        item: extra.item ?? item,
        state: makeState(extra),
      });
    } catch (error) {
      html = renderErrorState(safeError(error, "No se pudo renderizar la cuenta."));
    }

    if (html === lastHTML || (!lastHTML && host.innerHTML === html)) {
      lastHTML = html;
      lastRenderAt = Date.now();
      return false;
    }

    host.innerHTML = html;
    lastHTML = html;
    lastRenderAt = Date.now();

    return true;
  }

  function fail(error, fallback) {
    loading = false;
    refreshing = false;
    saving = false;
    lastError = safeError(error, fallback);
    lastSuccess = "";

    render({ error: lastError });

    return null;
  }

  function commit(nextItem = null, { loaded = true, merge = null } = {}) {
    const picked = pickItem(nextItem);

    if (hasContent(picked)) {
      item = picked;
    } else if (hasContent(merge)) {
      item = {
        ...safeObject(item),
        ...merge,
      };
    }

    if (hasContent(item)) {
      setCuentaMemory(item, { loaded });
    }

    return item;
  }

  async function load(options = {}) {
    const seq = ++loadSeq;
    const force = options.force === true || options.forceRefresh === true;
    const silent = options.silent === true;
    const paint = options.paint === true || !silent;
    const hadItem = hasContent(item);

    lastError = "";
    lastSuccess = "";

    if (!silent) {
      loading = !hadItem;
      refreshing = force && hadItem;
      saving = false;
      render();
    }

    try {
      const result = await fetchCuenta({
        force,
        silent,
        source: cleanText(options.source, force ? `${SOURCE}.refresh` : `${SOURCE}.load`),
      });

      if (destroyed || seq !== loadSeq) {
        return result || null;
      }

      const before = signature(item);

      commit(result, { loaded: true });

      loading = false;
      refreshing = false;
      saving = false;
      lastError = cleanText(result?.error, "");

      const changed = signature(item) !== before;

      if (paint || (!hadItem && hasContent(item)) || (!silent && changed)) {
        render({ error: lastError });
      }

      return item;
    } catch (error) {
      if (destroyed || seq !== loadSeq) return null;

      loading = false;
      refreshing = false;
      saving = false;
      lastError = safeError(error, "No se pudo cargar la cuenta.");
      lastSuccess = "";

      if (!silent || !hasContent(item)) {
        render({ error: lastError });
      }

      return null;
    }
  }

  async function refresh() {
    return load({
      force: true,
      silent: false,
      paint: true,
      source: `${SOURCE}.refresh`,
    });
  }

  async function saveCuenta() {
    const updateCuenta = getApiMethod("updateCuenta");

    form = readForm(host);

    if (!updateCuenta) {
      return fail("cuenta.api.js no expone updateCuenta().", "No se pudo guardar la cuenta.");
    }

    const payload = buildCuentaPayload(form);

    if (!Object.keys(payload).length) {
      lastError = "";
      lastSuccess = "No hay cambios para guardar.";
      render({ successMessage: lastSuccess });
      return item;
    }

    saving = true;
    loading = false;
    refreshing = false;
    lastError = "";
    lastSuccess = "";
    render();

    try {
      const result = await updateCuenta(payload, { source: `${SOURCE}.save` });

      commit(result, { loaded: true, merge: payload });

      saving = false;
      lastError = "";
      lastSuccess = "Cambios guardados correctamente.";

      render({ successMessage: lastSuccess });
      return item;
    } catch (error) {
      return fail(error, "No se pudo guardar la cuenta.");
    }
  }

  async function updateTheme() {
    const updateCuentaTheme = getApiMethod("updateCuentaTheme");
    const updateCuenta = getApiMethod("updateCuenta");

    form = readForm(host);

    const darkMode = normalizeBoolean(form.darkMode, false);
    const payload = buildCuentaPayload({ ...form, darkMode });

    if (!updateCuentaTheme && !updateCuenta) {
      return fail("cuenta.api.js no expone updateCuentaTheme() ni updateCuenta().", "No se pudo actualizar la apariencia.");
    }

    saving = true;
    loading = false;
    refreshing = false;
    lastError = "";
    lastSuccess = "";
    render();

    try {
      const result = updateCuentaTheme
        ? await updateCuentaTheme(darkMode, { source: `${SOURCE}.theme` })
        : await updateCuenta(payload, { source: `${SOURCE}.theme` });

      commit(result, { loaded: true, merge: payload });

      saving = false;
      lastError = "";
      lastSuccess = "Apariencia actualizada correctamente.";

      render({ successMessage: lastSuccess });
      return item;
    } catch (error) {
      return fail(error, "No se pudo actualizar la apariencia.");
    }
  }

  async function updateLanguage() {
    const updateCuentaLanguage = getApiMethod("updateCuentaLanguage");
    const updateCuenta = getApiMethod("updateCuenta");

    form = readForm(host);

    const lang = normalizeLang(form.lang);
    const payload = buildCuentaPayload({ ...form, lang });

    if (!updateCuentaLanguage && !updateCuenta) {
      return fail("cuenta.api.js no expone updateCuentaLanguage() ni updateCuenta().", "No se pudo actualizar el idioma.");
    }

    saving = true;
    loading = false;
    refreshing = false;
    lastError = "";
    lastSuccess = "";
    render();

    try {
      const result = updateCuentaLanguage
        ? await updateCuentaLanguage(lang, { source: `${SOURCE}.language` })
        : await updateCuenta(payload, { source: `${SOURCE}.language` });

      commit(result, { loaded: true, merge: payload });

      saving = false;
      lastError = "";
      lastSuccess = "Idioma actualizado correctamente.";

      render({ successMessage: lastSuccess });
      return item;
    } catch (error) {
      return fail(error, "No se pudo actualizar el idioma.");
    }
  }

  async function changePassword() {
    const changePasswordApi =
      getApiMethod("changePassword") ||
      getApiMethod("updatePassword") ||
      getApiMethod("savePassword");

    form = readForm(host);

    const payload = buildPasswordPayload(form);
    const validationError = validatePasswordPayload(payload);

    if (validationError) {
      lastError = validationError;
      lastSuccess = "";
      render({ error: lastError });
      return false;
    }

    if (!changePasswordApi) {
      fail("cuenta.api.js no expone changePassword().", "No se pudo cambiar la contraseña.");
      return false;
    }

    saving = true;
    loading = false;
    refreshing = false;
    lastError = "";
    lastSuccess = "";
    render();

    try {
      const result = await changePasswordApi(payload, { source: `${SOURCE}.password` });
      const nextItem = pickItem(result);

      if (hasContent(nextItem)) {
        commit(nextItem, { loaded: true });
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
        successMessage: lastSuccess,
        view: { form },
      });

      return true;
    } catch (error) {
      fail(error, "No se pudo cambiar la contraseña.");
      return false;
    }
  }

  async function uploadAvatar(node = null) {
    const uploadCuentaAvatar = getApiMethod("uploadCuentaAvatar");

    if (!uploadCuentaAvatar) {
      return fail("cuenta.api.js no expone uploadCuentaAvatar().", "No se pudo subir el avatar.");
    }

    const input = node?.matches?.('input[type="file"]')
      ? node
      : host?.querySelector?.('input[type="file"][data-cuenta-field="avatar"], input[type="file"][data-field="avatar"]');

    const file = input?.files?.[0] || null;

    if (!file) {
      return fail("Selecciona una imagen de avatar.", "Selecciona una imagen de avatar.");
    }

    saving = true;
    loading = false;
    refreshing = false;
    lastError = "";
    lastSuccess = "";
    render();

    try {
      const result = await uploadCuentaAvatar(file, { source: `${SOURCE}.avatar.upload` });

      commit(result, { loaded: true });

      saving = false;
      lastError = "";
      lastSuccess = "Avatar actualizado correctamente.";

      render({ successMessage: lastSuccess });
      return item;
    } catch (error) {
      return fail(error, "No se pudo subir el avatar.");
    }
  }

  async function deleteAvatar() {
    const deleteCuentaAvatar = getApiMethod("deleteCuentaAvatar");

    if (!deleteCuentaAvatar) {
      return fail("cuenta.api.js no expone deleteCuentaAvatar().", "No se pudo eliminar el avatar.");
    }

    saving = true;
    loading = false;
    refreshing = false;
    lastError = "";
    lastSuccess = "";
    render();

    try {
      const result = await deleteCuentaAvatar({ source: `${SOURCE}.avatar.delete` });

      commit(result, { loaded: true });

      saving = false;
      lastError = "";
      lastSuccess = "Avatar eliminado correctamente.";

      render({ successMessage: lastSuccess });
      return item;
    } catch (error) {
      return fail(error, "No se pudo eliminar el avatar.");
    }
  }

  async function handleAction(action = "", node = null) {
    const type = cleanText(action, "");

    if (!type) return false;
    if (REFRESH_ACTIONS.has(type)) return Boolean(await refresh());
    if (SAVE_ACTIONS.has(type)) return Boolean(await saveCuenta());
    if (THEME_ACTIONS.has(type)) return Boolean(await updateTheme());
    if (LANGUAGE_ACTIONS.has(type)) return Boolean(await updateLanguage());
    if (PASSWORD_ACTIONS.has(type)) return Boolean(await changePassword());
    if (UPLOAD_AVATAR_ACTIONS.has(type)) return Boolean(await uploadAvatar(node));
    if (DELETE_AVATAR_ACTIONS.has(type)) return Boolean(await deleteAvatar());

    return false;
  }

  function onClick(event) {
    if (destroyed) return;

    const node = closestFrom(event.target, ACTION_SELECTOR);

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

    const field = closestFrom(event.target, FIELD_SELECTOR);

    if (!field || !host?.contains?.(field)) return;

    form = readForm(host);
    lastSuccess = "";
  }

  function onChange(event) {
    if (destroyed) return;

    const field = closestFrom(event.target, FIELD_SELECTOR);

    if (!field || !host?.contains?.(field)) return;

    form = readForm(host);
    lastSuccess = "";
    syncNativeControlVisual(field);
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

  function getInitialItem(options = {}) {
    const contextItem = first(options.item, options.cuenta, context.item, context.cuenta, null);

    if (hasContent(contextItem)) {
      mountedFrom = "context";
      return setCuentaMemory(contextItem, { loaded: false });
    }

    const hydrated = hydrateCuentaMemory();

    if (hasContent(hydrated)) {
      mountedFrom = cuentaMemory.loaded ? "memory.loaded" : "memory.hydrated";
      return hydrated;
    }

    mountedFrom = "empty";
    return null;
  }

  function shouldLoadOnMount(options = {}) {
    if (options.force === true || options.forceRefresh === true) return true;
    if (options.refreshOnMount === true) return true;
    if (!hasContent(item)) return true;
    if (!cuentaMemory.loaded) return true;

    return false;
  }

  function mount(options = {}) {
    if (destroyed || !host) return controller;
    if (mounted) return controller;

    mounted = true;
    bind();

    item = getInitialItem(safeObject(options));
    form = safeObject(options.form);

    loading = !hasContent(item);
    refreshing = false;
    saving = false;
    lastError = "";
    lastSuccess = "";

    render();

    if (shouldLoadOnMount(options)) {
      const force = options.force === true || options.forceRefresh === true;
      const silent = hasContent(item) && !force;

      void load({
        force,
        silent,
        paint: force,
        source: silent ? `${SOURCE}.mount.background` : `${SOURCE}.mount.initial`,
      });
    }

    return controller;
  }

  function destroy({ keepDom = false } = {}) {
    if (destroyed) return true;

    destroyed = true;
    mounted = false;
    loading = false;
    refreshing = false;
    saving = false;
    loadSeq += 1;

    unbind();

    if (!keepDom) {
      clearHost(host);
      lastHTML = "";
    }

    if (host && INSTANCES.get(host) === controller) {
      INSTANCES.delete(host);
    }

    if (lastInstance === controller) {
      lastInstance = null;
    }

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
        mountedFrom,
        lastError,
        lastSuccess,
        lastRenderAt,
        memory: {
          loaded: cuentaMemory.loaded,
          loadedAt: cuentaMemory.loadedAt,
          hasItem: hasContent(cuentaMemory.item),
          userKey: cuentaMemory.key ? "***" : "",
          inFlight: Boolean(sharedLoadPromise),
        },
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

export function CuentaView(host = null, context = {}) {
  if (!isDomNode(host)) return null;

  destroyPrevious(host);

  const controller = createCuentaController(host, safeObject(context));

  INSTANCES.set(host, controller);
  lastInstance = controller;

  return controller.mount(safeObject(context));
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

export function uploadAvatar(node = null) {
  try {
    return lastInstance?.uploadAvatar?.(node) || null;
  } catch {
    return null;
  }
}

export const uploadCuentaAvatar = uploadAvatar;

export function deleteAvatar() {
  try {
    return lastInstance?.deleteAvatar?.() || null;
  } catch {
    return null;
  }
}

export const deleteCuentaAvatar = deleteAvatar;

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
      userKey: cuentaMemory.key ? "***" : "",
      inFlight: Boolean(sharedLoadPromise),
    },
  };
}

export const getDebugSnapshot = getSnapshot;

export default CuentaView;

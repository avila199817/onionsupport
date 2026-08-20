/* =========================================================
   Onion Support - Cuenta Index
   Archivo: /src/views/cuenta/index.js

   PRODUCTIVO · FOCUSED SELF-SERVICE · SWR · V8

   Cuenta V8:
   - Cache/Auth inmediata y reconciliación silenciosa.
   - Sin botón manual de actualizar ni overlays de refresco.
   - Foto, apariencia/idioma, contraseña, pagos visibles y desactivación.
   - Preferencias locales de tema/idioma aplicadas por preboot.
   - Sin selector de color, sesiones UI ni APIs compatibility/no-op.
   - Sin edición de perfil inventada ni PATCH self inexistente.
========================================================= */

import {
  CUENTA_API_VERSION,
  CUENTA_SELF_UPDATE_SUPPORTED,
  CUENTA_PASSWORD_POLICY,
  CUENTA_AVATAR_POLICY,
  normalizeCuentaDetail,
  hydrateCuentaFromCache,
  loadCuenta as loadCuentaApi,
  validateCuentaPasswordPayload,
  changePassword as changePasswordApi,
  validateCuentaAvatarFile,
  uploadCuentaAvatar as uploadCuentaAvatarApi,
  deleteCuentaAvatar as deleteCuentaAvatarApi,
  deactivateCuenta as deactivateCuentaApi,
  getCuentaApiSnapshot,
} from "./cuenta.api.js";

import {
  CUENTA_TEMPLATE_VERSION,
  CUENTA_ACTIONS,
  renderCuentaTemplate,
  renderAppearanceCard,
} from "./cuenta.template.js";

export const CUENTA_INDEX_VERSION =
  "cuenta.index.productivo.v8.canonical-surface";
export const CUENTA_VIEW_VERSION = CUENTA_INDEX_VERSION;
export const CUENTA_INDEX_SOURCE = "views.cuenta.index";

export {
  CUENTA_API_VERSION,
  CUENTA_TEMPLATE_VERSION,
  CUENTA_SELF_UPDATE_SUPPORTED,
  CUENTA_PASSWORD_POLICY,
  CUENTA_AVATAR_POLICY,
};

const INSTANCES = new WeakMap();
const REVALIDATE_MIN_AGE_MS = 60_000;
const ACTION_SELECTOR = "[data-cuenta-action], [data-action]";
const STORAGE_KEYS = Object.freeze({
  themeMode: "onion.ui.themeMode",
  locale: "onion.ui.locale",
});
const THEMES = new Set(["system", "light", "dark"]);
const LOCALES = new Set(["es", "ca", "en"]);

let lastInstance = null;
let controllerSequence = 0;

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isDomNode(value) {
  return Boolean(value && value.nodeType === 1 && typeof value.querySelector === "function");
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

function first(...values) {
  for (const value of values) {
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

function safeError(error = null, fallback = "No se pudo procesar la cuenta.") {
  return cleanText(first(
    error?.data?.message,
    error?.payload?.message,
    error?.response?.data?.message,
    error?.response?.message,
    error?.message,
    error?.error,
    error?.code,
    fallback
  ), fallback);
}

function safeErrorCode(error = null) {
  return cleanText(first(
    error?.code,
    error?.error,
    error?.data?.code,
    error?.payload?.code,
    error?.response?.code,
    ""
  ), "");
}

function normalizeTheme(value = "") {
  const key = cleanText(value, "system").toLowerCase();
  return THEMES.has(key) ? key : "system";
}

function normalizeLocale(value = "") {
  const key = cleanText(value, "es").toLowerCase().replace("_", "-");
  if (key.startsWith("ca")) return "ca";
  if (key.startsWith("en")) return "en";
  return "es";
}

function signature(value) {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return String(value ?? "");
  }
}

function nextFrame(callback) {
  if (!isBrowser()) return 0;
  return typeof window.requestAnimationFrame === "function"
    ? window.requestAnimationFrame(callback)
    : window.setTimeout(callback, 0);
}

function cancelFrame(id = 0) {
  if (!id || !isBrowser()) return;
  try { window.cancelAnimationFrame?.(id); } catch { /* noop */ }
  try { window.clearTimeout?.(id); } catch { /* noop */ }
}

function emitCuentaEvent(name = "", detail = {}) {
  if (!isBrowser() || !name) return false;
  try {
    window.dispatchEvent(new CustomEvent(name, { detail }));
    return true;
  } catch {
    return false;
  }
}

function readStorage(key = "", fallback = "") {
  if (!isBrowser()) return fallback;
  try {
    return window.localStorage?.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key = "", value = "") {
  if (!isBrowser()) return false;
  try {
    window.localStorage?.setItem(key, String(value));
    return true;
  } catch {
    return false;
  }
}

function preferenceBridge() {
  if (!isBrowser()) return null;
  const bridge = window.OnionPreferences;
  return bridge && typeof bridge === "object" ? bridge : null;
}

function fallbackApplyTheme(themeMode) {
  if (!isBrowser()) return false;
  const mode = normalizeTheme(themeMode);
  const systemDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches === true;
  const theme = mode === "system" ? (systemDark ? "dark" : "light") : mode;
  for (const node of [document.documentElement, document.body]) {
    if (!node) continue;
    node.dataset.themeMode = mode;
    node.dataset.theme = theme;
    node.classList.toggle("theme-dark", theme === "dark");
    node.classList.toggle("theme-light", theme === "light");
  }
  return true;
}

function fallbackApplyLocale(locale) {
  if (!isBrowser()) return false;
  const value = normalizeLocale(locale);
  for (const node of [document.documentElement, document.body]) {
    if (!node) continue;
    node.lang = value;
    node.dataset.locale = value;
  }
  return true;
}

function readPreferences(item = null) {
  const bridge = preferenceBridge();
  try {
    const snapshot = bridge?.getSnapshot?.() || bridge?.get?.();
    if (snapshot) {
      return {
        themeMode: normalizeTheme(snapshot.themeMode),
        locale: normalizeLocale(snapshot.locale),
      };
    }
  } catch {
    // fallback
  }
  return {
    themeMode: normalizeTheme(readStorage(STORAGE_KEYS.themeMode, "system")),
    locale: normalizeLocale(readStorage(STORAGE_KEYS.locale, first(item?.lang, item?.locale, "es"))),
  };
}

function applyThemePreference(value) {
  const themeMode = normalizeTheme(value);
  const bridge = preferenceBridge();
  try {
    if (typeof bridge?.setThemeMode === "function") return bridge.setThemeMode(themeMode);
  } catch {
    // fallback
  }
  writeStorage(STORAGE_KEYS.themeMode, themeMode);
  fallbackApplyTheme(themeMode);
  return { themeMode };
}

function applyLocalePreference(value) {
  const locale = normalizeLocale(value);
  const bridge = preferenceBridge();
  try {
    if (typeof bridge?.setLocale === "function") return bridge.setLocale(locale);
  } catch {
    // fallback
  }
  writeStorage(STORAGE_KEYS.locale, locale);
  fallbackApplyLocale(locale);
  return { locale };
}

function readField(host, name) {
  if (!host || !name) return "";
  const escaped = String(name).replace(/["\\]/g, "\\$&");
  const selector = `[data-cuenta-field="${escaped}"], [data-field="${escaped}"], [name="${escaped}"]`;
  const node = host.querySelector(selector);
  if (!node) return "";
  if (node.type === "file") return node.files?.[0] || null;
  if (node.type === "checkbox") return Boolean(node.checked);
  return node.value;
}

function clearSensitiveInputs(host) {
  if (!host) return false;
  for (const name of ["currentPassword", "newPassword", "confirmPassword", "deactivatePassword", "password"]) {
    host.querySelectorAll(`[name="${name}"], [data-cuenta-field="${name}"]`).forEach((node) => {
      if (node?.type === "password") node.value = "";
    });
  }
  return true;
}

function createCuentaController(host, context = {}) {
  const controllerId = `cuenta-${++controllerSequence}`;
  const localContext = { ...safeObject(context) };
  let destroyed = false;
  let mounted = false;
  let bound = false;
  let item = null;
  let loading = false;
  let saving = false;
  let savingAction = "";
  let error = "";
  let errorCode = "";
  let success = "";
  let deactivated = false;
  let authRefreshRequired = false;
  let preferences = readPreferences();
  let loadTask = null;
  let loadSequence = 0;
  let actionSequence = 0;
  let lastNetworkAt = 0;
  let lastRenderHtml = "";
  let renderFrame = 0;
  let pendingRender = false;

  function ownsHost() {
    return Boolean(host && host.dataset?.cuentaControllerId === controllerId);
  }

  function makeState(extra = {}) {
    return {
      loading: extra.loading ?? loading,
      refreshing: false,
      saving: extra.saving ?? saving,
      savingAction: extra.savingAction ?? savingAction,
      error: extra.error ?? error,
      errorCode: extra.errorCode ?? errorCode,
      success: extra.success ?? success,
      item: extra.item ?? item,
      deactivated,
      authRefreshRequired,
      preferences: { ...preferences },
      capabilities: {
        readSelf: true,
        changePassword: true,
        avatarUpload: true,
        avatarDelete: true,
        deactivateSelf: true,
        localThemePreference: true,
        localLanguagePreference: true,
        localAccentPreference: false,
        paymentMethodVisible: true,
        paymentMethodConfigurable: false,
      },
      selfUpdateSupported: false,
      view: { successMessage: extra.success ?? success, form: {} },
    };
  }

  function sensitiveInteractionActive() {
    if (!isBrowser() || !host) return false;
    const active = document.activeElement;
    if (!active || !host.contains(active)) return false;
    return Boolean(active.closest?.(".cuenta-form"));
  }

  function renderNow({ force = false } = {}) {
    if (destroyed || !host || !ownsHost()) return false;
    if (!force && pendingRender && sensitiveInteractionActive()) return false;
    const html = renderCuentaTemplate({ item, state: makeState() });
    if (html === lastRenderHtml && host.innerHTML === html) return false;
    const scrollTop = host.scrollTop;
    host.innerHTML = html;
    host.scrollTop = scrollTop;
    host.dataset.view = "cuenta";
    host.dataset.cuentaController = CUENTA_VIEW_VERSION;
    host.dataset.cuentaControllerId = controllerId;
    host.dataset.cuentaApi = CUENTA_API_VERSION;
    host.dataset.cuentaLoading = loading ? "true" : "false";
    host.dataset.cuentaSaving = saving ? "true" : "false";
    lastRenderHtml = html;
    pendingRender = false;
    return true;
  }

  function scheduleRender({ force = false } = {}) {
    cancelFrame(renderFrame);
    renderFrame = nextFrame(() => {
      renderFrame = 0;
      renderNow({ force });
    });
    return renderFrame;
  }

  function renderAppearanceOnly() {
    if (destroyed || !host || !ownsHost()) return false;
    const current = host.querySelector('[data-cuenta-card="appearance"]');
    if (!current) return renderNow({ force: true });
    const template = document.createElement("template");
    template.innerHTML = renderAppearanceCard(item || {}, makeState());
    const next = template.content.querySelector('[data-cuenta-card="appearance"]');
    if (!next) return false;
    current.replaceWith(next);
    const root = host.querySelector(".cuenta-view");
    if (root) {
      root.dataset.cuentaLocale = preferences.locale;
      root.dataset.cuentaThemeMode = preferences.themeMode;
    }
    return true;
  }

  function setFeedback({ nextError = "", nextErrorCode = "", nextSuccess = "", paint = true } = {}) {
    error = cleanText(nextError, "");
    errorCode = cleanText(nextErrorCode, "");
    success = cleanText(nextSuccess, "");
    if (paint) renderNow({ force: true });
    return { error, errorCode, success };
  }

  function clearFeedback() {
    error = "";
    errorCode = "";
    success = "";
  }

  function commit(nextItem) {
    if (!nextItem) return item;
    const normalized = normalizeCuentaDetail(nextItem, item || {});
    if (hasContent(normalized)) item = normalized;
    return item;
  }

  function setActionBusy(action, value) {
    saving = value === true;
    savingAction = saving ? action : "";
    if (!host) return;
    host.dataset.cuentaSaving = saving ? "true" : "false";
    const cardKey = action === "password" ? "security" : action === "deactivate" ? "deactivate" : action;
    const card = host.querySelector(`[data-cuenta-card="${cardKey}"]`);
    card?.querySelectorAll("button, input, select").forEach((node) => {
      try { node.disabled = saving; } catch { /* noop */ }
    });
  }

  async function runLoad({ force = false, silent = false } = {}) {
    if (destroyed) return item;
    const sequence = ++loadSequence;
    const hadItem = hasContent(item);
    const before = signature(item);
    if (!silent) {
      loading = !hadItem;
      clearFeedback();
      renderNow({ force: true });
    }
    try {
      const result = await loadCuentaApi({ force });
      if (destroyed || sequence !== loadSequence) return item;
      commit(result);
      lastNetworkAt = Date.now();
      loading = false;
      const changed = before !== signature(item);
      if (!silent || changed || !hadItem) {
        if (silent && sensitiveInteractionActive()) {
          pendingRender = true;
        } else {
          renderNow({ force: true });
        }
      }
      emitCuentaEvent("cuenta:loaded", { source: CUENTA_INDEX_SOURCE, silent, force, changed });
      return item;
    } catch (loadError) {
      if (destroyed || sequence !== loadSequence) return item;
      loading = false;
      if (!hadItem) {
        error = safeError(loadError, "No se pudo cargar la cuenta.");
        errorCode = safeErrorCode(loadError);
        renderNow({ force: true });
      }
      return item;
    }
  }

  function load(options = {}) {
    if (destroyed) return Promise.resolve(item);
    if (loadTask) return loadTask;
    loadTask = runLoad(options).finally(() => { loadTask = null; });
    return loadTask;
  }

  function refresh() {
    return load({ force: true, silent: true });
  }

  function maybeRevalidate() {
    if (destroyed || !mounted || loadTask || saving) return false;
    if (isBrowser() && document.visibilityState === "hidden") return false;
    const age = lastNetworkAt ? Date.now() - lastNetworkAt : Number.POSITIVE_INFINITY;
    if (age < REVALIDATE_MIN_AGE_MS) return false;
    void load({ force: false, silent: true });
    return true;
  }

  function chooseAvatar() {
    const input = host?.querySelector('input[type="file"][data-cuenta-field="avatar"]');
    if (!input || saving) return false;
    input.click?.();
    return true;
  }

  async function uploadAvatar(input = null) {
    if (destroyed || saving) return null;
    const file = input && typeof input === "object" && typeof input.type === "string" && Number.isFinite(Number(input.size))
      ? input
      : input?.files?.[0] || readField(host, "avatar");
    const validation = validateCuentaAvatarFile(file);
    if (!validation.ok) {
      setFeedback({ nextError: validation.message || "Avatar inválido.", nextErrorCode: validation.code || "INVALID_AVATAR" });
      return null;
    }
    const sequence = ++actionSequence;
    clearFeedback();
    setActionBusy("avatar", true);
    try {
      const result = await uploadCuentaAvatarApi(file, { source: `${CUENTA_INDEX_SOURCE}.avatar.upload` });
      if (destroyed || sequence !== actionSequence) return null;
      commit(result);
      setActionBusy("avatar", false);
      setFeedback({ nextSuccess: "Foto de perfil actualizada correctamente." });
      emitCuentaEvent("cuenta:avatar:updated", { source: CUENTA_INDEX_SOURCE, hasAvatar: item?.hasAvatar === true });
      return item;
    } catch (actionError) {
      if (destroyed || sequence !== actionSequence) return null;
      setActionBusy("avatar", false);
      setFeedback({ nextError: safeError(actionError, "No se pudo cambiar la foto."), nextErrorCode: safeErrorCode(actionError) });
      return null;
    }
  }

  async function deleteAvatar() {
    if (destroyed || saving) return null;
    const sequence = ++actionSequence;
    clearFeedback();
    setActionBusy("avatar", true);
    try {
      const result = await deleteCuentaAvatarApi({ source: `${CUENTA_INDEX_SOURCE}.avatar.delete` });
      if (destroyed || sequence !== actionSequence) return null;
      commit(result);
      setActionBusy("avatar", false);
      setFeedback({ nextSuccess: "Foto de perfil eliminada." });
      emitCuentaEvent("cuenta:avatar:deleted", { source: CUENTA_INDEX_SOURCE });
      return item;
    } catch (actionError) {
      if (destroyed || sequence !== actionSequence) return null;
      setActionBusy("avatar", false);
      setFeedback({ nextError: safeError(actionError, "No se pudo eliminar la foto."), nextErrorCode: safeErrorCode(actionError) });
      return null;
    }
  }

  function passwordPayload() {
    return {
      currentPassword: String(readField(host, "currentPassword") ?? ""),
      newPassword: String(readField(host, "newPassword") ?? ""),
      confirmPassword: String(readField(host, "confirmPassword") ?? ""),
    };
  }

  async function changePassword(explicitPayload = null) {
    if (destroyed || saving) return false;
    const payload = isObject(explicitPayload)
      ? {
          currentPassword: String(explicitPayload.currentPassword ?? ""),
          newPassword: String(explicitPayload.newPassword ?? ""),
          confirmPassword: String(explicitPayload.confirmPassword ?? ""),
        }
      : passwordPayload();
    const validation = validateCuentaPasswordPayload(payload);
    if (!validation.ok) {
      clearSensitiveInputs(host);
      setFeedback({ nextError: validation.message || "Contraseña inválida.", nextErrorCode: validation.code || "INVALID_PASSWORD" });
      return false;
    }
    const sequence = ++actionSequence;
    clearFeedback();
    setActionBusy("password", true);
    try {
      const result = await changePasswordApi(payload, { source: `${CUENTA_INDEX_SOURCE}.password` });
      if (destroyed || sequence !== actionSequence) return false;
      if (result?.item) commit(result.item);
      authRefreshRequired = result?.authRefreshRequired === true;
      clearSensitiveInputs(host);
      setActionBusy("password", false);
      setFeedback({
        nextSuccess: authRefreshRequired
          ? "Contraseña actualizada. La sesión puede requerir volver a iniciar sesión."
          : "Contraseña actualizada correctamente.",
      });
      emitCuentaEvent("cuenta:password:changed", { source: CUENTA_INDEX_SOURCE, authRefreshRequired });
      return true;
    } catch (actionError) {
      if (destroyed || sequence !== actionSequence) return false;
      clearSensitiveInputs(host);
      setActionBusy("password", false);
      setFeedback({ nextError: safeError(actionError, "No se pudo cambiar la contraseña."), nextErrorCode: safeErrorCode(actionError) });
      return false;
    }
  }

  async function deactivateAccount(explicitPayload = null) {
    if (destroyed || saving) return false;
    const password = isObject(explicitPayload)
      ? String(explicitPayload.password ?? "")
      : String(first(readField(host, "deactivatePassword"), readField(host, "password"), "") ?? "");
    if (!password.trim()) {
      setFeedback({ nextError: "Introduce tu contraseña para confirmar la desactivación.", nextErrorCode: "PASSWORD_REQUIRED" });
      return false;
    }
    const sequence = ++actionSequence;
    clearFeedback();
    setActionBusy("deactivate", true);
    try {
      const result = await deactivateCuentaApi({ password }, { source: `${CUENTA_INDEX_SOURCE}.deactivate` });
      if (destroyed || sequence !== actionSequence) return false;
      const nextItem = result?.item || result?.user || result?.account || result?.profile || null;
      if (nextItem) commit(nextItem);
      deactivated = result?.deactivated === true || result?.alreadyDisabled === true;
      authRefreshRequired = result?.loggedOut === true || deactivated;
      clearSensitiveInputs(host);
      setActionBusy("deactivate", false);
      setFeedback({ nextSuccess: result?.alreadyDisabled ? "La cuenta ya estaba desactivada." : "Cuenta desactivada correctamente." });
      emitCuentaEvent("cuenta:deactivated", {
        source: CUENTA_INDEX_SOURCE,
        deactivated,
        alreadyDisabled: result?.alreadyDisabled === true,
        loggedOut: result?.loggedOut === true,
      });
      return true;
    } catch (actionError) {
      if (destroyed || sequence !== actionSequence) return false;
      clearSensitiveInputs(host);
      setActionBusy("deactivate", false);
      setFeedback({ nextError: safeError(actionError, "No se pudo desactivar la cuenta."), nextErrorCode: safeErrorCode(actionError) });
      return false;
    }
  }

  function setTheme(value = "system") {
    preferences.themeMode = normalizeTheme(value);
    applyThemePreference(preferences.themeMode);
    renderAppearanceOnly();
    emitCuentaEvent("cuenta:preferences:changed", { source: CUENTA_INDEX_SOURCE, preferences: { ...preferences } });
    return preferences.themeMode;
  }

  function setLocale(value = "es") {
    preferences.locale = normalizeLocale(value);
    applyLocalePreference(preferences.locale);
    renderNow({ force: true });
    emitCuentaEvent("cuenta:preferences:changed", { source: CUENTA_INDEX_SOURCE, preferences: { ...preferences } });
    return preferences.locale;
  }

  function handleClick(event) {
    if (destroyed) return;
    const node = event.target?.closest?.(ACTION_SELECTOR);
    if (!node || !host.contains(node) || node.disabled || node.getAttribute("aria-disabled") === "true") return;
    const action = cleanText(first(node.dataset?.cuentaAction, node.dataset?.action, ""), "");
    if (!action) return;
    if ([CUENTA_ACTIONS.CHOOSE_AVATAR, CUENTA_ACTIONS.DELETE_AVATAR, CUENTA_ACTIONS.SET_THEME, CUENTA_ACTIONS.RETRY].includes(action)) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (action === CUENTA_ACTIONS.CHOOSE_AVATAR) { chooseAvatar(); return; }
    if (action === CUENTA_ACTIONS.DELETE_AVATAR) { void deleteAvatar(); return; }
    if (action === CUENTA_ACTIONS.SET_THEME) { setTheme(node.dataset.value || "system"); return; }
    if (action === CUENTA_ACTIONS.RETRY) void load({ force: true, silent: false });
  }

  function handleChange(event) {
    const target = event.target;
    if (!target || !host.contains(target)) return;
    const field = cleanText(first(target.dataset?.cuentaField, target.dataset?.field, target.name, ""), "");
    const action = cleanText(first(target.dataset?.cuentaAction, target.dataset?.action, ""), "");
    if (field === "avatar" && target.type === "file" && target.files?.[0]) {
      void uploadAvatar(target.files[0]);
      return;
    }
    if (field === "locale" || action === CUENTA_ACTIONS.SET_LOCALE) setLocale(target.value || "es");
  }

  function handleSubmit(event) {
    const form = event.target?.closest?.("form");
    if (!form || !host.contains(form)) return;
    const action = cleanText(first(form.dataset?.cuentaAction, form.dataset?.action, ""), "");
    if (![CUENTA_ACTIONS.CHANGE_PASSWORD, CUENTA_ACTIONS.DEACTIVATE].includes(action)) return;
    event.preventDefault();
    event.stopPropagation();
    if (action === CUENTA_ACTIONS.CHANGE_PASSWORD) void changePassword();
    if (action === CUENTA_ACTIONS.DEACTIVATE) void deactivateAccount();
  }

  function handleFocusOut() {
    if (!pendingRender) return;
    nextFrame(() => {
      if (!destroyed && pendingRender && !sensitiveInteractionActive()) renderNow({ force: true });
    });
  }

  function handleExternalPreferences() {
    preferences = readPreferences(item);
    renderAppearanceOnly();
  }

  function handleResume() {
    maybeRevalidate();
  }

  function bind() {
    if (bound || !host) return false;
    host.addEventListener("click", handleClick);
    host.addEventListener("change", handleChange);
    host.addEventListener("submit", handleSubmit);
    host.addEventListener("focusout", handleFocusOut);
    if (isBrowser()) {
      window.addEventListener("focus", handleResume);
      window.addEventListener("onion:preferences:changed", handleExternalPreferences);
      document.addEventListener("visibilitychange", handleResume);
    }
    bound = true;
    return true;
  }

  function unbind() {
    if (!bound) return false;
    host?.removeEventListener("click", handleClick);
    host?.removeEventListener("change", handleChange);
    host?.removeEventListener("submit", handleSubmit);
    host?.removeEventListener("focusout", handleFocusOut);
    if (isBrowser()) {
      window.removeEventListener("focus", handleResume);
      window.removeEventListener("onion:preferences:changed", handleExternalPreferences);
      document.removeEventListener("visibilitychange", handleResume);
    }
    bound = false;
    return true;
  }

  function getInitialItem(options = {}) {
    const contextItem = first(options.item, options.cuenta, localContext.item, localContext.cuenta, null);
    if (hasContent(contextItem)) {
      const normalized = normalizeCuentaDetail(contextItem, {});
      if (hasContent(normalized)) return normalized;
    }
    try {
      const cached = hydrateCuentaFromCache();
      return hasContent(cached) ? cached : null;
    } catch {
      return null;
    }
  }

  function mount(options = {}) {
    if (destroyed || mounted || !host) return controller;
    mounted = true;
    host.dataset.cuentaControllerId = controllerId;
    bind();
    item = getInitialItem(safeObject(options));
    preferences = readPreferences(item);
    loading = !hasContent(item);
    renderNow({ force: true });
    if (item) {
      void load({ force: false, silent: true });
    } else {
      void load({ force: false, silent: false });
    }
    return controller;
  }

  function resetPresentation() {
    item = null;
    loading = false;
    saving = false;
    savingAction = "";
    error = "";
    errorCode = "";
    success = "";
    deactivated = false;
    authRefreshRequired = false;
    lastRenderHtml = "";
    if (mounted && !destroyed) renderNow({ force: true });
    return true;
  }

  function destroy({ keepDom = false } = {}) {
    if (destroyed) return true;
    destroyed = true;
    mounted = false;
    loadSequence += 1;
    actionSequence += 1;
    cancelFrame(renderFrame);
    renderFrame = 0;
    unbind();
    clearSensitiveInputs(host);
    if (!keepDom && ownsHost()) host.replaceChildren();
    if (host && INSTANCES.get(host) === controller) INSTANCES.delete(host);
    if (lastInstance === controller) lastInstance = null;
    return true;
  }

  function getSnapshot() {
    return {
      version: CUENTA_VIEW_VERSION,
      apiVersion: CUENTA_API_VERSION,
      templateVersion: CUENTA_TEMPLATE_VERSION,
      mounted,
      destroyed,
      loading,
      saving,
      savingAction,
      hasItem: hasContent(item),
      lastNetworkAt,
      lastError: error,
      lastErrorCode: errorCode,
      lastSuccess: success,
      deactivated,
      authRefreshRequired,
      preferences: { ...preferences },
      payment: { visible: true, configurable: false, source: "placeholder" },
      architecture: {
        focusedSelfService: true,
        staleWhileRevalidate: true,
        silentRevalidation: true,
        resumeRevalidation: true,
        manualRefreshUi: false,
        pageRefreshOverlay: false,
        accentPreferenceUi: false,
        paymentMethodUi: true,
        paymentMethodConfigurable: false,
        sessionsUi: false,
        activityUi: false,
        privacyUi: false,
        administrativeProfileUi: false,
        localPreferences: true,
        prebootPreferences: Boolean(preferenceBridge()),
        directHttp: false,
        apiBoundary: true,
        selfProfileUpdateNetwork: false,
        passwordStoredInState: false,
        fileStoredInState: false,
      },
      api: getCuentaApiSnapshot(),
    };
  }

  const controller = {
    version: CUENTA_VIEW_VERSION,
    apiVersion: CUENTA_API_VERSION,
    templateVersion: CUENTA_TEMPLATE_VERSION,
    mount,
    destroy,
    unmount: destroy,
    cleanup: destroy,
    dispose: destroy,
    load,
    refresh,
    reload: refresh,
    chooseAvatar,
    uploadAvatar,
    uploadCuentaAvatar: uploadAvatar,
    deleteAvatar,
    deleteCuentaAvatar: deleteAvatar,
    changePassword,
    updatePassword: changePassword,
    savePassword: changePassword,
    deactivateAccount,
    deactivateCuenta: deactivateAccount,
    setTheme,
    updateTheme: setTheme,
    updateCuentaTheme: setTheme,
    setCuentaTheme: setTheme,
    setLocale,
    updateLanguage: setLocale,
    updateCuentaLanguage: setLocale,
    setLanguage: setLocale,
    setCuentaLanguage: setLocale,
    resetPresentation,
    getItem: () => item,
    getCuenta: () => item,
    getState: getSnapshot,
    getSnapshot,
    getDebugSnapshot: getSnapshot,
  };

  return controller;
}

function destroyPrevious(host) {
  const previous = host ? INSTANCES.get(host) : null;
  if (!previous?.destroy) return false;
  previous.destroy({ keepDom: true });
  return true;
}

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
  try { return Boolean(lastInstance?.destroy?.()); } catch { return false; }
}
export const unmount = destroy;
export const cleanup = destroy;
export const dispose = destroy;

export function refresh() {
  try { return lastInstance?.refresh?.() || null; } catch { return null; }
}
export const reload = refresh;
export const loadCuenta = refresh;
export const refreshCuenta = refresh;

export function updateTheme(value = "system") {
  try { return lastInstance?.setTheme?.(value) ?? false; } catch { return false; }
}
export const updateCuentaTheme = updateTheme;
export const setTheme = updateTheme;
export const setCuentaTheme = updateTheme;

export function updateLanguage(value = "es") {
  try { return lastInstance?.setLocale?.(value) ?? false; } catch { return false; }
}
export const updateCuentaLanguage = updateLanguage;
export const setLanguage = updateLanguage;
export const setCuentaLanguage = updateLanguage;

export function changePassword(payload = null) {
  try { return lastInstance?.changePassword?.(payload) || null; } catch { return null; }
}
export const updatePassword = changePassword;
export const savePassword = changePassword;

export function uploadAvatar(input = null) {
  try { return lastInstance?.uploadAvatar?.(input) || null; } catch { return null; }
}
export const uploadCuentaAvatar = uploadAvatar;

export function deleteAvatar() {
  try { return lastInstance?.deleteAvatar?.() || null; } catch { return null; }
}
export const deleteCuentaAvatar = deleteAvatar;

export function deactivateAccount(payload = null) {
  try { return lastInstance?.deactivateAccount?.(payload) || null; } catch { return null; }
}
export const deactivateCuenta = deactivateAccount;

export function getItem() {
  try { return lastInstance?.getItem?.() || null; } catch { return null; }
}
export const getCuenta = getItem;

export function clearCuentaViewCache() {
  try {
    lastInstance?.resetPresentation?.();
    return true;
  } catch {
    return false;
  }
}

export function getSnapshot() {
  if (lastInstance?.getSnapshot) return lastInstance.getSnapshot();
  return {
    version: CUENTA_VIEW_VERSION,
    apiVersion: CUENTA_API_VERSION,
    templateVersion: CUENTA_TEMPLATE_VERSION,
    mounted: false,
    destroyed: false,
    loading: false,
    saving: false,
    hasItem: false,
    preferences: readPreferences(),
    payment: { visible: true, configurable: false, source: "placeholder" },
    architecture: {
      focusedSelfService: true,
      staleWhileRevalidate: true,
      manualRefreshUi: false,
      accentPreferenceUi: false,
      paymentMethodUi: true,
      paymentMethodConfigurable: false,
      localPreferences: true,
      directHttp: false,
      apiBoundary: true,
    },
    api: getCuentaApiSnapshot(),
  };
}

export const getDebugSnapshot = getSnapshot;
export default CuentaView;

/* =========================================================
   Onion SPA - Cuenta Bindings
   Archivo: src/views/cuenta/cuenta.bindings.js

   EXTREME PRO SYSTEM · DOM BINDINGS · FULL PATCH 14/10
   NATIVE-FIRST EVENTS · CAPTURE SAFE · VIEW COMPAT READY

   RESPONSABILIDADES:
   - bind DOM robusto por delegación
   - refresh / retry
   - save preferencias
   - toggle theme
   - change language
   - change password
   - open cuenta modal
   - cleanup sólido por scope
   - compatibilidad con cuentaView.js
   - compatibilidad con template premium
   - compatibilidad con bridges window.OnionCuenta / CuentaView
   - fallback total por IDs directos

   FIX CRÍTICO:
   - addEventListener nativo siempre
   - captura en click para evitar que otros handlers se lo traguen
   - normalización de acciones
   - root seguro
   - diagnóstico por evento cuenta:bindings:ready
========================================================= */

import { AppCore } from "../../core/index.js";

/* =========================================================
   CONSTANTS
========================================================= */

export const CUENTA_BINDINGS_SCOPE = "view:cuenta";
export const CUENTA_BINDINGS_VERSION = "14.0.0";

const DEFAULT_SCOPE = CUENTA_BINDINGS_SCOPE;
const PASSWORD_MIN_LENGTH = 8;

const BIND_OPTIONS = {
  capture: true,
  passive: false,
};

const ACTIONS = {
  refresh: [
    "refresh-cuenta",
    "reload-cuenta",
    "cuenta-refresh",
    "refresh",
    "reload",
    "retry",
    "retry-cuenta",
  ],

  save: [
    "save-cuenta",
    "update-cuenta",
    "cuenta-save",
    "save",
    "guardar",
    "preferences-save",
    "save-preferences",
  ],

  theme: [
    "toggle-theme",
    "change-theme",
    "update-theme",
    "cuenta-theme",
    "theme-toggle",
    "set-theme",
  ],

  language: [
    "change-language",
    "update-language",
    "apply-language",
    "cuenta-language",
    "language-change",
    "set-language",
  ],

  password: [
    "change-password",
    "update-password",
    "cuenta-password",
    "password-change",
  ],

  open: [
    "open-cuenta-modal",
    "open-modal",
    "cuenta-detail",
    "detail",
    "view-cuenta",
    "open-cuenta",
  ],
};

const DIRECT_IDS = {
  refresh: [
    "cuenta-refresh-btn",
    "cuenta-retry-btn",
  ],

  save: [
    "cuenta-save-btn",
  ],

  password: [
    "cuenta-password-btn",
  ],

  open: [
    "cuenta-open-modal-btn",
  ],
};

const INPUT_SELECTORS = {
  name: [
    '[data-role="cuenta-name-input"]',
    "#cuenta-name-input",
    '[data-cuenta-field="name"]',
    '[data-field="name"]',
    '[name="name"]',
    '[name="displayName"]',
  ].join(","),

  phone: [
    '[data-role="cuenta-phone-input"]',
    "#cuenta-phone-input",
    '[data-cuenta-field="phone"]',
    '[data-field="phone"]',
    '[name="phone"]',
    '[name="telefono"]',
  ].join(","),

  email: [
    '[data-role="cuenta-email-input"]',
    "#cuenta-email-input",
    '[data-cuenta-field="email"]',
    '[data-field="email"]',
    '[name="email"]',
  ].join(","),

  username: [
    '[data-role="cuenta-username-input"]',
    "#cuenta-username-input",
    '[data-cuenta-field="username"]',
    '[data-field="username"]',
    '[name="username"]',
  ].join(","),

  darkMode: [
    '[data-role="cuenta-darkmode-input"]',
    "#cuenta-darkmode-input",
    '[data-cuenta-field="darkMode"]',
    '[data-field="darkMode"]',
    '[name="darkMode"]',
    '[name="theme"]',
  ].join(","),

  privacyMode: [
    '[data-role="cuenta-privacymode-input"]',
    '[data-role="cuenta-privacy-input"]',
    "#cuenta-privacymode-input",
    "#cuenta-privacy-input",
    '[data-cuenta-field="privacyMode"]',
    '[data-field="privacyMode"]',
    '[name="privacyMode"]',
  ].join(","),

  language: [
    '[data-role="cuenta-language-select"]',
    "#cuenta-language-select",
    '[data-cuenta-field="lang"]',
    '[data-field="lang"]',
    '[data-field="language"]',
    '[name="lang"]',
    '[name="language"]',
  ].join(","),

  currentPassword: [
    '[data-role="cuenta-current-password"]',
    "#cuenta-current-password",
    '[data-cuenta-field="currentPassword"]',
    '[data-field="currentPassword"]',
    '[name="currentPassword"]',
  ].join(","),

  newPassword: [
    '[data-role="cuenta-new-password"]',
    "#cuenta-new-password",
    '[data-cuenta-field="newPassword"]',
    '[data-field="newPassword"]',
    '[name="newPassword"]',
  ].join(","),

  confirmPassword: [
    '[data-role="cuenta-confirm-password"]',
    "#cuenta-confirm-password",
    '[data-cuenta-field="confirmPassword"]',
    '[data-field="confirmPassword"]',
    '[name="confirmPassword"]',
  ].join(","),
};

const ROOT_SELECTORS = [
  "#view-container",
  '[data-view-container]',
  '[data-view="cuenta"]',
  ".cuenta-view",
  ".content-wrapper",
].join(",");

const DISABLED_SELECTOR = [
  "[disabled]",
  "[aria-disabled='true']",
  "[data-disabled='true']",
  ".is-disabled",
].join(",");

const fallbackCleanups = new Map();
const busyKeys = new Set();

let reloadScheduled = false;

/* =========================================================
   SAFE HELPERS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text || fallback;
}

function safeObject(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : fallback;
}

function first(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;

    return value;
  }

  return null;
}

function normalizeKey(value = "") {
  return safeText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^\w]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .trim();
}

function normalizeAction(value = "") {
  return normalizeKey(value).replace(/_/g, "-");
}

function normalizeActionSet(values = []) {
  return new Set(values.map(normalizeAction).filter(Boolean));
}

const ACTION_SETS = {
  refresh: normalizeActionSet(ACTIONS.refresh),
  save: normalizeActionSet(ACTIONS.save),
  theme: normalizeActionSet(ACTIONS.theme),
  language: normalizeActionSet(ACTIONS.language),
  password: normalizeActionSet(ACTIONS.password),
  open: normalizeActionSet(ACTIONS.open),
};

function normalizeBoolean(value = undefined, fallback = false) {
  if (typeof value === "boolean") return value;

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
    return value !== 0;
  }

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

function normalizeLang(value = "es") {
  const key = normalizeKey(value);

  if (["en", "eng", "english", "en_us", "en_gb"].includes(key)) {
    return "en";
  }

  if (["ca", "cat", "catala", "catalan", "ca_es"].includes(key)) {
    return "ca";
  }

  return "es";
}

function normalizeThemeFromDarkMode(darkMode = false) {
  return Boolean(darkMode) ? "dark" : "light";
}

function safeWarn(...args) {
  try {
    AppCore?.utils?.warn?.("[CuentaBindings]", ...args);
    return;
  } catch {}

  try {
    console.warn("[CuentaBindings]", ...args);
  } catch {}
}

function showToast(message = "", type = "info") {
  const text = safeText(message, "");
  if (!text) return false;

  try {
    if (typeof AppCore?.toast?.[type] === "function") {
      AppCore.toast[type](text);
      return true;
    }
  } catch {}

  try {
    if (typeof AppCore?.toast?.show === "function") {
      AppCore.toast.show(text, type);
      return true;
    }
  } catch {}

  try {
    if (typeof AppCore?.ui?.toast?.show === "function") {
      AppCore.ui.toast.show({
        message: text,
        type,
      });
      return true;
    }
  } catch {}

  try {
    if (isBrowser() && typeof window.Toast?.show === "function") {
      window.Toast.show({
        message: text,
        type,
      });
      return true;
    }
  } catch {}

  return false;
}

function safeEmit(event = "", payload = {}) {
  const eventName = safeText(event, "");
  if (!eventName) return false;

  let emitted = false;

  try {
    AppCore?.events?.emit?.(eventName, payload);
    emitted = true;
  } catch {}

  try {
    if (isBrowser()) {
      window.dispatchEvent(
        new CustomEvent(eventName, {
          detail: payload,
        })
      );

      emitted = true;
    }
  } catch {}

  return emitted;
}

/* =========================================================
   CLEANUP
========================================================= */

function resolveScopeName(scope = DEFAULT_SCOPE) {
  return safeText(scope, DEFAULT_SCOPE);
}

function addFallbackCleanup(scopeName = DEFAULT_SCOPE, cleanup) {
  const finalScope = resolveScopeName(scopeName);

  if (typeof cleanup !== "function") return;

  if (!fallbackCleanups.has(finalScope)) {
    fallbackCleanups.set(finalScope, new Set());
  }

  fallbackCleanups.get(finalScope).add(cleanup);
}

function runFallbackCleanup(scopeName = DEFAULT_SCOPE) {
  const finalScope = resolveScopeName(scopeName);
  const cleanups = fallbackCleanups.get(finalScope);

  if (!cleanups) return;

  cleanups.forEach((cleanup) => {
    try {
      cleanup();
    } catch {}
  });

  fallbackCleanups.delete(finalScope);
}

function runScopeCleanup(scopeName = DEFAULT_SCOPE) {
  const finalScope = resolveScopeName(scopeName);

  try {
    AppCore?.cleanup?.run?.(finalScope);
  } catch {}

  runFallbackCleanup(finalScope);
}

function bindDomEvent({
  scopeName = DEFAULT_SCOPE,
  target = null,
  eventName = "",
  handler = null,
  options = undefined,
} = {}) {
  if (!target || !eventName || typeof handler !== "function") {
    return false;
  }

  try {
    target.addEventListener(eventName, handler, options);

    addFallbackCleanup(scopeName, () => {
      try {
        target.removeEventListener(eventName, handler, options);
      } catch {}
    });

    return true;
  } catch (error) {
    safeWarn("No se pudo enganchar evento DOM:", eventName, error);
    return false;
  }
}

function bindBusEvent({
  scopeName = DEFAULT_SCOPE,
  eventName = "",
  handler = null,
} = {}) {
  if (!eventName || typeof handler !== "function") return false;

  let bound = false;

  try {
    if (typeof AppCore?.events?.on === "function") {
      AppCore.events.on(eventName, handler);
      bound = true;

      addFallbackCleanup(scopeName, () => {
        try {
          AppCore?.events?.off?.(eventName, handler);
        } catch {}
      });
    }
  } catch {}

  try {
    if (isBrowser()) {
      const windowHandler = (event) => handler(event);

      window.addEventListener(eventName, windowHandler);
      bound = true;

      addFallbackCleanup(scopeName, () => {
        try {
          window.removeEventListener(eventName, windowHandler);
        } catch {}
      });
    }
  } catch {}

  return bound;
}

/* =========================================================
   DOM HELPERS
========================================================= */

function getContainer(customRoot = null) {
  if (customRoot && typeof customRoot.querySelector === "function") {
    return customRoot;
  }

  if (!isBrowser()) return null;

  try {
    return (
      AppCore?.dom?.viewContainer ||
      document.getElementById("view-container") ||
      document.querySelector(ROOT_SELECTORS) ||
      document
    );
  } catch {
    return null;
  }
}

function isElementInsideRoot(root, element) {
  try {
    if (!root || !element) return false;
    if (root === document) return true;
    return root.contains(element);
  } catch {
    return true;
  }
}

function closestInside(root, target, selector = "") {
  if (!target || !selector || typeof target.closest !== "function") {
    return null;
  }

  let match = null;

  try {
    match = target.closest(selector);
  } catch {
    match = null;
  }

  if (!match || !isElementInsideRoot(root, match)) {
    return null;
  }

  return match;
}

function isDisabledElement(element = null) {
  if (!element) return false;

  try {
    if (element.matches?.(DISABLED_SELECTOR)) return true;
  } catch {}

  try {
    if (element.closest?.(DISABLED_SELECTOR)) return true;
  } catch {}

  return false;
}

function getActionName(element = null) {
  if (!element) return "";

  return safeText(
    first(
      element.dataset?.cuentaAction,
      element.dataset?.action,
      element.getAttribute?.("data-cuenta-action"),
      element.getAttribute?.("data-action")
    ),
    ""
  );
}

function findDirectIdElement(root, target, ids = []) {
  if (!target || !ids?.length) return null;

  for (const id of ids) {
    try {
      const match = target.closest?.(`#${id}`);

      if (match && isElementInsideRoot(root, match) && !isDisabledElement(match)) {
        return match;
      }
    } catch {}
  }

  return null;
}

function getActionElement(root, target, actionSet, ids = []) {
  const direct = findDirectIdElement(root, target, ids);

  if (direct) return direct;

  const actionElement = closestInside(
    root,
    target,
    "[data-action], [data-cuenta-action]"
  );

  if (!actionElement) return null;
  if (isDisabledElement(actionElement)) return null;

  const action = normalizeAction(getActionName(actionElement));

  if (!action || !actionSet.has(action)) return null;

  return actionElement;
}

function getField(root, selector = "") {
  if (!selector || !isBrowser()) return null;

  try {
    return root?.querySelector?.(selector) || document.querySelector?.(selector) || null;
  } catch {
    return null;
  }
}

function readInputText(input = null, fallback = "") {
  if (!input) return fallback;

  if ("value" in input) {
    return safeText(input.value, fallback);
  }

  return safeText(input.textContent, fallback);
}

function readInputBoolean(input = null, fallback = false) {
  if (!input) return Boolean(fallback);

  if (typeof input.checked === "boolean") {
    return Boolean(input.checked);
  }

  return normalizeBoolean(
    first(
      input.value,
      input.dataset?.value,
      input.getAttribute?.("value"),
      input.getAttribute?.("aria-checked")
    ),
    fallback
  );
}

function readCuentaForm(root = getContainer()) {
  const nameInput = getField(root, INPUT_SELECTORS.name);
  const phoneInput = getField(root, INPUT_SELECTORS.phone);
  const emailInput = getField(root, INPUT_SELECTORS.email);
  const usernameInput = getField(root, INPUT_SELECTORS.username);
  const darkInput = getField(root, INPUT_SELECTORS.darkMode);
  const privacyInput = getField(root, INPUT_SELECTORS.privacyMode);
  const languageInput = getField(root, INPUT_SELECTORS.language);

  const name = readInputText(nameInput, "");
  const phone = readInputText(phoneInput, "");
  const email = readInputText(emailInput, "");
  const username = readInputText(usernameInput, "");

  const darkMode = readInputBoolean(darkInput, false);
  const privacyMode = readInputBoolean(privacyInput, false);

  const lang = normalizeLang(
    first(
      languageInput?.value,
      languageInput?.dataset?.value,
      languageInput?.getAttribute?.("value"),
      "es"
    )
  );

  const theme = normalizeThemeFromDarkMode(darkMode);

  return {
    name,
    displayName: name,
    fullName: name,
    nombre: name,

    phone,
    telefono: phone,
    mobile: phone,

    email,
    username,

    darkMode,
    privacyMode,

    lang,
    language: lang,
    locale: lang,

    theme,
    mode: theme,
    appearance: theme,
  };
}

function readPasswordForm(root = getContainer()) {
  const currentPasswordInput = getField(root, INPUT_SELECTORS.currentPassword);
  const newPasswordInput = getField(root, INPUT_SELECTORS.newPassword);
  const confirmPasswordInput = getField(root, INPUT_SELECTORS.confirmPassword);

  return {
    currentPassword: safeText(currentPasswordInput?.value, ""),
    newPassword: safeText(newPasswordInput?.value, ""),
    confirmPassword: safeText(confirmPasswordInput?.value, ""),

    currentPasswordInput,
    newPasswordInput,
    confirmPasswordInput,
  };
}

function clearPasswordFields(root = getContainer()) {
  [
    INPUT_SELECTORS.currentPassword,
    INPUT_SELECTORS.newPassword,
    INPUT_SELECTORS.confirmPassword,
  ].forEach((selector) => {
    try {
      const input = getField(root, selector);

      if (input && "value" in input) {
        input.value = "";
      }
    } catch {}
  });
}

function setElementBusy(element, busy = false) {
  if (!element) return;

  try {
    element.setAttribute("aria-busy", busy ? "true" : "false");
  } catch {}

  try {
    element.classList?.toggle?.("is-loading", Boolean(busy));
  } catch {}

  const tagName = safeText(element.tagName, "").toLowerCase();

  if (["button", "input", "select", "textarea"].includes(tagName)) {
    try {
      element.disabled = Boolean(busy);
    } catch {}
  }
}

async function runBusy(key = "", element = null, task = null) {
  const finalKey = safeText(key, "");

  if (!finalKey || typeof task !== "function") return null;

  if (busyKeys.has(finalKey)) {
    return null;
  }

  busyKeys.add(finalKey);
  setElementBusy(element, true);

  try {
    return await task();
  } finally {
    busyKeys.delete(finalKey);
    setElementBusy(element, false);
  }
}

/* =========================================================
   CALLBACK COMPAT
========================================================= */

async function callCandidates(candidates = []) {
  let lastError = null;

  for (const attempt of candidates) {
    if (typeof attempt !== "function") continue;

    try {
      const result = await attempt();

      if (result !== undefined) {
        return result;
      }
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) throw lastError;

  return null;
}

function getGlobalCuentaApi() {
  if (!isBrowser()) return {};

  try {
    return {
      OnionCuenta: window.OnionCuenta || null,
      CuentaView: window.CuentaView || null,
      OnionCuentaView: window.OnionCuentaView || null,
      OnionCuentaPassword: window.OnionCuentaPassword || null,
    };
  } catch {
    return {};
  }
}

async function callFlexibleReload({
  reload,
  loadCuenta,
  force = true,
  source = "bindings",
} = {}) {
  const payload = {
    force,
    asRefresh: true,
    silent: false,
    source,
  };

  const globalApi = getGlobalCuentaApi();

  return callCandidates([
    typeof reload === "function" ? () => reload(payload) : null,
    typeof reload === "function" ? () => reload(force) : null,

    typeof loadCuenta === "function" ? () => loadCuenta(payload) : null,
    typeof loadCuenta === "function" ? () => loadCuenta({ force }) : null,

    typeof globalApi.OnionCuenta?.reload === "function" && globalApi.OnionCuenta.reload !== reload
      ? () => globalApi.OnionCuenta.reload(payload)
      : null,

    typeof globalApi.CuentaView?.reload === "function" && globalApi.CuentaView.reload !== reload
      ? () => globalApi.CuentaView.reload(payload)
      : null,

    typeof globalApi.OnionCuentaView?.reload === "function" && globalApi.OnionCuentaView.reload !== reload
      ? () => globalApi.OnionCuentaView.reload(payload)
      : null,
  ]);
}

async function callFlexibleSave({
  saveCuenta,
  updateCuenta,
  payload = {},
} = {}) {
  const body = safeObject(payload);
  const globalApi = getGlobalCuentaApi();

  const result = await callCandidates([
    typeof saveCuenta === "function" ? () => saveCuenta(body) : null,

    typeof updateCuenta === "function" && updateCuenta !== saveCuenta
      ? () => updateCuenta(body)
      : null,

    typeof globalApi.OnionCuenta?.saveCuenta === "function" && globalApi.OnionCuenta.saveCuenta !== saveCuenta
      ? () => globalApi.OnionCuenta.saveCuenta(body)
      : null,

    typeof globalApi.OnionCuenta?.save === "function" && globalApi.OnionCuenta.save !== saveCuenta
      ? () => globalApi.OnionCuenta.save(body)
      : null,

    typeof globalApi.CuentaView?.saveCuenta === "function" && globalApi.CuentaView.saveCuenta !== saveCuenta
      ? () => globalApi.CuentaView.saveCuenta(body)
      : null,
  ]);

  if (result !== null) return result;

  safeEmit("cuenta:update-preferences", body);
  safeEmit("cuenta:modal:update-preferences", body);

  return null;
}

async function callFlexibleTheme({
  updateCuentaTheme,
  updateCuenta,
  darkMode = true,
  payload = {},
} = {}) {
  const nextDarkMode = Boolean(darkMode);
  const theme = nextDarkMode ? "dark" : "light";

  const body = {
    ...safeObject(payload),
    darkMode: nextDarkMode,
    theme,
    mode: theme,
    appearance: theme,
  };

  const globalApi = getGlobalCuentaApi();

  const result = await callCandidates([
    typeof updateCuentaTheme === "function"
      ? () => updateCuentaTheme(nextDarkMode)
      : null,

    typeof updateCuentaTheme === "function"
      ? () => updateCuentaTheme(body)
      : null,

    typeof updateCuenta === "function"
      ? () => updateCuenta(body)
      : null,

    typeof globalApi.OnionCuenta?.updateTheme === "function" && globalApi.OnionCuenta.updateTheme !== updateCuentaTheme
      ? () => globalApi.OnionCuenta.updateTheme(nextDarkMode)
      : null,

    typeof globalApi.OnionCuenta?.updateCuentaTheme === "function" && globalApi.OnionCuenta.updateCuentaTheme !== updateCuentaTheme
      ? () => globalApi.OnionCuenta.updateCuentaTheme(body)
      : null,

    typeof globalApi.CuentaView?.updateTheme === "function" && globalApi.CuentaView.updateTheme !== updateCuentaTheme
      ? () => globalApi.CuentaView.updateTheme(nextDarkMode)
      : null,
  ]);

  if (result !== null) return result;

  safeEmit("cuenta:modal:update-theme", body);
  safeEmit("cuenta:theme:update", body);

  return null;
}

async function callFlexibleLanguage({
  updateCuentaLanguage,
  updateCuenta,
  lang = "es",
  payload = {},
} = {}) {
  const nextLang = normalizeLang(lang);

  const body = {
    ...safeObject(payload),
    lang: nextLang,
    language: nextLang,
    locale: nextLang,
  };

  const globalApi = getGlobalCuentaApi();

  const result = await callCandidates([
    typeof updateCuentaLanguage === "function"
      ? () => updateCuentaLanguage(nextLang)
      : null,

    typeof updateCuentaLanguage === "function"
      ? () => updateCuentaLanguage(body)
      : null,

    typeof updateCuenta === "function"
      ? () => updateCuenta(body)
      : null,

    typeof globalApi.OnionCuenta?.updateLanguage === "function" && globalApi.OnionCuenta.updateLanguage !== updateCuentaLanguage
      ? () => globalApi.OnionCuenta.updateLanguage(nextLang)
      : null,

    typeof globalApi.OnionCuenta?.updateCuentaLanguage === "function" && globalApi.OnionCuenta.updateCuentaLanguage !== updateCuentaLanguage
      ? () => globalApi.OnionCuenta.updateCuentaLanguage(body)
      : null,

    typeof globalApi.CuentaView?.updateLanguage === "function" && globalApi.CuentaView.updateLanguage !== updateCuentaLanguage
      ? () => globalApi.CuentaView.updateLanguage(nextLang)
      : null,
  ]);

  if (result !== null) return result;

  safeEmit("cuenta:modal:update-language", body);
  safeEmit("cuenta:language:update", body);

  return null;
}

async function callFlexiblePassword({
  changePassword,
  payload = {},
} = {}) {
  const body = safeObject(payload);
  const globalApi = getGlobalCuentaApi();

  const result = await callCandidates([
    typeof changePassword === "function"
      ? () => changePassword(body)
      : null,

    typeof changePassword === "function"
      ? () => changePassword(body.currentPassword, body.newPassword, body)
      : null,

    typeof globalApi.OnionCuenta?.changePassword === "function" && globalApi.OnionCuenta.changePassword !== changePassword
      ? () => globalApi.OnionCuenta.changePassword(body)
      : null,

    typeof globalApi.CuentaView?.changePassword === "function" && globalApi.CuentaView.changePassword !== changePassword
      ? () => globalApi.CuentaView.changePassword(body)
      : null,

    typeof globalApi.OnionCuentaPassword?.change === "function"
      ? () => globalApi.OnionCuentaPassword.change(body)
      : null,

    typeof globalApi.OnionCuentaPassword?.update === "function"
      ? () => globalApi.OnionCuentaPassword.update(body)
      : null,
  ]);

  if (result !== null) return result;

  safeEmit("cuenta:password:change", body);

  return null;
}

/* =========================================================
   MODAL BRIDGE
========================================================= */

function openModalBridge(detail = null) {
  const payload = safeObject(detail);

  try {
    if (isBrowser() && typeof window.OnionCuentaModal?.open === "function") {
      window.OnionCuentaModal.open(payload);
      return true;
    }
  } catch {}

  try {
    if (isBrowser() && typeof window.OnionCuentaModal?.render === "function") {
      window.OnionCuentaModal.render(payload);
      return true;
    }
  } catch {}

  try {
    if (isBrowser() && typeof window.renderCuentaModal === "function") {
      window.renderCuentaModal(payload);
      return true;
    }
  } catch {}

  try {
    if (isBrowser() && typeof window.openCuentaModal === "function") {
      window.openCuentaModal(payload);
      return true;
    }
  } catch {}

  safeEmit("cuenta:modal:open", {
    detail: payload,
  });

  return true;
}

/* =========================================================
   RELOAD
========================================================= */

async function safeReload(reload, loadCuenta, meta = {}) {
  try {
    safeEmit("cuenta:bindings:reload:start", meta);

    const result = await callFlexibleReload({
      reload,
      loadCuenta,
      force: true,
      source: meta.source || "bindings",
    });

    safeEmit("cuenta:bindings:reload:success", {
      ...meta,
      result,
    });

    return result;
  } catch (error) {
    safeWarn("reload falló", error);

    safeEmit("cuenta:bindings:reload:error", {
      ...meta,
      error,
    });

    showToast("No se pudo actualizar la cuenta.", "error");

    return null;
  }
}

function scheduleReload(reload, loadCuenta, meta = {}) {
  if (reloadScheduled) return;

  reloadScheduled = true;

  setTimeout(async () => {
    reloadScheduled = false;

    await safeReload(reload, loadCuenta, {
      source: "scheduled",
      ...meta,
    });
  }, 80);
}

/* =========================================================
   ACTION HANDLERS
========================================================= */

async function handleRefresh({
  element = null,
  reload,
  loadCuenta,
} = {}) {
  return runBusy("cuenta:refresh", element, async () => {
    return safeReload(reload, loadCuenta, {
      source: "manual",
    });
  });
}

async function handleSave({
  root = getContainer(),
  element = null,
  saveCuenta,
  updateCuenta,
} = {}) {
  const payload = readCuentaForm(root);

  return runBusy("cuenta:save", element, async () => {
    try {
      safeEmit("cuenta:bindings:save:start", {
        payload,
      });

      const result = await callFlexibleSave({
        saveCuenta,
        updateCuenta,
        payload,
      });

      safeEmit("cuenta:bindings:save:success", {
        payload,
        result,
      });

      showToast("Preferencias guardadas", "success");

      return result;
    } catch (error) {
      safeWarn("saveCuenta falló", error);

      safeEmit("cuenta:bindings:save:error", {
        payload,
        error,
      });

      showToast("No se pudieron guardar las preferencias.", "error");

      return null;
    }
  });
}

async function handleTheme({
  root = getContainer(),
  element = null,
  updateCuentaTheme,
  updateCuenta,
  explicitDarkMode = null,
} = {}) {
  const payload = readCuentaForm(root);

  const darkMode =
    explicitDarkMode === null || explicitDarkMode === undefined
      ? !Boolean(payload.darkMode)
      : Boolean(explicitDarkMode);

  return runBusy("cuenta:theme", element, async () => {
    try {
      safeEmit("cuenta:bindings:theme:start", {
        darkMode,
      });

      const result = await callFlexibleTheme({
        updateCuentaTheme,
        updateCuenta,
        darkMode,
        payload: {
          ...payload,
          darkMode,
          theme: darkMode ? "dark" : "light",
        },
      });

      safeEmit("cuenta:bindings:theme:success", {
        darkMode,
        result,
      });

      return result;
    } catch (error) {
      safeWarn("updateCuentaTheme falló", error);

      safeEmit("cuenta:bindings:theme:error", {
        darkMode,
        error,
      });

      showToast("No se pudo actualizar el tema.", "error");

      return null;
    }
  });
}

async function handleLanguage({
  root = getContainer(),
  element = null,
  updateCuentaLanguage,
  updateCuenta,
} = {}) {
  const payload = readCuentaForm(root);
  const lang = normalizeLang(payload.lang);

  return runBusy("cuenta:language", element, async () => {
    try {
      safeEmit("cuenta:bindings:language:start", {
        lang,
      });

      const result = await callFlexibleLanguage({
        updateCuentaLanguage,
        updateCuenta,
        lang,
        payload,
      });

      safeEmit("cuenta:bindings:language:success", {
        lang,
        result,
      });

      showToast("Idioma actualizado", "success");

      return result;
    } catch (error) {
      safeWarn("updateCuentaLanguage falló", error);

      safeEmit("cuenta:bindings:language:error", {
        lang,
        error,
      });

      showToast("No se pudo actualizar el idioma.", "error");

      return null;
    }
  });
}

async function handlePassword({
  root = getContainer(),
  element = null,
  changePassword,
} = {}) {
  const {
    currentPassword,
    newPassword,
    confirmPassword,
    currentPasswordInput,
    newPasswordInput,
    confirmPasswordInput,
  } = readPasswordForm(root);

  if (!currentPassword) {
    showToast("Introduce la contraseña actual.", "error");

    try {
      currentPasswordInput?.focus?.();
    } catch {}

    return false;
  }

  if (!newPassword) {
    showToast("Introduce la nueva contraseña.", "error");

    try {
      newPasswordInput?.focus?.();
    } catch {}

    return false;
  }

  if (newPassword.length < PASSWORD_MIN_LENGTH) {
    showToast(
      `La nueva contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`,
      "error"
    );

    try {
      newPasswordInput?.focus?.();
    } catch {}

    return false;
  }

  if (confirmPassword && confirmPassword !== newPassword) {
    showToast("La confirmación de contraseña no coincide.", "error");

    try {
      confirmPasswordInput?.focus?.();
    } catch {}

    return false;
  }

  return runBusy("cuenta:password", element, async () => {
    try {
      safeEmit("cuenta:bindings:password:start", {
        source: "cuenta.bindings",
      });

      const result = await callFlexiblePassword({
        changePassword,
        payload: {
          currentPassword,
          newPassword,
          confirmPassword,
          source: "cuenta.bindings",
        },
      });

      safeEmit("cuenta:bindings:password:success", {
        result,
      });

      if (result) {
        clearPasswordFields(root);
        showToast("Contraseña actualizada", "success");
      } else {
        showToast("Solicitud de cambio de contraseña enviada.", "info");
      }

      return result;
    } catch (error) {
      safeWarn("changePassword falló", error);

      safeEmit("cuenta:bindings:password:error", {
        error,
      });

      showToast("No se pudo cambiar la contraseña.", "error");

      return false;
    }
  });
}

function handleOpenModal({
  getItem,
  getSnapshot,
} = {}) {
  let detail = null;

  try {
    if (typeof getItem === "function") {
      detail = getItem();
    }
  } catch {}

  if (!detail) {
    try {
      if (typeof getSnapshot === "function") {
        detail = getSnapshot();
      }
    } catch {}
  }

  return openModalBridge(detail || {});
}

/* =========================================================
   MAIN
========================================================= */

export function bindCuentaEvents({
  loadCuenta,
  updateCuenta,
  updateCuentaTheme,
  updateCuentaLanguage,
  saveCuenta,
  changePassword,
  reload,
  getItem,
  getSnapshot,
  scope = DEFAULT_SCOPE,
  root: customRoot = null,
} = {}) {
  const scopeName = resolveScopeName(scope);
  const root = getContainer(customRoot);

  runScopeCleanup(scopeName);

  if (!root) {
    safeWarn("No se encontró contenedor para bindings.");
    return () => {};
  }

  try {
    root.setAttribute?.("data-cuenta-bindings", CUENTA_BINDINGS_VERSION);
  } catch {}

  const refreshAfterMutation = (event) => {
    const payload = event?.detail || event || {};

    scheduleReload(reload, loadCuenta, {
      source: "mutation-event",
      eventName: safeText(event?.type, ""),
      payload,
    });
  };

  bindDomEvent({
    scopeName,
    target: root,
    eventName: "click",
    options: BIND_OPTIONS,
    handler: async (event) => {
      const target = event.target;

      if (!target) return;

      const refreshAction = getActionElement(
        root,
        target,
        ACTION_SETS.refresh,
        DIRECT_IDS.refresh
      );

      if (refreshAction) {
        event.preventDefault();
        event.stopPropagation();

        await handleRefresh({
          element: refreshAction,
          reload,
          loadCuenta,
        });

        return;
      }

      const saveAction = getActionElement(
        root,
        target,
        ACTION_SETS.save,
        DIRECT_IDS.save
      );

      if (saveAction) {
        event.preventDefault();
        event.stopPropagation();

        await handleSave({
          root,
          element: saveAction,
          saveCuenta,
          updateCuenta,
        });

        return;
      }

      const themeAction = getActionElement(
        root,
        target,
        ACTION_SETS.theme
      );

      if (themeAction) {
        event.preventDefault();
        event.stopPropagation();

        await handleTheme({
          root,
          element: themeAction,
          updateCuentaTheme,
          updateCuenta,
        });

        return;
      }

      const languageAction = getActionElement(
        root,
        target,
        ACTION_SETS.language
      );

      if (languageAction) {
        event.preventDefault();
        event.stopPropagation();

        await handleLanguage({
          root,
          element: languageAction,
          updateCuentaLanguage,
          updateCuenta,
        });

        return;
      }

      const passwordAction = getActionElement(
        root,
        target,
        ACTION_SETS.password,
        DIRECT_IDS.password
      );

      if (passwordAction) {
        event.preventDefault();
        event.stopPropagation();

        await handlePassword({
          root,
          element: passwordAction,
          changePassword,
        });

        return;
      }

      const openAction = getActionElement(
        root,
        target,
        ACTION_SETS.open,
        DIRECT_IDS.open
      );

      if (openAction) {
        event.preventDefault();
        event.stopPropagation();

        handleOpenModal({
          getItem,
          getSnapshot,
        });
      }
    },
  });

  bindDomEvent({
    scopeName,
    target: root,
    eventName: "change",
    options: BIND_OPTIONS,
    handler: async (event) => {
      const target = event.target;

      if (!target || isDisabledElement(target)) return;

      const darkInput = closestInside(root, target, INPUT_SELECTORS.darkMode);

      if (darkInput) {
        await handleTheme({
          root,
          element: darkInput,
          updateCuentaTheme,
          updateCuenta,
          explicitDarkMode: Boolean(darkInput.checked),
        });

        return;
      }

      const languageInput = closestInside(root, target, INPUT_SELECTORS.language);

      if (languageInput) {
        const lang = normalizeLang(languageInput.value);

        safeEmit("cuenta:bindings:language:changed", {
          lang,
        });

        return;
      }

      const privacyInput = closestInside(root, target, INPUT_SELECTORS.privacyMode);

      if (privacyInput) {
        safeEmit("cuenta:bindings:privacy:changed", {
          privacyMode: Boolean(privacyInput.checked),
        });
      }
    },
  });

  bindDomEvent({
    scopeName,
    target: root,
    eventName: "keydown",
    options: BIND_OPTIONS,
    handler: async (event) => {
      const key = safeText(event.key, "");

      if (key !== "Enter") return;

      const target = event.target;

      if (!target || isDisabledElement(target)) return;

      const passwordInput =
        closestInside(root, target, INPUT_SELECTORS.currentPassword) ||
        closestInside(root, target, INPUT_SELECTORS.newPassword) ||
        closestInside(root, target, INPUT_SELECTORS.confirmPassword);

      if (passwordInput) {
        event.preventDefault();

        await handlePassword({
          root,
          element: passwordInput,
          changePassword,
        });

        return;
      }

      const languageInput = closestInside(root, target, INPUT_SELECTORS.language);

      if (languageInput) {
        event.preventDefault();

        await handleLanguage({
          root,
          element: languageInput,
          updateCuentaLanguage,
          updateCuenta,
        });
      }
    },
  });

  bindBusEvent({
    scopeName,
    eventName: "cuenta:modal:updated",
    handler: refreshAfterMutation,
  });

  bindBusEvent({
    scopeName,
    eventName: "cuenta:preferences:mutated",
    handler: refreshAfterMutation,
  });

  bindBusEvent({
    scopeName,
    eventName: "cuenta:password:success",
    handler: refreshAfterMutation,
  });

  bindBusEvent({
    scopeName,
    eventName: "cuenta:external:refresh",
    handler: refreshAfterMutation,
  });

  safeEmit("cuenta:bindings:ready", {
    scope: scopeName,
    version: CUENTA_BINDINGS_VERSION,
    nativeFirst: true,
    root: root?.id || root?.dataset?.view || root?.className || "document",
  });

  return () => {
    runScopeCleanup(scopeName);

    safeEmit("cuenta:bindings:destroyed", {
      scope: scopeName,
      version: CUENTA_BINDINGS_VERSION,
    });
  };
}

/* =========================================================
   ALIASES
========================================================= */

export const bindCuentaView = bindCuentaEvents;
export const bindCuentaBindings = bindCuentaEvents;

export function destroyCuentaBindings(scope = DEFAULT_SCOPE) {
  runScopeCleanup(scope);
  return true;
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  CUENTA_BINDINGS_SCOPE,
  CUENTA_BINDINGS_VERSION,

  bindCuentaEvents,
  bindCuentaView,
  bindCuentaBindings,
  destroyCuentaBindings,
};

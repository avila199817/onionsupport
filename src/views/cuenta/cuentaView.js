/* =========================================================
   Onion SPA - Cuenta View
   Archivo: src/views/cuenta/cuentaView.js

   CLIENT EXPERIENCE MODE · VIEW REAL · HARDENED · EXTREME 10/10
   PATCH · TEMPLATE GOD LEVEL COMPATIBLE
   PATCH · PROFILE / THEME / LANGUAGE / SECURITY READY
   PATCH · CONFIRM PASSWORD SUPPORT
   PATCH · DOM / APPCORE / STORAGE SIDE EFFECTS
   PATCH · ANTI-RACE / ANTI-SPAM / CLEANUP SAFE
   PATCH · SINGLE RESOURCE MODE REAL PARA /api/user/preferences

   RESPONSABILIDADES:
   - punto de entrada real de la vista cuenta
   - render principal con template final unificado
   - carga inicial robusta con fallback a cache
   - refresh con loader SOLO en panel principal
   - guardado con estado visual de saving
   - cambio de theme con side effects reales en DOM / AppCore / storage
   - cambio de idioma con side effects reales en DOM / AppCore / storage
   - cambio de contraseña delegado por bridge/evento
   - bind de eventos de pantalla
   - evitar doble bind de listeners
   - soportar destroy limpio del router
   - permitir reload con rerender seguro
   - coordinar acciones y bridges sin mezclar responsabilidades
   - conservar compatibilidad con cuenta.template.js premium
   - leer inputs nuevos: nombre / teléfono / confirm password
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  cuentaState,
  setHydrated,
  setViewForm,
  patchViewForm,
  syncViewFormFromItem,
  setViewSuccess,
  setViewServerError,
  clearViewSuccess,
  clearViewErrors,
} from "./cuenta.state.js";

import {
  loadCuenta,
  updateCuenta,
  updateCuentaTheme,
  hydrateCuentaFromCache,
  loadCuentaMeta,
} from "./cuenta.api.js";

import {
  getCuentaStore,
} from "./cuenta.store.js";

import {
  renderCuentaTemplate,
} from "./cuenta.template.js";

import {
  normalizeCuentaModel,
} from "./cuenta.model.js";

import {
  buildCuentaSnapshot,
} from "./cuenta.utils.js";

export const CuentaView = (() => {
  "use strict";

  /* =========================================================
     CONSTANTS
  ========================================================= */

  const SCOPE = "view:cuenta";
  const MODULE = "cuenta";
  const VIEW_NAME = "CuentaView";
  const CANONICAL_PATH = "/cuenta";

  const PASSWORD_MIN_LENGTH = 8;
  const RENDER_DEBOUNCE_MS = 0;

  const STORAGE_KEYS = {
    theme: "theme",
    darkMode: "darkMode",
    lang: "lang",
    language: "language",
  };

  /* =========================================================
     LOCAL RUNTIME
  ========================================================= */

  let initialized = false;
  let mounted = false;
  let destroyed = false;

  let inflightInit = null;
  let inflightReload = null;
  let inflightSave = null;
  let inflightTheme = null;
  let inflightLanguage = null;

  let bindingsCleanup = null;
  let renderToken = 0;
  let scheduledRender = null;
  let lastRenderedHtml = "";

  /* =========================================================
     SAFE HELPERS
  ========================================================= */

  function safeLog(...args) {
    try {
      AppCore?.utils?.log?.("[CuentaView]", ...args);
    } catch {}

    try {
      if (typeof console !== "undefined" && typeof console.log === "function") {
        console.log("[CuentaView]", ...args);
      }
    } catch {}
  }

  function safeWarn(...args) {
    try {
      AppCore?.utils?.warn?.("[CuentaView]", ...args);
    } catch {}

    try {
      if (typeof console !== "undefined" && typeof console.warn === "function") {
        console.warn("[CuentaView]", ...args);
      }
    } catch {}
  }

  function safeText(value, fallback = "") {
    if (value === null || value === undefined) return fallback;

    const text = String(value).trim();

    return text || fallback;
  }

  function safeNumber(value, fallback = 0) {
    if (value === null || value === undefined || value === "") return fallback;

    const n = Number(value);

    return Number.isFinite(n) ? n : fallback;
  }

  function safeBoolean(value, fallback = false) {
    if (typeof value === "boolean") return value;

    if (typeof value === "number") {
      if (value === 1) return true;
      if (value === 0) return false;
    }

    if (typeof value === "string") {
      const normalized = normalizeKey(value);

      if (["true", "1", "yes", "si", "sí", "on", "dark", "enabled"].includes(normalized)) {
        return true;
      }

      if (["false", "0", "no", "off", "light", "disabled"].includes(normalized)) {
        return false;
      }
    }

    return fallback;
  }

  function safeObject(value, fallback = {}) {
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : fallback;
  }

  function safeArray(value, fallback = []) {
    return Array.isArray(value) ? value : fallback;
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

  function hasOwnKeys(value = {}) {
    return Boolean(
      value &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        Object.keys(value).length
    );
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

  function normalizeLang(value = "es") {
    const key = normalizeKey(value);

    if (["en", "english", "en_us", "en_gb"].includes(key)) return "en";
    if (["ca", "cat", "catala", "catalan", "ca_es"].includes(key)) return "ca";

    return "es";
  }

  function normalizeTheme(value = "light") {
    const key = normalizeKey(value);

    if (["dark", "oscuro", "night"].includes(key)) return "dark";
    if (["light", "claro", "day"].includes(key)) return "light";

    return safeBoolean(value, false) ? "dark" : "light";
  }

  function getEventPayload(event = null) {
    return safeObject(
      first(
        event?.detail,
        event?.payload,
        event
      )
    );
  }

  function waitForPaint() {
    return new Promise((resolve) => {
      try {
        if (typeof window === "undefined") {
          resolve();
          return;
        }

        if (typeof window.requestAnimationFrame !== "function") {
          window.setTimeout(resolve, 0);
          return;
        }

        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(resolve);
        });
      } catch {
        resolve();
      }
    });
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
      if (typeof window !== "undefined") {
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

  function showToast(message = "", type = "info") {
    const text = safeText(message, "");

    if (!text) return;

    const normalizedType = normalizeKey(type) || "info";

    try {
      if (typeof AppCore?.toast?.[normalizedType] === "function") {
        AppCore.toast[normalizedType](text);
        return;
      }
    } catch {}

    try {
      AppCore?.toast?.show?.(text, normalizedType);
      return;
    } catch {}

    try {
      AppCore?.ui?.toast?.[normalizedType]?.(text);
      return;
    } catch {}

    try {
      window?.Toast?.[normalizedType]?.(text);
      return;
    } catch {}

    try {
      window?.Toast?.show?.(text, normalizedType);
    } catch {}
  }

  function getContainer() {
    try {
      return (
        AppCore?.dom?.viewContainer ||
        document.getElementById("view-container") ||
        document.querySelector("[data-view-container]") ||
        null
      );
    } catch {
      return null;
    }
  }

  function nextRenderToken() {
    renderToken += 1;
    return renderToken;
  }

  function isActiveToken(token) {
    return !destroyed && token === renderToken;
  }

  function safeErrorMessage(error = null, fallback = "No se pudo cargar la cuenta.") {
    return safeText(
      first(
        error?.message,
        error?.response?.message,
        error?.response?.data?.message,
        error?.data?.message,
        error?.error,
        error?.code,
        fallback
      ),
      fallback
    );
  }

  function isBrowser() {
    return typeof window !== "undefined" && typeof document !== "undefined";
  }

  /* =========================================================
     ROUTE SAFETY
  ========================================================= */

  function normalizePathnameOnly(pathname = "/") {
    let value = String(pathname || "/")
      .trim()
      .replace(/\\/g, "/")
      .replace(/\/{2,}/g, "/");

    if (!value) value = "/";
    if (!value.startsWith("/")) value = `/${value}`;

    if (value.length > 1) {
      value = value.replace(/\/+$/g, "") || "/";
    }

    return value;
  }

  function isHashRouterPath(value = "") {
    const raw = safeText(value, "");

    return raw.startsWith("#/") || raw.startsWith("#!");
  }

  function normalizeHashRouterPath(value = "") {
    const raw = safeText(value, "");

    if (!raw) return "/";

    if (raw.startsWith("#!")) {
      return raw.replace(/^#!\/?/, "/");
    }

    return raw.replace(/^#\/?/, "/");
  }

  function splitPath(value = "/") {
    const raw = safeText(value, "/");

    if (isHashRouterPath(raw)) {
      return splitPath(normalizeHashRouterPath(raw));
    }

    let pathname = raw;
    let search = "";
    let hash = "";

    const hashIndex = pathname.indexOf("#");

    if (hashIndex >= 0) {
      hash = pathname.slice(hashIndex);
      pathname = pathname.slice(0, hashIndex) || "/";
    }

    const searchIndex = pathname.indexOf("?");

    if (searchIndex >= 0) {
      search = pathname.slice(searchIndex);
      pathname = pathname.slice(0, searchIndex) || "/";
    }

    return {
      pathname: normalizePathnameOnly(pathname),
      search,
      hash,
    };
  }

  function isUsernameSegment(segment = "") {
    return /^@[A-Za-z0-9._-]{1,80}$/.test(safeText(segment, ""));
  }

  function stripUsernamePrefix(path = "/") {
    const { pathname, search, hash } = splitPath(path);

    const segments = pathname.split("/").filter(Boolean);

    if (segments.length > 0 && isUsernameSegment(segments[0])) {
      const rest = segments.slice(1).join("/");
      const cleanPathname = rest ? normalizePathnameOnly(`/${rest}`) : "/";

      return `${cleanPathname}${search}${hash}`;
    }

    return `${pathname}${search}${hash}`;
  }

  function stripSearchAndHash(path = "/") {
    return (
      safeText(path, "/")
        .split("?")[0]
        .split("#")[0] ||
      "/"
    );
  }

  function getBrowserPath() {
    if (!isBrowser()) return "";

    try {
      const pathname = window.location.pathname || "/";
      const search = window.location.search || "";
      const hash = window.location.hash || "";

      if (hash && isHashRouterPath(hash)) {
        return normalizeHashRouterPath(hash);
      }

      return `${pathname}${search}${hash}`;
    } catch {
      return "";
    }
  }

  function getAppRoutePath() {
    try {
      return safeText(
        first(
          AppCore?.state?.route,
          AppCore?.state?.canonicalPath,
          AppCore?.state?.path,
          ""
        ),
        ""
      );
    } catch {
      return "";
    }
  }

  function getAppPublicPath() {
    try {
      return safeText(AppCore?.state?.publicPath, "");
    } catch {
      return "";
    }
  }

  function getCleanCanonicalPath(path = "/") {
    return stripSearchAndHash(stripUsernamePrefix(path || "/"));
  }

  function isCuentaPath(path = "") {
    return getCleanCanonicalPath(path || "/") === CANONICAL_PATH;
  }

  function canRenderCuentaNow() {
    const browserPath = getBrowserPath();
    const appRoute = getAppRoutePath();
    const publicPath = getAppPublicPath();

    if (browserPath && isCuentaPath(browserPath)) return true;
    if (appRoute && isCuentaPath(appRoute)) return true;
    if (publicPath && isCuentaPath(publicPath)) return true;

    if (!browserPath && !appRoute && !publicPath) return true;

    return false;
  }

  /* =========================================================
     STATE HELPERS
  ========================================================= */

  function setState(patch = {}) {
    if (!patch || typeof patch !== "object") {
      return cuentaState;
    }

    Object.assign(cuentaState, patch);

    return cuentaState;
  }

  function ensureBaseState() {
    if (typeof cuentaState.loading !== "boolean") cuentaState.loading = false;
    if (typeof cuentaState.refreshing !== "boolean") cuentaState.refreshing = false;
    if (typeof cuentaState.saving !== "boolean") cuentaState.saving = false;
    if (typeof cuentaState.hydrated !== "boolean") cuentaState.hydrated = false;

    cuentaState.error = safeText(cuentaState.error, "");
    cuentaState.lastSyncAt = first(cuentaState.lastSyncAt, "") || "";

    if (!cuentaState.view || typeof cuentaState.view !== "object") {
      cuentaState.view = {};
    }

    if (!cuentaState.view.form || typeof cuentaState.view.form !== "object") {
      cuentaState.view.form = {};
    }

    return cuentaState;
  }

  function markIdle() {
    setState({
      loading: false,
      refreshing: false,
    });
  }

  function markLoadedOk(detail = null) {
    setState({
      loading: false,
      refreshing: false,
      error: "",
      hydrated: true,
      lastSyncAt: new Date().toISOString(),
    });

    try {
      setHydrated?.(true);
    } catch {
      cuentaState.hydrated = true;
    }

    if (detail) {
      syncFormFromDetail(detail);
    }

    return detail;
  }

  function getCurrentItem() {
    try {
      const raw = getCuentaStore();

      if (!raw) return null;

      return normalizeCuentaModel(raw);
    } catch (error) {
      safeWarn("getCurrentItem falló:", error);
      return null;
    }
  }

  function getCurrentFormState() {
    return safeObject(cuentaState?.view?.form);
  }

  function getFieldValue(container, selectors = [], fallback = "") {
    for (const selector of selectors) {
      try {
        const node = container?.querySelector?.(selector);

        if (!node) continue;

        if ("value" in node) {
          return safeText(node.value, fallback);
        }

        return safeText(node.textContent, fallback);
      } catch {}
    }

    return fallback;
  }

  function getCheckboxValue(container, selectors = [], fallback = false) {
    for (const selector of selectors) {
      try {
        const node = container?.querySelector?.(selector);

        if (!node) continue;

        if (typeof node.checked === "boolean") {
          return Boolean(node.checked);
        }
      } catch {}
    }

    return fallback;
  }

  function syncFormFromDetail(detail = null) {
    const item = detail || getCurrentItem();

    const payload = {
      name: safeText(
        first(
          item?.name,
          item?.displayName,
          item?.fullName,
          item?.nombre,
          item?.raw?.name,
          item?.raw?.displayName,
          item?.raw?.fullName,
          ""
        ),
        ""
      ),

      phone: safeText(
        first(
          item?.phone,
          item?.telefono,
          item?.mobile,
          item?.raw?.phone,
          item?.raw?.telefono,
          item?.raw?.mobile,
          ""
        ),
        ""
      ),

      email: safeText(
        first(
          item?.email,
          item?.emailLower,
          item?.raw?.email,
          item?.raw?.emailLower,
          ""
        ),
        ""
      ),

      username: safeText(
        first(
          item?.username,
          item?.usernameLower,
          item?.raw?.username,
          item?.raw?.usernameLower,
          ""
        ),
        ""
      ),

      darkMode: safeBoolean(
        first(
          item?.darkMode,
          item?.isDark,
          item?.theme === "dark",
          item?.appearance === "dark",
          item?.raw?.darkMode,
          item?.raw?.theme === "dark",
          false
        ),
        false
      ),

      privacyMode: safeBoolean(
        first(
          item?.privacyMode,
          item?.raw?.privacyMode,
          false
        ),
        false
      ),

      lang: normalizeLang(
        first(
          item?.lang,
          item?.language,
          item?.locale,
          item?.raw?.lang,
          item?.raw?.language,
          item?.raw?.locale,
          "es"
        )
      ),
    };

    try {
      setViewForm?.(payload);
    } catch {
      cuentaState.view = cuentaState.view || {};
      cuentaState.view.form = {
        ...safeObject(cuentaState.view.form),
        ...payload,
      };
    }

    return payload;
  }

  function syncFormFromCurrentItem() {
    return syncFormFromDetail(getCurrentItem());
  }

  function patchFormSafe(payload = {}) {
    const nextPayload = safeObject(payload);

    try {
      patchViewForm?.(nextPayload);
    } catch {
      cuentaState.view = cuentaState.view || {};
      cuentaState.view.form = {
        ...safeObject(cuentaState.view.form),
        ...nextPayload,
      };
    }

    return getCurrentFormState();
  }

  function readFormPayloadFromDom() {
    const container = getContainer();
    const item = getCurrentItem();
    const currentForm = getCurrentFormState();

    const name = getFieldValue(
      container,
      [
        '[data-role="cuenta-name-input"]',
        "#cuenta-name-input",
      ],
      safeText(
        first(
          currentForm.name,
          item?.name,
          item?.displayName,
          item?.fullName,
          item?.raw?.name,
          ""
        ),
        ""
      )
    );

    const phone = getFieldValue(
      container,
      [
        '[data-role="cuenta-phone-input"]',
        "#cuenta-phone-input",
      ],
      safeText(
        first(
          currentForm.phone,
          item?.phone,
          item?.telefono,
          item?.mobile,
          item?.raw?.phone,
          item?.raw?.telefono,
          ""
        ),
        ""
      )
    );

    const email = getFieldValue(
      container,
      [
        '[data-role="cuenta-email-input"]',
        "#cuenta-email-input",
      ],
      safeText(
        first(
          currentForm.email,
          item?.email,
          item?.emailLower,
          item?.raw?.email,
          ""
        ),
        ""
      )
    );

    const username = getFieldValue(
      container,
      [
        '[data-role="cuenta-username-input"]',
        "#cuenta-username-input",
      ],
      safeText(
        first(
          currentForm.username,
          item?.username,
          item?.usernameLower,
          item?.raw?.username,
          ""
        ),
        ""
      )
    );

    const darkMode = getCheckboxValue(
      container,
      [
        '[data-role="cuenta-darkmode-input"]',
        "#cuenta-darkmode-input",
      ],
      safeBoolean(
        first(
          currentForm.darkMode,
          item?.darkMode,
          item?.theme === "dark",
          item?.raw?.darkMode,
          false
        ),
        false
      )
    );

    const privacyMode = getCheckboxValue(
      container,
      [
        '[data-role="cuenta-privacymode-input"]',
        "#cuenta-privacymode-input",
      ],
      safeBoolean(
        first(
          currentForm.privacyMode,
          item?.privacyMode,
          item?.raw?.privacyMode,
          false
        ),
        false
      )
    );

    const lang = normalizeLang(
      getFieldValue(
        container,
        [
          '[data-role="cuenta-language-select"]',
          "#cuenta-language-select",
        ],
        safeText(
          first(
            currentForm.lang,
            item?.lang,
            item?.language,
            item?.locale,
            item?.raw?.lang,
            item?.raw?.language,
            item?.raw?.locale,
            "es"
          ),
          "es"
        )
      )
    );

    return {
      name,
      displayName: name,
      phone,
      telefono: phone,
      email,
      username,
      darkMode,
      privacyMode,
      lang,
      language: lang,
      locale: lang,
      theme: darkMode ? "dark" : "light",
      appearance: darkMode ? "dark" : "light",
    };
  }

  /* =========================================================
     THEME / LANGUAGE SIDE EFFECTS
  ========================================================= */

  function resolveThemeMode(value = true) {
    return safeBoolean(value, false) ? "dark" : "light";
  }

  function applyCuentaThemeToDom(darkMode = true) {
    const theme = resolveThemeMode(darkMode);
    const isDark = theme === "dark";

    try {
      document.documentElement.dataset.theme = theme;
    } catch {}

    try {
      document.documentElement.setAttribute("data-theme", theme);
    } catch {}

    try {
      document.body?.setAttribute?.("data-theme", theme);
    } catch {}

    try {
      document.documentElement.classList.toggle("theme-dark", isDark);
      document.documentElement.classList.toggle("theme-light", !isDark);
      document.documentElement.classList.toggle("dark", isDark);
      document.documentElement.classList.toggle("light", !isDark);
    } catch {}

    try {
      document.body?.classList?.toggle?.("theme-dark", isDark);
      document.body?.classList?.toggle?.("theme-light", !isDark);
      document.body?.classList?.toggle?.("dark", isDark);
      document.body?.classList?.toggle?.("light", !isDark);
    } catch {}

    try {
      AppCore.state = AppCore.state || {};
      AppCore.state.theme = theme;
      AppCore.state.appearance = theme;
      AppCore.state.darkMode = isDark;
    } catch {}

    try {
      AppCore?.setTheme?.(theme);
    } catch {}

    try {
      AppCore?.prefs?.set?.("theme", theme);
      AppCore?.prefs?.set?.("darkMode", isDark);
    } catch {}

    try {
      localStorage.setItem(STORAGE_KEYS.theme, theme);
      localStorage.setItem(STORAGE_KEYS.darkMode, String(isDark));
    } catch {}

    safeEmit("app:theme:change", {
      theme,
      appearance: theme,
      darkMode: isDark,
      source: MODULE,
      view: VIEW_NAME,
    });

    safeEmit("cuenta:theme:applied", {
      theme,
      darkMode: isDark,
      source: MODULE,
    });

    return theme;
  }

  function applyCuentaLanguageToDom(lang = "es") {
    const nextLang = normalizeLang(lang);

    try {
      document.documentElement.lang = nextLang;
    } catch {}

    try {
      document.documentElement.dataset.lang = nextLang;
    } catch {}

    try {
      document.body?.setAttribute?.("data-lang", nextLang);
    } catch {}

    try {
      AppCore.state = AppCore.state || {};
      AppCore.state.lang = nextLang;
      AppCore.state.language = nextLang;
      AppCore.state.locale = nextLang;
    } catch {}

    try {
      AppCore?.setLang?.(nextLang);
    } catch {}

    try {
      AppCore?.setLanguage?.(nextLang);
    } catch {}

    try {
      AppCore?.i18n?.setLanguage?.(nextLang);
    } catch {}

    try {
      AppCore?.i18n?.setLang?.(nextLang);
    } catch {}

    try {
      window?.I18n?.setLanguage?.(nextLang);
    } catch {}

    try {
      window?.I18n?.setLang?.(nextLang);
    } catch {}

    try {
      localStorage.setItem(STORAGE_KEYS.lang, nextLang);
      localStorage.setItem(STORAGE_KEYS.language, nextLang);
    } catch {}

    safeEmit("app:lang:change", {
      lang: nextLang,
      language: nextLang,
      locale: nextLang,
      source: MODULE,
      view: VIEW_NAME,
    });

    safeEmit("cuenta:language:applied", {
      lang: nextLang,
      language: nextLang,
      source: MODULE,
    });

    return nextLang;
  }

  function applyCuentaPreferencesSideEffects(detail = null) {
    const item = detail || getCurrentItem();

    if (!item) return null;

    const darkMode = safeBoolean(
      first(
        item.darkMode,
        item.theme === "dark",
        item.appearance === "dark",
        item.raw?.darkMode,
        item.raw?.theme === "dark",
        false
      ),
      false
    );

    const lang = normalizeLang(
      first(
        item.lang,
        item.language,
        item.locale,
        item.raw?.lang,
        item.raw?.language,
        item.raw?.locale,
        "es"
      )
    );

    applyCuentaThemeToDom(darkMode);
    applyCuentaLanguageToDom(lang);

    return item;
  }

  /* =========================================================
     HYDRATION
  ========================================================= */

  function hydrateBestEffort() {
    let hydrated = false;

    try {
      hydrated = Boolean(hydrateCuentaFromCache?.());
    } catch (error) {
      safeWarn("hydrateCuentaFromCache falló:", error);
    }

    try {
      const item = getCurrentItem();

      if (item) {
        syncFormFromDetail(item);
        applyCuentaPreferencesSideEffects(item);

        try {
          setHydrated?.(true);
        } catch {}

        cuentaState.hydrated = true;
        hydrated = true;
      }
    } catch (error) {
      safeWarn("hydrateBestEffort falló:", error);
    }

    return hydrated;
  }

  /* =========================================================
     CLEANUP
  ========================================================= */

  function cleanupBindings() {
    try {
      bindingsCleanup?.();
    } catch {}

    bindingsCleanup = null;

    try {
      AppCore?.cleanup?.run?.(SCOPE);
    } catch {}
  }

  function cleanupScheduledRender() {
    try {
      if (scheduledRender) {
        clearTimeout(scheduledRender);
      }
    } catch {}

    scheduledRender = null;
  }

  /* =========================================================
     BRIDGES
  ========================================================= */

  function openCuentaModalBridge(detail = null) {
    const payload = safeObject(detail);

    if (!hasOwnKeys(payload)) {
      return false;
    }

    try {
      const modal = window?.OnionCuentaModal;

      if (typeof modal?.open === "function") {
        modal.open(payload);
        return true;
      }

      if (typeof modal?.render === "function") {
        modal.render(payload);
        return true;
      }

      if (typeof modal?.show === "function") {
        modal.show(payload);
        return true;
      }
    } catch (error) {
      safeWarn("OnionCuentaModal hook falló:", error);
    }

    try {
      const hook =
        window?.renderCuentaModal ||
        window?.openCuentaModal ||
        window?.showCuentaModal;

      if (typeof hook === "function") {
        hook(payload);
        return true;
      }
    } catch (error) {
      safeWarn("cuenta modal hook legacy falló:", error);
    }

    safeEmit("cuenta:modal:open", {
      detail: payload,
      source: MODULE,
    });

    return true;
  }

  function passwordChangeBridge(payload = {}) {
    const data = safeObject(payload);

    try {
      const passwordApi = window?.OnionCuentaPassword;

      if (typeof passwordApi?.change === "function") {
        passwordApi.change(data);
        return true;
      }

      if (typeof passwordApi?.update === "function") {
        passwordApi.update(data);
        return true;
      }

      if (typeof passwordApi?.request === "function") {
        passwordApi.request(data);
        return true;
      }
    } catch (error) {
      safeWarn("OnionCuentaPassword hook falló:", error);
    }

    try {
      const modal = window?.OnionCuentaModal;

      if (typeof modal?.changePassword === "function") {
        modal.changePassword(data);
        return true;
      }

      if (typeof modal?.openPassword === "function") {
        modal.openPassword(data);
        return true;
      }
    } catch (error) {
      safeWarn("OnionCuentaModal.changePassword falló:", error);
    }

    try {
      const hook =
        window?.changeCuentaPassword ||
        window?.updateCuentaPassword ||
        window?.renderCuentaPasswordModal ||
        window?.openCuentaPasswordModal;

      if (typeof hook === "function") {
        hook(data);
        return true;
      }
    } catch (error) {
      safeWarn("password hook legacy falló:", error);
    }

    safeEmit("cuenta:password:change", data);

    return false;
  }

  /* =========================================================
     DOM POST-RENDER
  ========================================================= */

  function applyErrorStateToDom(container) {
    if (!container) return;

    let oldBanner = null;

    try {
      oldBanner = container.querySelector("[data-cuenta-error-banner='true']");
    } catch {}

    if (oldBanner) {
      try {
        oldBanner.remove();
      } catch {}
    }

    const message = safeText(cuentaState.error, "");
    const hasVisibleData = Boolean(getCurrentItem());

    if (!message || !hasVisibleData) {
      return;
    }

    let anchor = null;

    try {
      anchor =
        container.querySelector(".cuenta-panel") ||
        container.querySelector("[data-view='cuenta']") ||
        container.querySelector(".content-wrapper");
    } catch {}

    if (!anchor) return;

    const banner = document.createElement("div");
    banner.setAttribute("data-cuenta-error-banner", "true");

    Object.assign(banner.style, {
      margin: "0 0 var(--space-md, 14px)",
      padding: "11px 13px",
      borderRadius: "14px",
      border:
        "1px solid color-mix(in srgb, var(--danger-strong, #ff6b6b) 22%, var(--border-soft, rgba(15,23,42,.08)))",
      background:
        "linear-gradient(180deg, color-mix(in srgb, var(--danger-strong, #ff6b6b) 6%, transparent), transparent), var(--surface-1, rgba(255,255,255,.78))",
      color: "var(--text-soft, #4b5563)",
      fontSize: "12px",
      lineHeight: "1.5",
    });

    banner.textContent = message;
    anchor.insertAdjacentElement("beforebegin", banner);
  }

  function applySuccessStateToDom(container) {
    if (!container) return;

    let oldBanner = null;

    try {
      oldBanner = container.querySelector("[data-cuenta-success-banner='true']");
    } catch {}

    if (oldBanner) {
      try {
        oldBanner.remove();
      } catch {}
    }

    const message = safeText(
      first(
        cuentaState?.view?.successMessage,
        cuentaState?.successMessage,
        ""
      ),
      ""
    );

    if (!message) return;

    let anchor = null;

    try {
      anchor =
        container.querySelector(".cuenta-panel") ||
        container.querySelector("[data-view='cuenta']") ||
        container.querySelector(".content-wrapper");
    } catch {}

    if (!anchor) return;

    const banner = document.createElement("div");
    banner.setAttribute("data-cuenta-success-banner", "true");

    Object.assign(banner.style, {
      margin: "0 0 var(--space-md, 14px)",
      padding: "11px 13px",
      borderRadius: "14px",
      border:
        "1px solid color-mix(in srgb, var(--success, #22c55e) 24%, var(--border-soft, rgba(15,23,42,.08)))",
      background:
        "linear-gradient(180deg, color-mix(in srgb, var(--success, #22c55e) 7%, transparent), transparent), var(--surface-1, rgba(255,255,255,.78))",
      color: "var(--text-soft, #4b5563)",
      fontSize: "12px",
      lineHeight: "1.5",
    });

    banner.textContent = message;
    anchor.insertAdjacentElement("beforebegin", banner);
  }

  function decorateDom(container) {
    if (!container) return container;

    applyErrorStateToDom(container);
    applySuccessStateToDom(container);

    try {
      container.setAttribute("data-cuenta-mounted", "true");
      container.setAttribute("data-cuenta-view-version", "12.0.0");
    } catch {}

    return container;
  }

  function clearPasswordFields() {
    const container = getContainer();

    const selectors = [
      '[data-role="cuenta-current-password"]',
      '[data-role="cuenta-new-password"]',
      '[data-role="cuenta-confirm-password"]',
      "#cuenta-current-password",
      "#cuenta-new-password",
      "#cuenta-confirm-password",
    ];

    for (const selector of selectors) {
      try {
        const node = container?.querySelector?.(selector);

        if (node && "value" in node) {
          node.value = "";
        }
      } catch {}
    }
  }

  /* =========================================================
     RENDER
  ========================================================= */

  function buildHtml() {
    const item = getCurrentItem();

    return `
      <section class="panel-content dashboard ready" data-view="cuenta" data-module="cuenta">
        <div class="content-wrapper" style="display:grid;gap:var(--space-lg);">
          ${renderCuentaTemplate({
            item,
            state: cuentaState,
          })}
        </div>
      </section>
    `;
  }

  function render() {
    if (destroyed) return null;

    if (!canRenderCuentaNow()) {
      safeWarn("Render bloqueado: la ruta actual no es /cuenta.", {
        browserPath: getBrowserPath(),
        appRoute: getAppRoutePath(),
        publicPath: getAppPublicPath(),
      });

      return null;
    }

    const container = getContainer();

    if (!container) {
      safeWarn("No existe #view-container para renderizar cuenta.");
      return null;
    }

    ensureBaseState();

    try {
      AppCore?.setDocumentTitle?.("Cuenta");
    } catch {}

    try {
      AppCore?.clearDynamicContainers?.();
    } catch {}

    const html = buildHtml();

    try {
      container.innerHTML = html;
      lastRenderedHtml = html;
      mounted = true;
    } catch (error) {
      safeWarn("Render HTML falló:", error);
      return null;
    }

    decorateDom(container);

    try {
      setHydrated?.(true);
    } catch {
      cuentaState.hydrated = true;
    }

    safeEmit("cuenta:rendered", {
      source: MODULE,
      mounted: true,
      state: getPublicStateSnapshot(),
    });

    return container;
  }

  function rerender() {
    if (destroyed) return null;

    const container = render();

    if (!destroyed && container) {
      bind();
    }

    return container;
  }

  function scheduleRerender() {
    if (destroyed) return null;

    cleanupScheduledRender();

    scheduledRender = setTimeout(() => {
      scheduledRender = null;

      if (!destroyed) {
        rerender();
      }
    }, RENDER_DEBOUNCE_MS);

    return scheduledRender;
  }

  /* =========================================================
     DATA
  ========================================================= */

  async function loadData({
    force = false,
    silent = false,
    asRefresh = false,
  } = {}) {
    if (destroyed) return getCurrentItem();

    const itemBefore = getCurrentItem();
    const hasVisibleData = Boolean(itemBefore);

    setState({
      error: "",
      loading: !hasVisibleData && !silent,
      refreshing: hasVisibleData && asRefresh,
    });

    render();

    try {
      const detail = await loadCuenta({
        force,
      });

      const normalized = detail ? normalizeCuentaModel(detail) : getCurrentItem();

      markLoadedOk(normalized);
      applyCuentaPreferencesSideEffects(normalized);

      try {
        syncViewFormFromItem?.();
      } catch {
        syncFormFromDetail(normalized);
      }

      safeEmit("cuenta:loaded", {
        detail: normalized,
        source: MODULE,
      });

      return normalized;
    } catch (error) {
      const message = safeErrorMessage(error);

      safeWarn("loadCuenta falló:", error);

      setState({
        loading: false,
        refreshing: false,
        error: message,
        hydrated: true,
      });

      try {
        setHydrated?.(true);
      } catch {}

      if (!silent) {
        showToast(message, "error");
      }

      safeEmit("cuenta:load:error", {
        error,
        message,
        source: MODULE,
      });

      return getCurrentItem();
    } finally {
      markIdle();
    }
  }

  async function renderAndLoad({
    force = false,
    asRefresh = false,
    silent = false,
  } = {}) {
    const token = nextRenderToken();

    hydrateBestEffort();
    ensureBaseState();

    render();

    if (!destroyed) {
      bind();
    }

    await loadData({
      force,
      silent,
      asRefresh,
    });

    if (!isActiveToken(token)) {
      return api;
    }

    render();

    if (!destroyed) {
      bind();
    }

    return api;
  }

  /* =========================================================
     ACTIONS
  ========================================================= */

  function buildPreferenceUpdatePayload(payload = null) {
    const domPayload = readFormPayloadFromDom();
    const explicitPayload = safeObject(payload);

    const merged = {
      ...domPayload,
      ...explicitPayload,
    };

    merged.name = safeText(
      first(
        merged.name,
        merged.displayName,
        ""
      ),
      ""
    );

    merged.displayName = merged.name;

    merged.phone = safeText(
      first(
        merged.phone,
        merged.telefono,
        ""
      ),
      ""
    );

    merged.telefono = merged.phone;

    merged.darkMode = safeBoolean(merged.darkMode, false);
    merged.privacyMode = safeBoolean(merged.privacyMode, false);
    merged.lang = normalizeLang(merged.lang);
    merged.language = merged.lang;
    merged.locale = merged.lang;
    merged.theme = merged.darkMode ? "dark" : "light";
    merged.appearance = merged.theme;

    return merged;
  }

  async function handleSaveCuenta(payload = null) {
    if (destroyed) return null;

    if (inflightSave) {
      return inflightSave;
    }

    inflightSave = (async () => {
      const nextPayload = buildPreferenceUpdatePayload(payload);

      try {
        clearViewErrors?.();
      } catch {}

      try {
        clearViewSuccess?.();
      } catch {}

      try {
        setViewServerError?.("");
      } catch {}

      patchFormSafe({
        name: nextPayload.name,
        phone: nextPayload.phone,
        darkMode: nextPayload.darkMode,
        privacyMode: nextPayload.privacyMode,
        lang: nextPayload.lang,
      });

      setState({
        saving: true,
        error: "",
      });

      rerender();
      await waitForPaint();

      try {
        const detail = await updateCuenta(nextPayload);

        const normalized = detail ? normalizeCuentaModel(detail) : getCurrentItem();

        applyCuentaPreferencesSideEffects(normalized);
        syncFormFromDetail(normalized);

        try {
          syncViewFormFromItem?.();
        } catch {}

        try {
          setViewSuccess?.({
            successMessage: "Preferencias guardadas correctamente.",
            updatedAt: normalized?.updatedAt || new Date().toISOString(),
          });
        } catch {}

        safeEmit("cuenta:update:success", {
          detail: normalized,
          payload: nextPayload,
          source: MODULE,
        });

        showToast("Preferencias guardadas", "success");

        return normalized;
      } catch (error) {
        const message = safeErrorMessage(error, "No se pudieron guardar las preferencias.");

        safeWarn("handleSaveCuenta falló:", error);

        syncFormFromCurrentItem();

        try {
          setViewServerError?.(message);
        } catch {}

        safeEmit("cuenta:update:error", {
          error,
          message,
          source: MODULE,
        });

        showToast(message, "error");

        return null;
      } finally {
        setState({
          saving: false,
        });

        inflightSave = null;

        if (!destroyed) {
          rerender();
        }
      }
    })();

    return inflightSave;
  }

  async function handleUpdateTheme(darkMode = true) {
    if (destroyed) return null;

    if (inflightTheme) {
      return inflightTheme;
    }

    inflightTheme = (async () => {
      const nextDarkMode = safeBoolean(darkMode, false);
      const currentPayload = readFormPayloadFromDom();

      try {
        clearViewErrors?.();
      } catch {}

      try {
        clearViewSuccess?.();
      } catch {}

      try {
        setViewServerError?.("");
      } catch {}

      patchFormSafe({
        ...currentPayload,
        darkMode: nextDarkMode,
        theme: nextDarkMode ? "dark" : "light",
      });

      setState({
        saving: true,
        error: "",
      });

      applyCuentaThemeToDom(nextDarkMode);

      rerender();
      await waitForPaint();

      try {
        const detail = await updateCuentaTheme(nextDarkMode);

        const normalized = detail ? normalizeCuentaModel(detail) : getCurrentItem();

        applyCuentaPreferencesSideEffects(normalized);

        patchFormSafe({
          darkMode: safeBoolean(
            first(
              normalized?.darkMode,
              normalized?.theme === "dark",
              nextDarkMode
            ),
            nextDarkMode
          ),
          privacyMode: safeBoolean(
            first(
              normalized?.privacyMode,
              currentPayload.privacyMode,
              false
            ),
            false
          ),
          lang: normalizeLang(
            first(
              normalized?.lang,
              normalized?.language,
              normalized?.locale,
              currentPayload.lang,
              "es"
            )
          ),
        });

        try {
          setViewSuccess?.({
            successMessage: "Tema actualizado correctamente.",
            updatedAt: normalized?.updatedAt || new Date().toISOString(),
          });
        } catch {}

        safeEmit("cuenta:theme:update:success", {
          detail: normalized,
          darkMode: nextDarkMode,
          theme: nextDarkMode ? "dark" : "light",
          source: MODULE,
        });

        showToast("Tema actualizado", "success");

        return normalized;
      } catch (error) {
        const message = safeErrorMessage(error, "No se pudo actualizar el tema.");

        safeWarn("handleUpdateTheme falló:", error);

        syncFormFromCurrentItem();
        applyCuentaPreferencesSideEffects(getCurrentItem());

        try {
          setViewServerError?.(message);
        } catch {}

        safeEmit("cuenta:theme:update:error", {
          error,
          message,
          darkMode: nextDarkMode,
          source: MODULE,
        });

        showToast(message, "error");

        return null;
      } finally {
        setState({
          saving: false,
        });

        inflightTheme = null;

        if (!destroyed) {
          rerender();
        }
      }
    })();

    return inflightTheme;
  }

  async function handleUpdateLanguage(lang = "es") {
    if (destroyed) return null;

    if (inflightLanguage) {
      return inflightLanguage;
    }

    inflightLanguage = (async () => {
      const nextLang = normalizeLang(lang);
      const currentPayload = buildPreferenceUpdatePayload();

      try {
        clearViewErrors?.();
      } catch {}

      try {
        clearViewSuccess?.();
      } catch {}

      try {
        setViewServerError?.("");
      } catch {}

      patchFormSafe({
        ...currentPayload,
        lang: nextLang,
      });

      setState({
        saving: true,
        error: "",
      });

      applyCuentaLanguageToDom(nextLang);

      rerender();
      await waitForPaint();

      try {
        const detail = await updateCuenta({
          ...currentPayload,
          lang: nextLang,
          language: nextLang,
          locale: nextLang,
        });

        const normalized = detail ? normalizeCuentaModel(detail) : getCurrentItem();

        applyCuentaPreferencesSideEffects(normalized);
        syncFormFromDetail(normalized);

        try {
          setViewSuccess?.({
            successMessage: "Idioma actualizado correctamente.",
            updatedAt: normalized?.updatedAt || new Date().toISOString(),
          });
        } catch {}

        safeEmit("cuenta:language:update:success", {
          detail: normalized,
          lang: nextLang,
          language: nextLang,
          source: MODULE,
        });

        showToast("Idioma actualizado", "success");

        return normalized;
      } catch (error) {
        const message = safeErrorMessage(error, "No se pudo actualizar el idioma.");

        safeWarn("handleUpdateLanguage falló:", error);

        syncFormFromCurrentItem();
        applyCuentaPreferencesSideEffects(getCurrentItem());

        try {
          setViewServerError?.(message);
        } catch {}

        safeEmit("cuenta:language:update:error", {
          error,
          message,
          lang: nextLang,
          source: MODULE,
        });

        showToast(message, "error");

        return null;
      } finally {
        setState({
          saving: false,
        });

        inflightLanguage = null;

        if (!destroyed) {
          rerender();
        }
      }
    })();

    return inflightLanguage;
  }

  async function handleRefreshCuenta() {
    if (destroyed) return null;

    try {
      await reload({
        force: true,
        asRefresh: true,
        silent: false,
      });

      const item = getCurrentItem();

      safeEmit("cuenta:refresh:success", {
        detail: item,
        source: MODULE,
      });

      return item;
    } catch (error) {
      safeWarn("handleRefreshCuenta falló:", error);

      safeEmit("cuenta:refresh:error", {
        error,
        source: MODULE,
      });

      return null;
    }
  }

  function handleOpenModal() {
    const item = getCurrentItem();

    if (!item) {
      showToast("No hay datos de cuenta para abrir.", "info");
      return false;
    }

    const opened = openCuentaModalBridge(item);

    if (!opened) {
      showToast(
        "Detalle preparado. Falta conectar cuenta.modal.js para abrir el popup.",
        "info"
      );
    }

    return opened;
  }

  function readPasswordPayloadFromDom() {
    const container = getContainer();

    const currentPassword = getFieldValue(
      container,
      [
        '[data-role="cuenta-current-password"]',
        "#cuenta-current-password",
      ],
      ""
    );

    const newPassword = getFieldValue(
      container,
      [
        '[data-role="cuenta-new-password"]',
        "#cuenta-new-password",
      ],
      ""
    );

    const confirmPassword = getFieldValue(
      container,
      [
        '[data-role="cuenta-confirm-password"]',
        "#cuenta-confirm-password",
      ],
      ""
    );

    return {
      currentPassword,
      newPassword,
      confirmPassword,
    };
  }

  function focusPasswordField(role = "") {
    const container = getContainer();

    const selectorsByRole = {
      current: [
        '[data-role="cuenta-current-password"]',
        "#cuenta-current-password",
      ],
      next: [
        '[data-role="cuenta-new-password"]',
        "#cuenta-new-password",
      ],
      confirm: [
        '[data-role="cuenta-confirm-password"]',
        "#cuenta-confirm-password",
      ],
    };

    const selectors = selectorsByRole[role] || [];

    for (const selector of selectors) {
      try {
        const node = container?.querySelector?.(selector);

        if (node) {
          node.focus?.();
          return true;
        }
      } catch {}
    }

    return false;
  }

  async function handlePasswordChange() {
    if (destroyed) return false;

    const {
      currentPassword,
      newPassword,
      confirmPassword,
    } = readPasswordPayloadFromDom();

    if (!currentPassword) {
      showToast("Introduce la contraseña actual.", "error");
      focusPasswordField("current");
      return false;
    }

    if (!newPassword) {
      showToast("Introduce la nueva contraseña.", "error");
      focusPasswordField("next");
      return false;
    }

    if (newPassword.length < PASSWORD_MIN_LENGTH) {
      showToast(
        `La nueva contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`,
        "error"
      );
      focusPasswordField("next");
      return false;
    }

    if (confirmPassword && confirmPassword !== newPassword) {
      showToast("La confirmación de contraseña no coincide.", "error");
      focusPasswordField("confirm");
      return false;
    }

    setState({
      saving: true,
      error: "",
    });

    rerender();
    await waitForPaint();

    try {
      const handled = passwordChangeBridge({
        currentPassword,
        newPassword,
        confirmPassword,
        source: MODULE,
        view: VIEW_NAME,
      });

      safeEmit("cuenta:password:requested", {
        source: MODULE,
        view: VIEW_NAME,
      });

      if (handled) {
        clearPasswordFields();
        showToast("Solicitud de cambio de contraseña enviada.", "success");
      } else {
        showToast(
          "Conecta el handler cuenta:password:change para procesar la contraseña.",
          "info"
        );
      }

      return handled;
    } catch (error) {
      const message = safeErrorMessage(error, "No se pudo procesar el cambio de contraseña.");

      safeWarn("handlePasswordChange falló:", error);
      showToast(message, "error");

      return false;
    } finally {
      setState({
        saving: false,
      });

      if (!destroyed) {
        rerender();
      }
    }
  }

  /* =========================================================
     BINDINGS
  ========================================================= */

  function getActionTarget(event, actions = []) {
    const selectors = actions
      .map((action) => {
        return [
          `[data-cuenta-action="${action}"]`,
          `[data-action="${action}"]`,
        ].join(",");
      })
      .join(",");

    if (!selectors) return null;

    return event.target?.closest?.(selectors) || null;
  }

  function bindNativeActions(container) {
    if (!container) {
      return () => {};
    }

    const onClick = async (event) => {
      if (destroyed) return;

      const openModalBtn =
        getActionTarget(event, [
          "open-cuenta-modal",
          "open-modal",
          "detail",
        ]) ||
        event.target?.closest?.("#cuenta-open-modal-btn");

      if (openModalBtn) {
        event.preventDefault();
        event.stopPropagation();

        handleOpenModal();
        return;
      }

      const retryBtn =
        getActionTarget(event, [
          "retry",
          "retry-cuenta",
        ]) ||
        event.target?.closest?.("#cuenta-retry-btn");

      if (retryBtn) {
        event.preventDefault();

        await reload({
          force: true,
          asRefresh: false,
          silent: false,
        });

        return;
      }

      const refreshBtn =
        getActionTarget(event, [
          "refresh",
          "reload",
          "refresh-cuenta",
        ]) ||
        event.target?.closest?.("#cuenta-refresh-btn");

      if (refreshBtn) {
        event.preventDefault();

        await reload({
          force: true,
          asRefresh: true,
          silent: false,
        });

        return;
      }

      const saveBtn =
        getActionTarget(event, [
          "save",
          "save-cuenta",
        ]) ||
        event.target?.closest?.("#cuenta-save-btn");

      if (saveBtn) {
        event.preventDefault();

        await handleSaveCuenta();
        return;
      }

      const toggleThemeBtn =
        getActionTarget(event, [
          "toggle-theme",
          "change-theme",
          "update-theme",
        ]);

      if (toggleThemeBtn) {
        event.preventDefault();

        const currentPayload = readFormPayloadFromDom();
        const nextDarkMode = !safeBoolean(currentPayload.darkMode, false);

        await handleUpdateTheme(nextDarkMode);
        return;
      }

      const languageBtn =
        getActionTarget(event, [
          "change-language",
          "update-language",
          "apply-language",
        ]);

      if (languageBtn) {
        event.preventDefault();

        const payload = readFormPayloadFromDom();

        await handleUpdateLanguage(payload.lang);
        return;
      }

      const passwordBtn =
        getActionTarget(event, [
          "change-password",
          "update-password",
        ]) ||
        event.target?.closest?.("#cuenta-password-btn");

      if (passwordBtn) {
        event.preventDefault();

        await handlePasswordChange();
      }
    };

    const onChange = async (event) => {
      if (destroyed) return;

      const darkInput =
        event.target?.closest?.('[data-role="cuenta-darkmode-input"]') ||
        event.target?.closest?.("#cuenta-darkmode-input");

      if (darkInput) {
        patchFormSafe({
          ...readFormPayloadFromDom(),
          darkMode: Boolean(darkInput.checked),
        });

        await handleUpdateTheme(Boolean(darkInput.checked));
        return;
      }

      const languageSelect =
        event.target?.closest?.('[data-role="cuenta-language-select"]') ||
        event.target?.closest?.("#cuenta-language-select");

      if (languageSelect) {
        patchFormSafe({
          ...readFormPayloadFromDom(),
          lang: normalizeLang(languageSelect.value),
        });

        return;
      }

      const editableInput =
        event.target?.closest?.('[data-role="cuenta-name-input"]') ||
        event.target?.closest?.('[data-role="cuenta-phone-input"]');

      if (editableInput) {
        patchFormSafe(readFormPayloadFromDom());
      }
    };

    const onInput = (event) => {
      if (destroyed) return;

      const editableInput =
        event.target?.closest?.('[data-role="cuenta-name-input"]') ||
        event.target?.closest?.('[data-role="cuenta-phone-input"]');

      if (editableInput) {
        patchFormSafe(readFormPayloadFromDom());
      }
    };

    container.addEventListener("click", onClick);
    container.addEventListener("change", onChange);
    container.addEventListener("input", onInput);

    return () => {
      try {
        container.removeEventListener("click", onClick);
        container.removeEventListener("change", onChange);
        container.removeEventListener("input", onInput);
      } catch {}
    };
  }

  function bindModalBridgeEvents() {
    const bus = AppCore?.events;

    if (!bus?.on) {
      return () => {};
    }

    const onRefresh = async () => {
      if (destroyed) return;

      await handleRefreshCuenta();
    };

    const onUpdateTheme = async (event) => {
      if (destroyed) return;

      const payload = getEventPayload(event);

      const darkMode =
        payload.darkMode ??
        payload.detail?.darkMode ??
        payload.theme === "dark" ??
        true;

      await handleUpdateTheme(Boolean(darkMode));
    };

    const onUpdateLanguage = async (event) => {
      if (destroyed) return;

      const payload = getEventPayload(event);

      const lang =
        payload.lang ||
        payload.language ||
        payload.locale ||
        payload.detail?.lang ||
        payload.detail?.language ||
        "es";

      await handleUpdateLanguage(lang);
    };

    const onUpdatePreferences = async (event) => {
      if (destroyed) return;

      const payload = getEventPayload(event);
      const currentPayload = readFormPayloadFromDom();

      await handleSaveCuenta({
        ...currentPayload,

        ...safeObject(payload),

        darkMode:
          payload.darkMode ??
          payload.detail?.darkMode ??
          currentPayload.darkMode,

        privacyMode:
          payload.privacyMode ??
          payload.detail?.privacyMode ??
          currentPayload.privacyMode,

        lang:
          payload.lang ??
          payload.language ??
          payload.locale ??
          payload.detail?.lang ??
          payload.detail?.language ??
          currentPayload.lang,
      });
    };

    try {
      bus.on("cuenta:modal:refresh", onRefresh);
      bus.on("cuenta:modal:update-theme", onUpdateTheme);
      bus.on("cuenta:modal:update-language", onUpdateLanguage);
      bus.on("cuenta:modal:update-preferences", onUpdatePreferences);

      bus.on("cuenta:external:refresh", onRefresh);
      bus.on("cuenta:preferences:mutated", onRefresh);
      bus.on("cuenta:password:success", onRefresh);
    } catch (error) {
      safeWarn("bind modal bridge error:", error);
    }

    return () => {
      try { bus.off("cuenta:modal:refresh", onRefresh); } catch {}
      try { bus.off("cuenta:modal:update-theme", onUpdateTheme); } catch {}
      try { bus.off("cuenta:modal:update-language", onUpdateLanguage); } catch {}
      try { bus.off("cuenta:modal:update-preferences", onUpdatePreferences); } catch {}

      try { bus.off("cuenta:external:refresh", onRefresh); } catch {}
      try { bus.off("cuenta:preferences:mutated", onRefresh); } catch {}
      try { bus.off("cuenta:password:success", onRefresh); } catch {}
    };
  }

  function bindWindowEvents() {
    if (typeof window === "undefined") {
      return () => {};
    }

    const onRefresh = async () => {
      if (destroyed) return;

      await reload({
        force: true,
        asRefresh: true,
        silent: true,
      });
    };

    const onPreferencesMutated = async () => {
      if (destroyed) return;

      await reload({
        force: true,
        asRefresh: true,
        silent: true,
      });
    };

    const onPasswordSuccess = async () => {
      if (destroyed) return;

      clearPasswordFields();

      await reload({
        force: true,
        asRefresh: true,
        silent: true,
      });
    };

    try {
      window.addEventListener("cuenta:external:refresh", onRefresh);
      window.addEventListener("cuenta:preferences:mutated", onPreferencesMutated);
      window.addEventListener("cuenta:modal:updated", onPreferencesMutated);
      window.addEventListener("cuenta:password:success", onPasswordSuccess);
    } catch {}

    return () => {
      try {
        window.removeEventListener("cuenta:external:refresh", onRefresh);
        window.removeEventListener("cuenta:preferences:mutated", onPreferencesMutated);
        window.removeEventListener("cuenta:modal:updated", onPreferencesMutated);
        window.removeEventListener("cuenta:password:success", onPasswordSuccess);
      } catch {}
    };
  }

  function bind() {
    cleanupBindings();

    if (destroyed) return;

    const container = getContainer();
    const cleanups = [];

    cleanups.push(bindNativeActions(container));
    cleanups.push(bindModalBridgeEvents());
    cleanups.push(bindWindowEvents());

    bindingsCleanup = () => {
      for (const cleanup of cleanups) {
        try {
          cleanup?.();
        } catch {}
      }
    };
  }

  /* =========================================================
     PUBLIC
  ========================================================= */

  async function reload(options = {}) {
    if (destroyed) return api;

    if (inflightReload) {
      return inflightReload;
    }

    inflightReload = (async () => {
      await renderAndLoad({
        force: Boolean(options?.force),
        asRefresh: Boolean(options?.asRefresh),
        silent: Boolean(options?.silent),
      });

      if (!destroyed) {
        bind();
      }

      return api;
    })();

    try {
      return await inflightReload;
    } finally {
      inflightReload = null;
    }
  }

  async function init() {
    if (destroyed) {
      destroyed = false;
    }

    if (inflightInit) {
      return inflightInit;
    }

    if (initialized && !destroyed) {
      ensureBaseState();
      syncFormFromCurrentItem();
      rerender();
      return api;
    }

    initialized = true;
    mounted = false;

    inflightInit = (async () => {
      safeLog("init");

      hydrateBestEffort();
      syncFormFromCurrentItem();

      await renderAndLoad({
        force: false,
        asRefresh: false,
        silent: false,
      });

      try {
        await loadCuentaMeta?.();
      } catch (error) {
        safeWarn("loadCuentaMeta falló:", error);
      }

      try {
        syncViewFormFromItem?.();
      } catch {
        syncFormFromCurrentItem();
      }

      applyCuentaPreferencesSideEffects(getCurrentItem());

      if (!destroyed) {
        bind();
      }

      safeEmit("cuenta:init:done", {
        source: MODULE,
        state: getPublicStateSnapshot(),
      });

      return api;
    })();

    try {
      return await inflightInit;
    } finally {
      inflightInit = null;
    }
  }

  function destroy() {
    destroyed = true;
    initialized = false;
    mounted = false;

    nextRenderToken();
    cleanupScheduledRender();
    cleanupBindings();

    setState({
      refreshing: false,
      loading: false,
      saving: false,
    });

    inflightReload = null;
    inflightSave = null;
    inflightTheme = null;
    inflightLanguage = null;

    safeEmit("cuenta:destroyed", {
      source: MODULE,
    });

    safeLog("destroy");
  }

  function unmount() {
    destroy();
    return true;
  }

  function dispose() {
    destroy();
    return true;
  }

  /* =========================================================
     EXTRAS
  ========================================================= */

  function getItem() {
    return getCurrentItem();
  }

  function getCuenta() {
    return getCurrentItem();
  }

  function getSnapshot() {
    const item = getCurrentItem();

    if (!item) {
      return null;
    }

    try {
      return buildCuentaSnapshot(item);
    } catch {
      return {
        item,
        state: {
          ...cuentaState,
        },
      };
    }
  }

  function getPublicStateSnapshot() {
    return {
      initialized,
      mounted,
      destroyed,
      loading: Boolean(cuentaState.loading),
      refreshing: Boolean(cuentaState.refreshing),
      saving: Boolean(cuentaState.saving),
      hydrated: Boolean(cuentaState.hydrated),
      error: safeText(cuentaState.error, ""),
      lastSyncAt: safeText(cuentaState.lastSyncAt, ""),
      hasItem: Boolean(getCurrentItem()),
      hasInflightInit: Boolean(inflightInit),
      hasInflightReload: Boolean(inflightReload),
      hasInflightSave: Boolean(inflightSave),
      hasInflightTheme: Boolean(inflightTheme),
      hasInflightLanguage: Boolean(inflightLanguage),
      route: {
        browserPath: getBrowserPath(),
        appRoute: getAppRoutePath(),
        publicPath: getAppPublicPath(),
        canRender: canRenderCuentaNow(),
      },
    };
  }

  function getState() {
    return {
      ...cuentaState,
      ...getPublicStateSnapshot(),
      item: getCurrentItem(),
      lastRenderedHtml,
    };
  }

  function openModal() {
    return handleOpenModal();
  }

  function mount() {
    return init();
  }

  function bootstrap() {
    return init();
  }

  function refreshCuenta() {
    return handleRefreshCuenta();
  }

  function save(payload = null) {
    return handleSaveCuenta(payload);
  }

  function updateCuentaLanguage(lang = "es") {
    return handleUpdateLanguage(lang);
  }

  function updateCuentaTheme(darkMode = true) {
    return handleUpdateTheme(darkMode);
  }

  function changePassword() {
    return handlePasswordChange();
  }

  function isInitialized() {
    return Boolean(initialized);
  }

  function isDestroyed() {
    return Boolean(destroyed);
  }

  function isMounted() {
    return Boolean(mounted);
  }

  /* =========================================================
     API
  ========================================================= */

  const api = {
    init,
    mount,
    bootstrap,

    render: rerender,
    rerender,
    scheduleRerender,

    reload,
    refresh: refreshCuenta,
    refreshCuenta,

    destroy,
    unmount,
    dispose,

    saveCuenta: handleSaveCuenta,
    save,

    updateTheme: handleUpdateTheme,
    updateCuentaTheme,

    updateLanguage: handleUpdateLanguage,
    updateCuentaLanguage,

    changePassword,
    updatePassword: changePassword,

    openModal,
    openCuentaModal: openModal,

    getItem,
    getCuenta,
    getSnapshot,
    getCuentaSnapshot: getSnapshot,
    getState,

    canRenderCuentaNow,

    isInitialized,
    isDestroyed,
    isMounted,

    applyCuentaThemeToDom,
    applyCuentaLanguageToDom,
    applyCuentaPreferencesSideEffects,

    get initialized() {
      return initialized;
    },

    get mounted() {
      return mounted;
    },

    get destroyed() {
      return destroyed;
    },
  };

  return api;
})();

export default CuentaView;

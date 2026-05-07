/* =========================================================
   Onion SPA - Cuenta View
   Archivo: src/views/cuenta/cuentaView.js

   EXTREME PRO SYSTEM · VIEW REAL · SPA CORE ALIGNED · 14/10
   ORCHESTRATOR ONLY · NO CSS INLINE · NO STYLE INJECTION
   TEMPLATE OWNER · BINDINGS OWNER · API OWNER · STATE OWNER
   PROFILE / THEME / LANGUAGE / SECURITY READY
   CONFIRM PASSWORD SUPPORT
   DOM / APPCORE / STORAGE SIDE EFFECTS
   ANTI-RACE / ANTI-SPAM / CLEANUP SAFE
   SINGLE RESOURCE MODE REAL PARA /api/user/preferences

   RESPONSABILIDADES:
   - punto de entrada real de la vista cuenta
   - render principal con cuenta.template.js
   - carga inicial robusta con fallback a cache/store/state
   - refresh con loader solo por estado de vista
   - guardado con estado visual de saving
   - cambio de theme con side effects reales en DOM / AppCore / storage
   - cambio de idioma con side effects reales en DOM / AppCore / storage
   - cambio de contraseña delegado por bridge/evento
   - bind de eventos mediante cuenta.bindings.js
   - fallback de bind solo si cuenta.bindings.js no existe
   - evitar doble bind de listeners
   - soportar destroy limpio del router
   - permitir reload con rerender seguro
   - coordinar acciones y bridges sin mezclar responsabilidades
   - conservar compatibilidad con cuenta.template.js premium
   - leer inputs nuevos: nombre / teléfono / confirm password
   - registrar bridge público estable en AppCore.modules/window

   FIXES:
   - sin CSS inline
   - sin banners DOM con estilos
   - sin doble registro de eventos si existe cuenta.bindings.js
   - applyCuentaLanguageToDom soporta silent / force / reason
   - NO dispara app:lang:change en hidratación/carga/sync
   - NO llama I18n.setLanguage en sync silencioso
   - evita toast fantasma "Idioma actualizado"
   - evita eventos globales si theme/lang no cambian
   - rollback de idioma/theme sin toast
   - side effects controlados por intención real
========================================================= */

import { AppCore } from "../../core/index.js";

import * as State from "./cuenta.state.js";
import * as CuentaApi from "./cuenta.api.js";
import * as CuentaStore from "./cuenta.store.js";
import * as CuentaModel from "./cuenta.model.js";
import * as CuentaTemplate from "./cuenta.template.js";
import * as CuentaUtils from "./cuenta.utils.js";
import * as CuentaBindings from "./cuenta.bindings.js";

export const CuentaView = (() => {
  "use strict";

  /* =========================================================
     CONSTANTS
  ========================================================= */

  const SCOPE = "view:cuenta";
  const MODULE = "cuenta";
  const VIEW_NAME = "CuentaView";
  const VERSION = "14.0.0";
  const SOURCE = "views:cuenta:cuentaView";
  const CANONICAL_PATH = "/cuenta";

  const PASSWORD_MIN_LENGTH = 8;
  const RENDER_DEBOUNCE_MS = 0;

  const STORAGE_KEYS = Object.freeze({
    theme: "theme",
    darkMode: "darkMode",
    lang: "lang",
    language: "language",
  });

  const FALLBACK_ITEM_NAME = "Usuario Onion";

  /* =========================================================
     STATE REF
  ========================================================= */

  const cuentaState =
    State.cuentaState ||
    {
      hydrated: false,
      loading: false,
      refreshing: false,
      loaded: false,
      saving: false,
      error: "",
      item: null,
      view: {
        form: {},
      },
      action: {},
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
  let inflightPassword = null;

  let bindingsCleanup = null;
  let scheduledRender = null;
  let renderToken = 0;
  let lastRenderedHtml = "";

  /* =========================================================
     SAFE BASICS
  ========================================================= */

  function isBrowser() {
    return typeof window !== "undefined" && typeof document !== "undefined";
  }

  function getWindow() {
    return isBrowser() ? window : null;
  }

  function getDocument() {
    return isBrowser() ? document : null;
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
      .replace(/\s+/g, " ")
      .replace(/[\s-]+/g, "_")
      .replace(/[^\w]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .trim();
  }

  function safeBoolean(value, fallback = false) {
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

  function normalizeTheme(value = "light", fallbackDarkMode = false) {
    const key = normalizeKey(value);

    if (["dark", "oscuro", "night", "theme_dark"].includes(key)) {
      return "dark";
    }

    if (["light", "claro", "day", "theme_light"].includes(key)) {
      return "light";
    }

    return safeBoolean(fallbackDarkMode, false) ? "dark" : "light";
  }

  function callSafe(fn, ...args) {
    try {
      if (typeof fn === "function") {
        return fn(...args);
      }
    } catch (error) {
      safeWarn("callSafe falló:", error);
    }

    return undefined;
  }

  function safeLog(...args) {
    try {
      if (typeof AppCore?.utils?.log === "function") {
        AppCore.utils.log("[CuentaView]", ...args);
        return;
      }
    } catch {}

    try {
      console.log("[CuentaView]", ...args);
    } catch {}
  }

  function safeWarn(...args) {
    try {
      if (typeof AppCore?.utils?.warn === "function") {
        AppCore.utils.warn("[CuentaView]", ...args);
        return;
      }
    } catch {}

    try {
      console.warn("[CuentaView]", ...args);
    } catch {}
  }

  function safeErrorMessage(error = null, fallback = "No se pudo cargar la cuenta.") {
    return safeText(
      first(
        error?.message,
        error?.response?.message,
        error?.response?.data?.message,
        error?.data?.message,
        error?.response?.error,
        error?.data?.error,
        error?.error,
        error?.code,
        fallback
      ),
      fallback
    );
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
        const win = getWindow();

        if (!win || typeof win.requestAnimationFrame !== "function") {
          setTimeout(resolve, 0);
          return;
        }

        win.requestAnimationFrame(() => {
          win.requestAnimationFrame(resolve);
        });
      } catch {
        resolve();
      }
    });
  }

  function safeEmit(eventName = "", payload = {}) {
    const name = safeText(eventName, "");
    if (!name) return false;

    let emitted = false;

    try {
      if (typeof AppCore?.events?.emit === "function") {
        AppCore.events.emit(name, payload);
        emitted = true;
      }
    } catch {}

    try {
      const win = getWindow();

      if (win && typeof win.CustomEvent === "function") {
        win.dispatchEvent(
          new CustomEvent(name, {
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
    if (!text) return false;

    const normalizedType = normalizeKey(type) || "info";

    try {
      if (typeof CuentaUtils.showToast === "function") {
        const ok = CuentaUtils.showToast(text, normalizedType);
        if (ok !== false) return true;
      }
    } catch {}

    try {
      if (typeof AppCore?.toast?.[normalizedType] === "function") {
        AppCore.toast[normalizedType](text);
        return true;
      }
    } catch {}

    try {
      if (typeof AppCore?.toast?.show === "function") {
        AppCore.toast.show(text, normalizedType);
        return true;
      }
    } catch {}

    try {
      if (typeof AppCore?.ui?.toast?.[normalizedType] === "function") {
        AppCore.ui.toast[normalizedType](text);
        return true;
      }
    } catch {}

    try {
      if (typeof AppCore?.ui?.toast?.show === "function") {
        AppCore.ui.toast.show({
          message: text,
          type: normalizedType,
        });
        return true;
      }
    } catch {}

    try {
      const win = getWindow();

      if (typeof win?.Toast?.show === "function") {
        win.Toast.show({
          message: text,
          type: normalizedType,
        });
        return true;
      }
    } catch {}

    return false;
  }

  /* =========================================================
     DOM / ROUTE HELPERS
  ========================================================= */

  function getContainer() {
    const doc = getDocument();
    if (!doc) return null;

    try {
      return (
        AppCore?.dom?.viewContainer ||
        doc.getElementById("view-container") ||
        doc.querySelector("[data-view-container]") ||
        null
      );
    } catch {
      return null;
    }
  }

  function normalizePathnameOnly(pathname = "/") {
    let value = safeText(pathname, "/")
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
    return safeText(path, "/").split("?")[0].split("#")[0] || "/";
  }

  function getCleanCanonicalPath(path = "/") {
    const raw = stripSearchAndHash(stripUsernamePrefix(path || "/"));

    try {
      if (typeof AppCore?.utils?.normalizeCanonicalPath === "function") {
        return AppCore.utils.normalizeCanonicalPath(raw);
      }
    } catch {}

    try {
      if (typeof AppCore?.utils?.normalizePath === "function") {
        return AppCore.utils.normalizePath(raw);
      }
    } catch {}

    return normalizePathnameOnly(raw);
  }

  function isCuentaPath(path = "") {
    return getCleanCanonicalPath(path || "/") === CANONICAL_PATH;
  }

  function getBrowserPath() {
    const win = getWindow();
    if (!win) return "";

    try {
      const pathname = win.location?.pathname || "/";
      const search = win.location?.search || "";
      const hash = win.location?.hash || "";

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

  function getRouteDebug() {
    const browserPath = getBrowserPath();
    const appRoute = getAppRoutePath();
    const publicPath = getAppPublicPath();

    return {
      browserPath,
      browserCanonicalPath: getCleanCanonicalPath(browserPath || "/"),
      appRoute,
      appCanonicalPath: getCleanCanonicalPath(appRoute || "/"),
      appPublicPath: publicPath,
      appPublicCanonicalPath: getCleanCanonicalPath(publicPath || "/"),
      canRender: canRenderCuentaNow(),
    };
  }

  function nextRenderToken() {
    renderToken += 1;
    return renderToken;
  }

  function isActiveRenderToken(token) {
    return !destroyed && token === renderToken;
  }

  /* =========================================================
     MODEL / STORE HELPERS
  ========================================================= */

  function normalizeCuentaLocal(raw = null) {
    const source = safeObject(raw, null);

    if (!source) return null;

    const rawPreferences = safeObject(source.preferences);
    const rawSettings = safeObject(source.settings);
    const rawRaw = safeObject(source.raw);

    const rawTheme = first(
      source.theme,
      source.mode,
      source.appearance,
      rawPreferences.theme,
      rawPreferences.mode,
      rawPreferences.appearance,
      rawSettings.theme,
      rawSettings.mode,
      rawSettings.appearance,
      rawRaw.theme,
      ""
    );

    const darkMode = safeBoolean(
      first(
        source.darkMode,
        source.isDark,
        rawPreferences.darkMode,
        rawPreferences.isDark,
        rawSettings.darkMode,
        rawRaw.darkMode,
        rawTheme === "dark" ? true : null,
        rawTheme === "light" ? false : null,
        false
      ),
      false
    );

    const theme = normalizeTheme(rawTheme, darkMode);

    const lang = normalizeLang(
      first(
        source.lang,
        source.language,
        source.locale,
        rawPreferences.lang,
        rawPreferences.language,
        rawPreferences.locale,
        rawSettings.lang,
        rawSettings.language,
        rawRaw.lang,
        rawRaw.language,
        "es"
      )
    );

    const email = safeText(
      first(
        source.email,
        source.emailLower,
        rawRaw.email,
        rawRaw.emailLower,
        ""
      ),
      ""
    ).toLowerCase();

    const username = safeText(
      first(
        source.username,
        source.usernameLower,
        source.userName,
        rawRaw.username,
        rawRaw.usernameLower,
        ""
      ),
      ""
    );

    const name = safeText(
      first(
        source.name,
        source.displayName,
        source.fullName,
        source.nombre,
        rawRaw.name,
        rawRaw.displayName,
        username,
        email,
        FALLBACK_ITEM_NAME
      ),
      FALLBACK_ITEM_NAME
    );

    const userId = safeText(
      first(
        source.userId,
        source.id,
        source.uid,
        source.sub,
        rawRaw.userId,
        rawRaw.id,
        ""
      ),
      ""
    );

    const phone = safeText(
      first(
        source.phone,
        source.telefono,
        source.mobile,
        rawRaw.phone,
        rawRaw.telefono,
        rawRaw.mobile,
        ""
      ),
      ""
    );

    const privacyMode = safeBoolean(
      first(
        source.privacyMode,
        source.privateMode,
        rawPreferences.privacyMode,
        rawPreferences.privateMode,
        rawSettings.privacyMode,
        rawRaw.privacyMode,
        false
      ),
      false
    );

    return {
      ...source,

      id: safeText(first(source.id, userId), userId),
      userId,

      name,
      displayName: safeText(first(source.displayName, name), name),
      fullName: safeText(first(source.fullName, name), name),
      nombre: safeText(first(source.nombre, name), name),

      username,
      usernameLower: safeText(first(source.usernameLower, username), username).toLowerCase(),

      email,
      emailLower: safeText(first(source.emailLower, email), email),

      phone,
      telefono: safeText(first(source.telefono, phone), phone),
      mobile: safeText(first(source.mobile, phone), phone),

      role: safeText(first(source.role, source.rol, rawRaw.role, "user"), "user"),
      rol: safeText(first(source.rol, source.role, rawRaw.rol, "user"), "user"),

      status: safeText(first(source.status, source.estado, rawRaw.status, "active"), "active"),
      estado: safeText(first(source.estado, source.status, rawRaw.estado, "active"), "active"),

      darkMode,
      privacyMode,

      theme,
      mode: theme,
      appearance: theme,

      lang,
      language: lang,
      locale: lang,

      updatedAt: first(source.updatedAt, source.updated_at, source.modifiedAt, rawRaw.updatedAt, null),
      createdAt: first(source.createdAt, source.created_at, rawRaw.createdAt, null),
      lastLoginAt: first(source.lastLoginAt, source.lastLogin, source.lastAccessAt, rawRaw.lastLoginAt, null),

      preferences: {
        ...rawPreferences,
        darkMode,
        privacyMode,
        theme,
        mode: theme,
        appearance: theme,
        lang,
        language: lang,
        locale: lang,
      },

      raw: first(source.raw, source),
    };
  }

  function normalizeCuentaModelSafe(raw = null) {
    if (!raw) return null;

    try {
      if (typeof CuentaModel.normalizeCuentaModel === "function") {
        const normalized = CuentaModel.normalizeCuentaModel(raw);
        if (normalized) return normalizeCuentaLocal(normalized);
      }
    } catch (error) {
      safeWarn("normalizeCuentaModel falló:", error);
    }

    try {
      if (typeof CuentaApi.normalizeCuentaDetail === "function") {
        const normalized = CuentaApi.normalizeCuentaDetail(raw);
        if (normalized) return normalizeCuentaLocal(normalized);
      }
    } catch (error) {
      safeWarn("normalizeCuentaDetail falló:", error);
    }

    try {
      if (typeof CuentaUtils.normalizeCuentaPayload === "function") {
        const normalized = CuentaUtils.normalizeCuentaPayload(raw);
        if (normalized) return normalizeCuentaLocal(normalized);
      }
    } catch (error) {
      safeWarn("normalizeCuentaPayload falló:", error);
    }

    return normalizeCuentaLocal(raw);
  }

  function commitCuentaDetail(raw = null) {
    const normalized = normalizeCuentaModelSafe(raw);
    if (!normalized) return null;

    cuentaState.item = normalized;

    try {
      if (typeof State.setItem === "function") {
        State.setItem(normalized);
      } else if (typeof State.setCuentaItem === "function") {
        State.setCuentaItem(normalized);
      } else if (typeof State.patchCuentaState === "function") {
        State.patchCuentaState({ item: normalized });
      }
    } catch (error) {
      safeWarn("No se pudo sincronizar State.item:", error);
    }

    try {
      if (typeof CuentaStore.setCuentaStore === "function") {
        CuentaStore.setCuentaStore(normalized);
      } else if (typeof CuentaStore.setCuenta === "function") {
        CuentaStore.setCuenta(normalized);
      } else if (typeof CuentaStore.updateCuentaStore === "function") {
        CuentaStore.updateCuentaStore(normalized);
      }
    } catch (error) {
      safeWarn("No se pudo sincronizar CuentaStore:", error);
    }

    try {
      if (AppCore?.state?.user && normalized) {
        AppCore.state.user = {
          ...AppCore.state.user,
          name: normalized.name,
          displayName: normalized.displayName,
          fullName: normalized.fullName,
          nombre: normalized.nombre,
          phone: normalized.phone,
          telefono: normalized.telefono,
          lang: normalized.lang,
          language: normalized.language,
          locale: normalized.locale,
          theme: normalized.theme,
          appearance: normalized.appearance,
          darkMode: normalized.darkMode,
          preferences: {
            ...safeObject(AppCore.state.user.preferences),
            ...safeObject(normalized.preferences),
          },
        };
      }
    } catch (error) {
      safeWarn("No se pudo sincronizar AppCore.state.user:", error);
    }

    return normalized;
  }

  function hydrateStoreBestEffort() {
    let hydrated = false;

    try {
      const result =
        CuentaApi.hydrateCuentaFromCache?.() ||
        CuentaApi.hydrateFromCache?.() ||
        null;

      if (result) hydrated = true;
    } catch (error) {
      safeWarn("hydrateCuentaFromCache falló:", error);
    }

    return hydrated;
  }

  function getCurrentItem() {
    try {
      const fromStore =
        CuentaStore.getCuentaStore?.() ||
        CuentaStore.getCuenta?.() ||
        CuentaStore.getItem?.() ||
        null;

      if (fromStore) {
        return normalizeCuentaModelSafe(fromStore);
      }
    } catch (error) {
      safeWarn("getCuentaStore falló:", error);
    }

    try {
      const fromState =
        State.getItem?.() ||
        State.getCuentaItem?.() ||
        cuentaState.item ||
        null;

      if (fromState) {
        return normalizeCuentaModelSafe(fromState);
      }
    } catch (error) {
      safeWarn("getCurrentItem desde State falló:", error);
    }

    try {
      if (AppCore?.state?.user) {
        return normalizeCuentaModelSafe(AppCore.state.user);
      }
    } catch {}

    return null;
  }

  function getCurrentFormState() {
    return safeObject(cuentaState?.view?.form);
  }

  /* =========================================================
     STATE HELPERS
  ========================================================= */

  function setState(patch = {}) {
    if (!patch || typeof patch !== "object") return cuentaState;

    Object.assign(cuentaState, patch);

    try {
      State.patchCuentaState?.(patch);
    } catch {}

    return cuentaState;
  }

  function ensureBaseState() {
    if (typeof cuentaState.loading !== "boolean") cuentaState.loading = false;
    if (typeof cuentaState.refreshing !== "boolean") cuentaState.refreshing = false;
    if (typeof cuentaState.saving !== "boolean") cuentaState.saving = false;
    if (typeof cuentaState.hydrated !== "boolean") cuentaState.hydrated = false;
    if (typeof cuentaState.loaded !== "boolean") cuentaState.loaded = false;

    cuentaState.error = safeText(cuentaState.error, "");
    cuentaState.lastSyncAt = first(cuentaState.lastSyncAt, "") || "";

    if (!cuentaState.view || typeof cuentaState.view !== "object") {
      cuentaState.view = {};
    }

    if (!cuentaState.view.form || typeof cuentaState.view.form !== "object") {
      cuentaState.view.form = {};
    }

    if (!cuentaState.action || typeof cuentaState.action !== "object") {
      cuentaState.action = {};
    }

    return cuentaState;
  }

  function setLoadingFlags({
    loading = cuentaState.loading,
    refreshing = cuentaState.refreshing,
    saving = cuentaState.saving,
  } = {}) {
    const next = {
      loading: Boolean(loading),
      refreshing: Boolean(refreshing),
      saving: Boolean(saving),
    };

    setState(next);

    callSafe(State.setLoading, next.loading);
    callSafe(State.setRefreshing, next.refreshing);
    callSafe(State.setSaving, next.saving);

    return cuentaState;
  }

  function markIdle() {
    setLoadingFlags({
      loading: false,
      refreshing: false,
      saving: Boolean(cuentaState.saving),
    });

    return cuentaState;
  }

  function markLoadedOk(detail = null) {
    const normalized = detail ? commitCuentaDetail(detail) : getCurrentItem();

    setState({
      loading: false,
      refreshing: false,
      error: "",
      hydrated: true,
      loaded: true,
      lastSyncAt: new Date().toISOString(),
    });

    callSafe(State.setHydrated, true);
    callSafe(State.setLoaded, true);
    callSafe(State.setError, "");
    callSafe(State.setLastSyncAt, cuentaState.lastSyncAt);

    if (normalized) {
      syncFormFromDetail(normalized);
    }

    return normalized;
  }

  function setActionFlags(patch = {}) {
    cuentaState.action = {
      ...safeObject(cuentaState.action),
      ...safeObject(patch),
    };

    callSafe(State.patchActionState, patch);

    return cuentaState.action;
  }

  function patchFormSafe(payload = {}) {
    const nextPayload = safeObject(payload);

    try {
      if (typeof State.patchViewForm === "function") {
        State.patchViewForm(nextPayload);
      } else if (typeof State.setViewForm === "function") {
        State.setViewForm({
          ...getCurrentFormState(),
          ...nextPayload,
        });
      } else {
        cuentaState.view = cuentaState.view || {};
        cuentaState.view.form = {
          ...safeObject(cuentaState.view.form),
          ...nextPayload,
        };
      }
    } catch {
      cuentaState.view = cuentaState.view || {};
      cuentaState.view.form = {
        ...safeObject(cuentaState.view.form),
        ...nextPayload,
      };
    }

    return getCurrentFormState();
  }

  function syncFormFromDetail(detail = null) {
    const item = normalizeCuentaModelSafe(detail || getCurrentItem());

    if (!item) {
      return getCurrentFormState();
    }

    const payload = {
      name: safeText(
        first(
          item.name,
          item.displayName,
          item.fullName,
          item.nombre,
          item.raw?.name,
          item.raw?.displayName,
          ""
        ),
        ""
      ),

      displayName: safeText(
        first(
          item.displayName,
          item.name,
          item.fullName,
          item.nombre,
          ""
        ),
        ""
      ),

      fullName: safeText(
        first(
          item.fullName,
          item.displayName,
          item.name,
          item.nombre,
          ""
        ),
        ""
      ),

      phone: safeText(
        first(
          item.phone,
          item.telefono,
          item.mobile,
          item.raw?.phone,
          item.raw?.telefono,
          ""
        ),
        ""
      ),

      telefono: safeText(
        first(
          item.telefono,
          item.phone,
          item.mobile,
          ""
        ),
        ""
      ),

      email: safeText(
        first(
          item.email,
          item.emailLower,
          item.raw?.email,
          item.raw?.emailLower,
          ""
        ),
        ""
      ),

      username: safeText(
        first(
          item.username,
          item.usernameLower,
          item.raw?.username,
          item.raw?.usernameLower,
          ""
        ),
        ""
      ),

      darkMode: safeBoolean(
        first(
          item.darkMode,
          item.isDark,
          item.theme === "dark" ? true : null,
          item.theme === "light" ? false : null,
          item.appearance === "dark" ? true : null,
          item.raw?.darkMode,
          item.raw?.theme === "dark" ? true : null,
          false
        ),
        false
      ),

      privacyMode: safeBoolean(
        first(
          item.privacyMode,
          item.privateMode,
          item.raw?.privacyMode,
          false
        ),
        false
      ),

      lang: normalizeLang(
        first(
          item.lang,
          item.language,
          item.locale,
          item.raw?.lang,
          item.raw?.language,
          item.raw?.locale,
          "es"
        )
      ),
    };

    payload.language = payload.lang;
    payload.locale = payload.lang;
    payload.theme = payload.darkMode ? "dark" : "light";
    payload.mode = payload.theme;
    payload.appearance = payload.theme;

    try {
      if (typeof State.setViewForm === "function") {
        State.setViewForm(payload);
      } else {
        patchFormSafe(payload);
      }
    } catch {
      patchFormSafe(payload);
    }

    return payload;
  }

  function syncFormFromCurrentItem() {
    return syncFormFromDetail(getCurrentItem());
  }

  function clearViewMessages() {
    try {
      State.clearViewErrors?.();
    } catch {}

    try {
      State.clearViewSuccess?.();
    } catch {}

    try {
      State.setViewServerError?.("");
    } catch {}

    try {
      cuentaState.error = "";
      if (cuentaState.view && typeof cuentaState.view === "object") {
        cuentaState.view.successMessage = "";
        cuentaState.view.serverError = "";
      }
    } catch {}
  }

  /* =========================================================
     DOM READERS
  ========================================================= */

  function getFieldValue(container, selectors = [], fallback = "") {
    for (const selector of safeArray(selectors)) {
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
    for (const selector of safeArray(selectors)) {
      try {
        const node = container?.querySelector?.(selector);

        if (!node) continue;

        if (typeof node.checked === "boolean") {
          return Boolean(node.checked);
        }

        return safeBoolean(
          first(
            node.getAttribute?.("aria-checked"),
            node.dataset?.checked,
            node.dataset?.value,
            node.value
          ),
          fallback
        );
      } catch {}
    }

    return fallback;
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
        '[data-cuenta-field="name"]',
        '[data-field="name"]',
        '[name="name"]',
        '[name="displayName"]',
      ],
      safeText(
        first(
          currentForm.name,
          currentForm.displayName,
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
        '[data-cuenta-field="phone"]',
        '[data-field="phone"]',
        '[name="phone"]',
        '[name="telefono"]',
      ],
      safeText(
        first(
          currentForm.phone,
          currentForm.telefono,
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
        '[data-cuenta-field="email"]',
        '[data-field="email"]',
        '[name="email"]',
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
        '[data-cuenta-field="username"]',
        '[data-field="username"]',
        '[name="username"]',
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
        '[data-cuenta-field="darkMode"]',
        '[data-field="darkMode"]',
        '[name="darkMode"]',
      ],
      safeBoolean(
        first(
          currentForm.darkMode,
          item?.darkMode,
          item?.theme === "dark" ? true : null,
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
        '[data-role="cuenta-privacy-input"]',
        "#cuenta-privacymode-input",
        "#cuenta-privacy-input",
        '[data-cuenta-field="privacyMode"]',
        '[data-field="privacyMode"]',
        '[name="privacyMode"]',
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
          '[data-cuenta-field="lang"]',
          '[data-field="lang"]',
          '[data-field="language"]',
          '[name="lang"]',
          '[name="language"]',
        ],
        safeText(
          first(
            currentForm.lang,
            currentForm.language,
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

    const theme = darkMode ? "dark" : "light";

    return {
      name,
      displayName: name,
      fullName: name,

      phone,
      telefono: phone,

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

  function readPasswordPayloadFromDom() {
    const container = getContainer();

    const currentPassword = getFieldValue(
      container,
      [
        '[data-role="cuenta-current-password"]',
        "#cuenta-current-password",
        '[data-cuenta-field="currentPassword"]',
        '[data-field="currentPassword"]',
        '[name="currentPassword"]',
      ],
      ""
    );

    const newPassword = getFieldValue(
      container,
      [
        '[data-role="cuenta-new-password"]',
        "#cuenta-new-password",
        '[data-cuenta-field="newPassword"]',
        '[data-field="newPassword"]',
        '[name="newPassword"]',
      ],
      ""
    );

    const confirmPassword = getFieldValue(
      container,
      [
        '[data-role="cuenta-confirm-password"]',
        "#cuenta-confirm-password",
        '[data-cuenta-field="confirmPassword"]',
        '[data-field="confirmPassword"]',
        '[name="confirmPassword"]',
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
        '[name="currentPassword"]',
      ],
      next: [
        '[data-role="cuenta-new-password"]',
        "#cuenta-new-password",
        '[name="newPassword"]',
      ],
      confirm: [
        '[data-role="cuenta-confirm-password"]',
        "#cuenta-confirm-password",
        '[name="confirmPassword"]',
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

  function clearPasswordFields() {
    const container = getContainer();

    const selectors = [
      '[data-role="cuenta-current-password"]',
      '[data-role="cuenta-new-password"]',
      '[data-role="cuenta-confirm-password"]',
      "#cuenta-current-password",
      "#cuenta-new-password",
      "#cuenta-confirm-password",
      '[name="currentPassword"]',
      '[name="newPassword"]',
      '[name="confirmPassword"]',
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
     THEME / LANGUAGE SIDE EFFECTS
  ========================================================= */

  function resolveThemeMode(value = true) {
    return safeBoolean(value, false) ? "dark" : "light";
  }

  function getStoredValue(key = "") {
    try {
      const win = getWindow();

      if (!win?.localStorage) return "";

      return safeText(win.localStorage.getItem(key) || "", "");
    } catch {
      return "";
    }
  }

  function setStoredValue(key = "", value = "") {
    try {
      const win = getWindow();

      if (!win?.localStorage) return false;

      win.localStorage.setItem(key, String(value));
      return true;
    } catch {
      return false;
    }
  }

  function getCurrentThemeValue() {
    const doc = getDocument();

    const storedTheme = getStoredValue(STORAGE_KEYS.theme);
    const storedDarkMode = getStoredValue(STORAGE_KEYS.darkMode);

    const rawTheme = first(
      AppCore?.state?.theme,
      AppCore?.state?.appearance,
      doc?.documentElement?.dataset?.theme,
      doc?.body?.getAttribute?.("data-theme"),
      storedTheme,
      ""
    );

    if (rawTheme) {
      return normalizeTheme(
        rawTheme,
        safeBoolean(first(AppCore?.state?.darkMode, storedDarkMode), false)
      );
    }

    return safeBoolean(first(AppCore?.state?.darkMode, storedDarkMode), false)
      ? "dark"
      : "light";
  }

  function getCurrentLanguageValue() {
    const doc = getDocument();

    const storedLang =
      getStoredValue(STORAGE_KEYS.lang) ||
      getStoredValue(STORAGE_KEYS.language);

    return normalizeLang(
      first(
        AppCore?.state?.lang,
        AppCore?.state?.language,
        AppCore?.state?.locale,
        doc?.documentElement?.dataset?.lang,
        doc?.documentElement?.lang,
        storedLang,
        "es"
      )
    );
  }

  function applyCuentaThemeToDom(darkMode = true, options = {}) {
    const doc = getDocument();
    const opts = safeObject(options);

    const theme = resolveThemeMode(darkMode);
    const isDark = theme === "dark";
    const previousTheme = getCurrentThemeValue();

    const changed = previousTheme !== theme;
    const silent = opts.silent === true;
    const force = opts.force === true;
    const reason = safeText(opts.reason, "theme-sync");

    try {
      if (doc?.documentElement) {
        doc.documentElement.dataset.theme = theme;
        doc.documentElement.setAttribute("data-theme", theme);
        doc.documentElement.classList.toggle("theme-dark", isDark);
        doc.documentElement.classList.toggle("theme-light", !isDark);
        doc.documentElement.classList.toggle("dark", isDark);
        doc.documentElement.classList.toggle("light", !isDark);
      }
    } catch {}

    try {
      if (doc?.body) {
        doc.body.setAttribute("data-theme", theme);
        doc.body.classList.toggle("theme-dark", isDark);
        doc.body.classList.toggle("theme-light", !isDark);
        doc.body.classList.toggle("dark", isDark);
        doc.body.classList.toggle("light", !isDark);
      }
    } catch {}

    try {
      AppCore.state = AppCore.state || {};
      AppCore.state.theme = theme;
      AppCore.state.appearance = theme;
      AppCore.state.darkMode = isDark;
    } catch {}

    try {
      AppCore?.prefs?.set?.("theme", theme);
      AppCore?.prefs?.set?.("darkMode", isDark);
    } catch {}

    setStoredValue(STORAGE_KEYS.theme, theme);
    setStoredValue(STORAGE_KEYS.darkMode, String(isDark));

    if ((changed || force) && !silent) {
      try {
        AppCore?.setTheme?.(theme);
      } catch {}

      const payload = {
        theme,
        appearance: theme,
        darkMode: isDark,
        previousTheme,
        changed,
        silent,
        reason,
        source: MODULE,
        view: VIEW_NAME,
      };

      safeEmit("app:theme:change", payload);
      safeEmit("cuenta:theme:applied", payload);
    }

    return theme;
  }

  function applyCuentaLanguageToDom(lang = "es", options = {}) {
    const doc = getDocument();
    const opts = safeObject(options);

    const nextLang = normalizeLang(lang);
    const previousLang = getCurrentLanguageValue();

    const changed = previousLang !== nextLang;
    const silent = opts.silent === true;
    const force = opts.force === true;
    const reason = safeText(opts.reason, "language-sync");

    try {
      if (doc?.documentElement) {
        doc.documentElement.lang = nextLang;
        doc.documentElement.dataset.lang = nextLang;
      }
    } catch {}

    try {
      doc?.body?.setAttribute?.("data-lang", nextLang);
    } catch {}

    try {
      AppCore.state = AppCore.state || {};
      AppCore.state.lang = nextLang;
      AppCore.state.language = nextLang;
      AppCore.state.locale = nextLang;
    } catch {}

    setStoredValue(STORAGE_KEYS.lang, nextLang);
    setStoredValue(STORAGE_KEYS.language, nextLang);

    if ((changed || force) && !silent) {
      try {
        AppCore?.setLang?.(nextLang, {
          silent: true,
          noToast: true,
          source: MODULE,
        });
      } catch {}

      try {
        AppCore?.setLanguage?.(nextLang, {
          silent: true,
          noToast: true,
          source: MODULE,
        });
      } catch {}

      try {
        AppCore?.i18n?.setLanguage?.(nextLang, {
          silent: true,
          noToast: true,
          source: MODULE,
        });
      } catch {}

      try {
        AppCore?.i18n?.setLang?.(nextLang, {
          silent: true,
          noToast: true,
          source: MODULE,
        });
      } catch {}

      try {
        getWindow()?.I18n?.setLanguage?.(nextLang, {
          silent: true,
          noToast: true,
          source: MODULE,
        });
      } catch {}

      try {
        getWindow()?.I18n?.setLang?.(nextLang, {
          silent: true,
          noToast: true,
          source: MODULE,
        });
      } catch {}

      const payload = {
        lang: nextLang,
        language: nextLang,
        locale: nextLang,
        previousLang,
        changed,
        silent,
        noToast: true,
        reason,
        source: MODULE,
        view: VIEW_NAME,
      };

      safeEmit("app:lang:change", payload);
      safeEmit("cuenta:language:applied", payload);
    }

    return nextLang;
  }

  function applyCuentaPreferencesSideEffects(detail = null, options = {}) {
    const opts = safeObject(options);
    const item = normalizeCuentaModelSafe(detail || getCurrentItem());

    if (!item) return null;

    const darkMode = safeBoolean(
      first(
        item.darkMode,
        item.theme === "dark" ? true : null,
        item.appearance === "dark" ? true : null,
        item.raw?.darkMode,
        item.raw?.theme === "dark" ? true : null,
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

    const silent = opts.silent !== false;

    applyCuentaThemeToDom(darkMode, {
      silent,
      force: opts.forceTheme === true,
      reason: safeText(opts.reason, "preferences-theme-sync"),
    });

    applyCuentaLanguageToDom(lang, {
      silent,
      force: opts.forceLanguage === true,
      reason: safeText(opts.reason, "preferences-language-sync"),
    });

    return item;
  }

  /* =========================================================
     HYDRATION
  ========================================================= */

  function hydrateBestEffort() {
    let hydrated = false;

    hydrateStoreBestEffort();

    try {
      const item = getCurrentItem();

      if (item) {
        commitCuentaDetail(item);
        syncFormFromDetail(item);

        applyCuentaPreferencesSideEffects(item, {
          silent: true,
          reason: "hydrate",
        });

        callSafe(State.setHydrated, true);

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
      const modal = getWindow()?.OnionCuentaModal;

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
      const win = getWindow();
      const hook =
        win?.renderCuentaModal ||
        win?.openCuentaModal ||
        win?.showCuentaModal;

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
      view: VIEW_NAME,
    });

    return true;
  }

  function passwordChangeBridge(payload = {}) {
    const data = safeObject(payload);
    const win = getWindow();

    try {
      const passwordApi = win?.OnionCuentaPassword;

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
      const modal = win?.OnionCuentaModal;

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
        win?.changeCuentaPassword ||
        win?.updateCuentaPassword ||
        win?.renderCuentaPasswordModal ||
        win?.openCuentaPasswordModal;

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
     RENDER
  ========================================================= */

  function renderTemplateSafe({ item = null, state = cuentaState } = {}) {
    try {
      if (typeof CuentaTemplate.renderCuentaTemplate === "function") {
        return CuentaTemplate.renderCuentaTemplate({
          item,
          state,
          actions: api,
        });
      }
    } catch (error) {
      safeWarn("renderCuentaTemplate falló:", error);
    }

    return `
      <div class="cuenta-view" data-cuenta-fallback="true">
        <section class="cuenta-state">
          <h1>Cuenta</h1>
          <p>No se pudo renderizar la plantilla de cuenta.</p>
        </section>
      </div>
    `;
  }

  function buildHtml() {
    const item = getCurrentItem();

    return `
      <section
        class="panel-content dashboard ready"
        data-view="cuenta"
        data-module="cuenta"
        data-cuenta-view="true"
        data-cuenta-loading="${cuentaState.loading ? "true" : "false"}"
        data-cuenta-refreshing="${cuentaState.refreshing ? "true" : "false"}"
        data-cuenta-saving="${cuentaState.saving ? "true" : "false"}"
      >
        <div class="content-wrapper">
          ${renderTemplateSafe({
            item,
            state: cuentaState,
          })}
        </div>
      </section>
    `;
  }

  function decorateDom(container) {
    if (!container) return container;

    try {
      container.setAttribute("data-cuenta-mounted", "true");
      container.setAttribute("data-cuenta-view-version", VERSION);
    } catch {}

    return container;
  }

  function render() {
    if (destroyed) return null;

    if (!canRenderCuentaNow()) {
      safeWarn("Render bloqueado: la ruta actual no es /cuenta.", getRouteDebug());
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

    callSafe(State.setHydrated, true);
    cuentaState.hydrated = true;

    safeEmit("cuenta:rendered", {
      source: MODULE,
      view: VIEW_NAME,
      version: VERSION,
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

    setLoadingFlags({
      loading: !hasVisibleData && !silent,
      refreshing: hasVisibleData && asRefresh && !silent,
      saving: Boolean(cuentaState.saving),
    });

    setState({
      error: "",
    });

    render();

    try {
      const detail = await CuentaApi.loadCuenta?.({
        force,
      });

      const normalized = markLoadedOk(detail || getCurrentItem());

      applyCuentaPreferencesSideEffects(normalized, {
        silent: true,
        reason: "load-data",
      });

      try {
        State.syncViewFormFromItem?.();
      } catch {
        syncFormFromDetail(normalized);
      }

      safeEmit("cuenta:loaded", {
        detail: normalized,
        source: MODULE,
        view: VIEW_NAME,
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
        loaded: true,
      });

      callSafe(State.setHydrated, true);
      callSafe(State.setLoaded, true);
      callSafe(State.setError, message);

      if (!silent) {
        showToast(message, "error");
      }

      safeEmit("cuenta:load:error", {
        error,
        message,
        source: MODULE,
        view: VIEW_NAME,
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

    if (!isActiveRenderToken(token)) {
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

    const name = safeText(first(merged.name, merged.displayName, ""), "");
    const phone = safeText(first(merged.phone, merged.telefono, ""), "");
    const darkMode = safeBoolean(merged.darkMode, false);
    const privacyMode = safeBoolean(merged.privacyMode, false);
    const lang = normalizeLang(first(merged.lang, merged.language, merged.locale, "es"));
    const theme = darkMode ? "dark" : "light";

    return {
      ...merged,

      name,
      displayName: name,
      fullName: safeText(first(merged.fullName, name), name),

      phone,
      telefono: phone,

      email: safeText(merged.email, ""),
      username: safeText(merged.username, ""),

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

  async function handleSaveCuenta(payload = null) {
    if (destroyed) return null;

    if (inflightSave) {
      return inflightSave;
    }

    inflightSave = (async () => {
      const nextPayload = buildPreferenceUpdatePayload(payload);

      clearViewMessages();

      patchFormSafe({
        name: nextPayload.name,
        displayName: nextPayload.displayName,
        fullName: nextPayload.fullName,
        phone: nextPayload.phone,
        telefono: nextPayload.telefono,
        darkMode: nextPayload.darkMode,
        privacyMode: nextPayload.privacyMode,
        lang: nextPayload.lang,
        language: nextPayload.lang,
        locale: nextPayload.lang,
        theme: nextPayload.theme,
        mode: nextPayload.theme,
        appearance: nextPayload.theme,
      });

      setState({
        saving: true,
        error: "",
      });

      setActionFlags({
        savingPreferences: true,
      });

      callSafe(State.setSaving, true);
      callSafe(State.setSavingPreferences, true);

      rerender();
      await waitForPaint();

      try {
        const detail = await CuentaApi.updateCuenta?.(nextPayload);
        const normalized = commitCuentaDetail(detail || getCurrentItem());

        applyCuentaPreferencesSideEffects(normalized, {
          silent: true,
          reason: "save-preferences-success",
        });

        syncFormFromDetail(normalized);

        try {
          State.syncViewFormFromItem?.();
        } catch {}

        try {
          State.setViewSuccess?.({
            successMessage: "Preferencias guardadas correctamente.",
            updatedAt: normalized?.updatedAt || new Date().toISOString(),
          });
        } catch {}

        safeEmit("cuenta:update:success", {
          detail: normalized,
          payload: nextPayload,
          source: MODULE,
          view: VIEW_NAME,
        });

        showToast("Preferencias guardadas", "success");

        return normalized;
      } catch (error) {
        const message = safeErrorMessage(error, "No se pudieron guardar las preferencias.");

        safeWarn("handleSaveCuenta falló:", error);

        syncFormFromCurrentItem();

        try {
          State.setViewServerError?.(message);
        } catch {}

        setState({
          error: message,
        });

        safeEmit("cuenta:update:error", {
          error,
          message,
          source: MODULE,
          view: VIEW_NAME,
        });

        showToast(message, "error");

        return null;
      } finally {
        setState({
          saving: false,
        });

        setActionFlags({
          savingPreferences: false,
        });

        callSafe(State.setSaving, false);
        callSafe(State.setSavingPreferences, false);

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
      const previousItem = getCurrentItem();
      const previousDarkMode = safeBoolean(
        first(
          previousItem?.darkMode,
          previousItem?.theme === "dark" ? true : null,
          getCurrentThemeValue() === "dark"
        ),
        false
      );

      const currentPayload = buildPreferenceUpdatePayload({
        darkMode: nextDarkMode,
        theme: nextDarkMode ? "dark" : "light",
        mode: nextDarkMode ? "dark" : "light",
        appearance: nextDarkMode ? "dark" : "light",
      });

      clearViewMessages();

      patchFormSafe({
        ...currentPayload,
        darkMode: nextDarkMode,
        theme: nextDarkMode ? "dark" : "light",
        mode: nextDarkMode ? "dark" : "light",
        appearance: nextDarkMode ? "dark" : "light",
      });

      setState({
        saving: true,
        error: "",
      });

      setActionFlags({
        savingTheme: true,
      });

      callSafe(State.setSaving, true);
      callSafe(State.setSavingTheme, true);

      applyCuentaThemeToDom(nextDarkMode, {
        silent: false,
        force: true,
        reason: "manual-theme-optimistic",
      });

      rerender();
      await waitForPaint();

      try {
        const detail =
          typeof CuentaApi.updateCuentaTheme === "function"
            ? await CuentaApi.updateCuentaTheme(nextDarkMode)
            : await CuentaApi.updateCuenta?.({
                ...currentPayload,
                darkMode: nextDarkMode,
                theme: nextDarkMode ? "dark" : "light",
                mode: nextDarkMode ? "dark" : "light",
                appearance: nextDarkMode ? "dark" : "light",
              });

        const normalized = commitCuentaDetail(detail || getCurrentItem());

        applyCuentaPreferencesSideEffects(normalized, {
          silent: true,
          reason: "manual-theme-success",
        });

        syncFormFromDetail(normalized);

        try {
          State.setViewSuccess?.({
            successMessage: "Tema actualizado correctamente.",
            updatedAt: normalized?.updatedAt || new Date().toISOString(),
          });
        } catch {}

        safeEmit("cuenta:theme:update:success", {
          detail: normalized,
          darkMode: nextDarkMode,
          theme: nextDarkMode ? "dark" : "light",
          source: MODULE,
          view: VIEW_NAME,
        });

        showToast("Tema actualizado", "success");

        return normalized;
      } catch (error) {
        const message = safeErrorMessage(error, "No se pudo actualizar el tema.");

        safeWarn("handleUpdateTheme falló:", error);

        syncFormFromCurrentItem();

        applyCuentaThemeToDom(previousDarkMode, {
          silent: true,
          force: true,
          reason: "manual-theme-rollback",
        });

        applyCuentaPreferencesSideEffects(getCurrentItem(), {
          silent: true,
          reason: "manual-theme-error-sync",
        });

        try {
          State.setViewServerError?.(message);
        } catch {}

        setState({
          error: message,
        });

        safeEmit("cuenta:theme:update:error", {
          error,
          message,
          darkMode: nextDarkMode,
          source: MODULE,
          view: VIEW_NAME,
        });

        showToast(message, "error");

        return null;
      } finally {
        setState({
          saving: false,
        });

        setActionFlags({
          savingTheme: false,
        });

        callSafe(State.setSaving, false);
        callSafe(State.setSavingTheme, false);

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
      const previousItem = getCurrentItem();
      const previousLang = normalizeLang(
        first(
          previousItem?.lang,
          previousItem?.language,
          previousItem?.locale,
          getCurrentLanguageValue(),
          "es"
        )
      );

      const currentPayload = buildPreferenceUpdatePayload({
        lang: nextLang,
        language: nextLang,
        locale: nextLang,
      });

      clearViewMessages();

      patchFormSafe({
        ...currentPayload,
        lang: nextLang,
        language: nextLang,
        locale: nextLang,
      });

      setState({
        saving: true,
        error: "",
      });

      setActionFlags({
        savingLanguage: true,
      });

      callSafe(State.setSaving, true);
      callSafe(State.setSavingLanguage, true);

      applyCuentaLanguageToDom(nextLang, {
        silent: true,
        force: true,
        reason: "manual-language-optimistic",
      });

      rerender();
      await waitForPaint();

      try {
        const detail =
          typeof CuentaApi.updateCuentaLanguage === "function"
            ? await CuentaApi.updateCuentaLanguage(nextLang)
            : await CuentaApi.updateCuenta?.({
                ...currentPayload,
                lang: nextLang,
                language: nextLang,
                locale: nextLang,
              });

        const normalized = commitCuentaDetail(detail || getCurrentItem());

        applyCuentaPreferencesSideEffects(normalized, {
          silent: true,
          reason: "manual-language-success",
        });

        syncFormFromDetail(normalized);

        try {
          State.setViewSuccess?.({
            successMessage: "Idioma actualizado correctamente.",
            updatedAt: normalized?.updatedAt || new Date().toISOString(),
          });
        } catch {}

        safeEmit("cuenta:language:update:success", {
          detail: normalized,
          lang: nextLang,
          language: nextLang,
          locale: nextLang,
          source: MODULE,
          view: VIEW_NAME,
          noToast: true,
        });

        return normalized;
      } catch (error) {
        const message = safeErrorMessage(error, "No se pudo actualizar el idioma.");

        safeWarn("handleUpdateLanguage falló:", error);

        syncFormFromCurrentItem();

        applyCuentaLanguageToDom(previousLang, {
          silent: true,
          force: true,
          reason: "manual-language-rollback",
        });

        applyCuentaPreferencesSideEffects(getCurrentItem(), {
          silent: true,
          reason: "manual-language-error-sync",
        });

        try {
          State.setViewServerError?.(message);
        } catch {}

        setState({
          error: message,
        });

        safeEmit("cuenta:language:update:error", {
          error,
          message,
          lang: nextLang,
          source: MODULE,
          view: VIEW_NAME,
        });

        showToast(message, "error");

        return null;
      } finally {
        setState({
          saving: false,
        });

        setActionFlags({
          savingLanguage: false,
        });

        callSafe(State.setSaving, false);
        callSafe(State.setSavingLanguage, false);

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
        view: VIEW_NAME,
      });

      return item;
    } catch (error) {
      safeWarn("handleRefreshCuenta falló:", error);

      safeEmit("cuenta:refresh:error", {
        error,
        source: MODULE,
        view: VIEW_NAME,
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

  async function handlePasswordChange(payload = null) {
    if (destroyed) return false;

    if (inflightPassword) {
      return inflightPassword;
    }

    inflightPassword = (async () => {
      const domPayload = readPasswordPayloadFromDom();

      const finalPayload = {
        ...domPayload,
        ...safeObject(payload),
      };

      const currentPassword = safeText(finalPayload.currentPassword, "");
      const newPassword = safeText(finalPayload.newPassword, "");
      const confirmPassword = safeText(finalPayload.confirmPassword, "");

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

      setActionFlags({
        changingPassword: true,
      });

      callSafe(State.setSaving, true);
      callSafe(State.setChangingPassword, true);

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

        safeEmit("cuenta:password:error", {
          error,
          message,
          source: MODULE,
          view: VIEW_NAME,
        });

        showToast(message, "error");

        return false;
      } finally {
        setState({
          saving: false,
        });

        setActionFlags({
          changingPassword: false,
        });

        callSafe(State.setSaving, false);
        callSafe(State.setChangingPassword, false);

        inflightPassword = null;

        if (!destroyed) {
          rerender();
        }
      }
    })();

    return inflightPassword;
  }

  /* =========================================================
     BINDINGS
  ========================================================= */

  function bindFallbackEvents(container) {
    if (!container) {
      return () => {};
    }

    const getActionTarget = (event, actions = []) => {
      const selectors = actions
        .map((action) =>
          [
            `[data-cuenta-action="${action}"]`,
            `[data-action="${action}"]`,
          ].join(",")
        )
        .join(",");

      if (!selectors) return null;

      return event.target?.closest?.(selectors) || null;
    };

    const onClick = async (event) => {
      if (destroyed) return;

      const openModalBtn =
        getActionTarget(event, ["open-cuenta-modal", "open-modal", "detail"]) ||
        event.target?.closest?.("#cuenta-open-modal-btn");

      if (openModalBtn) {
        event.preventDefault();
        event.stopPropagation();
        handleOpenModal();
        return;
      }

      const retryBtn =
        getActionTarget(event, ["retry", "retry-cuenta"]) ||
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
        getActionTarget(event, ["refresh", "reload", "refresh-cuenta"]) ||
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
        getActionTarget(event, ["save", "save-cuenta"]) ||
        event.target?.closest?.("#cuenta-save-btn");

      if (saveBtn) {
        event.preventDefault();
        await handleSaveCuenta();
        return;
      }

      const toggleThemeBtn =
        getActionTarget(event, ["toggle-theme", "change-theme", "update-theme"]);

      if (toggleThemeBtn) {
        event.preventDefault();

        const currentPayload = readFormPayloadFromDom();
        const nextDarkMode = !safeBoolean(currentPayload.darkMode, false);

        await handleUpdateTheme(nextDarkMode);
        return;
      }

      const languageBtn =
        getActionTarget(event, ["change-language", "update-language", "apply-language"]);

      if (languageBtn) {
        event.preventDefault();

        const payload = readFormPayloadFromDom();

        await handleUpdateLanguage(payload.lang);
        return;
      }

      const passwordBtn =
        getActionTarget(event, ["change-password", "update-password"]) ||
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
          language: normalizeLang(languageSelect.value),
          locale: normalizeLang(languageSelect.value),
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

  function bindExternalEventsFallback() {
    const bus = AppCore?.events;
    const win = getWindow();

    const onRefresh = async () => {
      if (destroyed) return;
      await handleRefreshCuenta();
    };

    const onUpdateTheme = async (event) => {
      if (destroyed) return;

      const payload = getEventPayload(event);

      const darkMode = safeBoolean(
        first(
          payload.darkMode,
          payload.detail?.darkMode,
          payload.theme === "dark" ? true : null,
          payload.theme === "light" ? false : null,
          true
        ),
        true
      );

      await handleUpdateTheme(darkMode);
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

      await handleSaveCuenta({
        ...readFormPayloadFromDom(),
        ...safeObject(payload),
        ...safeObject(payload.detail),
      });
    };

    try {
      bus?.on?.("cuenta:modal:refresh", onRefresh);
      bus?.on?.("cuenta:modal:update-theme", onUpdateTheme);
      bus?.on?.("cuenta:modal:update-language", onUpdateLanguage);
      bus?.on?.("cuenta:modal:update-preferences", onUpdatePreferences);

      bus?.on?.("cuenta:external:refresh", onRefresh);
      bus?.on?.("cuenta:preferences:mutated", onRefresh);
      bus?.on?.("cuenta:password:success", onRefresh);
    } catch {}

    try {
      win?.addEventListener?.("cuenta:external:refresh", onRefresh);
      win?.addEventListener?.("cuenta:preferences:mutated", onRefresh);
      win?.addEventListener?.("cuenta:modal:updated", onRefresh);
      win?.addEventListener?.("cuenta:password:success", onRefresh);
    } catch {}

    return () => {
      try { bus?.off?.("cuenta:modal:refresh", onRefresh); } catch {}
      try { bus?.off?.("cuenta:modal:update-theme", onUpdateTheme); } catch {}
      try { bus?.off?.("cuenta:modal:update-language", onUpdateLanguage); } catch {}
      try { bus?.off?.("cuenta:modal:update-preferences", onUpdatePreferences); } catch {}

      try { bus?.off?.("cuenta:external:refresh", onRefresh); } catch {}
      try { bus?.off?.("cuenta:preferences:mutated", onRefresh); } catch {}
      try { bus?.off?.("cuenta:password:success", onRefresh); } catch {}

      try {
        win?.removeEventListener?.("cuenta:external:refresh", onRefresh);
        win?.removeEventListener?.("cuenta:preferences:mutated", onRefresh);
        win?.removeEventListener?.("cuenta:modal:updated", onRefresh);
        win?.removeEventListener?.("cuenta:password:success", onRefresh);
      } catch {}
    };
  }

  function bind() {
    cleanupBindings();

    if (destroyed) return;

    const container = getContainer();

    if (!container) {
      return;
    }

    try {
      if (typeof CuentaBindings.bindCuentaEvents === "function") {
        const cleanup = CuentaBindings.bindCuentaEvents({
          root: container,
          scope: SCOPE,

          state: cuentaState,
          api,

          loadCuenta: CuentaApi.loadCuenta,
          updateCuenta: handleSaveCuenta,
          saveCuenta: handleSaveCuenta,
          updateCuentaTheme: handleUpdateTheme,
          updateCuentaLanguage: handleUpdateLanguage,
          changePassword: handlePasswordChange,

          reload,
          refresh: handleRefreshCuenta,
          openModal: handleOpenModal,

          getItem,
          getCuenta,
          getSnapshot,
          getState,
          readFormPayload: readFormPayloadFromDom,
          readPasswordPayload: readPasswordPayloadFromDom,
        });

        bindingsCleanup =
          typeof cleanup === "function"
            ? cleanup
            : () => {};

        return;
      }
    } catch (error) {
      safeWarn("bindCuentaEvents falló. Usando fallback local.", error);
    }

    const cleanups = [
      bindFallbackEvents(container),
      bindExternalEventsFallback(),
    ];

    bindingsCleanup = () => {
      for (const cleanup of cleanups) {
        try {
          cleanup?.();
        } catch {}
      }
    };
  }

  /* =========================================================
     PUBLIC LIFECYCLE
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
        await CuentaApi.loadCuentaMeta?.();
      } catch (error) {
        safeWarn("loadCuentaMeta falló:", error);
      }

      try {
        State.syncViewFormFromItem?.();
      } catch {
        syncFormFromCurrentItem();
      }

      applyCuentaPreferencesSideEffects(getCurrentItem(), {
        silent: true,
        reason: "init-final-sync",
      });

      if (!destroyed) {
        bind();
      }

      safeEmit("cuenta:init:done", {
        source: MODULE,
        view: VIEW_NAME,
        version: VERSION,
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

    setActionFlags({
      savingPreferences: false,
      savingTheme: false,
      savingLanguage: false,
      changingPassword: false,
    });

    callSafe(State.setRefreshing, false);
    callSafe(State.setLoading, false);
    callSafe(State.setSaving, false);
    callSafe(State.setSavingPreferences, false);
    callSafe(State.setSavingTheme, false);
    callSafe(State.setSavingLanguage, false);
    callSafe(State.setChangingPassword, false);

    inflightInit = null;
    inflightReload = null;
    inflightSave = null;
    inflightTheme = null;
    inflightLanguage = null;
    inflightPassword = null;

    safeEmit("cuenta:destroyed", {
      source: MODULE,
      view: VIEW_NAME,
      version: VERSION,
    });

    safeLog("destroy");

    return true;
  }

  function unmount() {
    return destroy();
  }

  function dispose() {
    return destroy();
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
      if (typeof CuentaUtils.buildCuentaSnapshot === "function") {
        return CuentaUtils.buildCuentaSnapshot(item);
      }
    } catch {}

    return {
      item,
      state: {
        ...cuentaState,
        view: {
          ...safeObject(cuentaState.view),
          form: {
            ...safeObject(cuentaState.view?.form),
          },
        },
        action: {
          ...safeObject(cuentaState.action),
        },
      },
      route: getRouteDebug(),
      view: VIEW_NAME,
      version: VERSION,
      source: SOURCE,
    };
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
      loaded: Boolean(cuentaState.loaded),

      error: safeText(cuentaState.error, ""),
      lastSyncAt: first(cuentaState.lastSyncAt, ""),

      hasItem: Boolean(getCurrentItem()),

      hasInflightInit: Boolean(inflightInit),
      hasInflightReload: Boolean(inflightReload),
      hasInflightSave: Boolean(inflightSave),
      hasInflightTheme: Boolean(inflightTheme),
      hasInflightLanguage: Boolean(inflightLanguage),
      hasInflightPassword: Boolean(inflightPassword),

      route: getRouteDebug(),
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

  function changePassword(payload = null) {
    return handlePasswordChange(payload);
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

  function registerPublicBridge() {
    try {
      if (!AppCore.modules || typeof AppCore.modules !== "object") {
        AppCore.modules = {};
      }

      AppCore.modules.CuentaView = api;
      AppCore.modules.Cuenta = api;
      AppCore.modules.OnionCuentaView = api;
    } catch {}

    try {
      const win = getWindow();

      if (win) {
        win.CuentaView = api;
        win.OnionCuentaView = api;

        win.OnionCuenta = {
          ...(win.OnionCuenta && typeof win.OnionCuenta === "object"
            ? win.OnionCuenta
            : {}),
          ...api,
        };
      }
    } catch {}

    return api;
  }

  /* =========================================================
     API
  ========================================================= */

  const api = {
    name: MODULE,
    viewName: VIEW_NAME,
    version: VERSION,
    source: SOURCE,

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
    getPublicStateSnapshot,
    getRouteDebug,

    canRenderCuentaNow,

    isInitialized,
    isDestroyed,
    isMounted,

    readFormPayloadFromDom,
    readPasswordPayloadFromDom,

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

  registerPublicBridge();

  return api;
})();

export default CuentaView;

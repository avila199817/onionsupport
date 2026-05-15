/* =========================================================
   Onion SPA - Toast
   Archivo: src/ui/toast/index.js

   ONION SUPPORT · TOAST ORCHESTRATOR
   UI NOTIFICATIONS · SAFE BRIDGE · EXTREME 10/10

   Responsabilidades:
   - Ensamblar el módulo toast.
   - Exponer API pública única.
   - Inicialización segura e idempotente.
   - Auto-init transparente al primer uso.
   - Bind de eventos globales y DOM sin duplicados.
   - Registro robusto en AppCore / modules / registry.
   - Compatibilidad bridge para Login / Auth Views.
   - Aliases legacy: warn / dismissAll / exists / ready.
   - Bridge opcional window.OnionToast.
   - Snapshot debug sin objetos pesados.
   - Destroy seguro.
   - Cero throws accidentales desde API pública.

   HARDENING:
   - No CSS inline.
   - No estilos inyectados desde este orquestador.
   - Keyframes runtime sólo si dom.js lo soporta y config lo permite.
   - Sin app:module:duplicate storms.
   - Registro silencioso preferente en registry.modules.
   - Event payload sanitizado.
   - API callable-friendly: show("texto"), show({ ... }).
   - Compatible con AppCore congelado/parcial.
   - Tolerante a DOM inexistente.
========================================================= */

import { AppCore } from "../../core/index.js";

import { TOAST_SCOPE } from "./constants.js";

import {
  showToast,
  updateToast,
  dismissToast,
  clearToasts,
  successToast,
  errorToast,
  warningToast,
  infoToast,
  loadingToast,
  refreshAllToastsLanguage,
  resetToastApiState,
} from "./api.js";

import {
  bindToastGlobalEvents,
  bindToastDomEvents,
  unbindToastEvents,
} from "./events.js";

import {
  ensureToastContainer,
  ensureToastKeyframes,
} from "./dom.js";

/* =========================================================
   VERSION
========================================================= */

export const TOAST_MODULE_VERSION =
  "10.0.0-extreme-safe-bridge";

/* =========================================================
   SINGLETON
========================================================= */

const Toast = (() => {
  "use strict";

  /* =======================================================
     RUNTIME STATE
  ======================================================= */

  let initialized = false;
  let initializing = false;
  let eventsBound = false;
  let destroyed = false;

  let initCount = 0;
  let bindCount = 0;
  let destroyCount = 0;
  let showCount = 0;
  let errorCount = 0;

  let lastInitAt = "";
  let lastBindAt = "";
  let lastDestroyAt = "";
  let lastToastAt = "";
  let lastError = null;

  const bridgeWarnings = new Set();

  /* =======================================================
     BASICS
  ======================================================= */

  function isBrowser() {
    return (
      typeof window !== "undefined" &&
      typeof document !== "undefined"
    );
  }

  function isFunction(value) {
    return typeof value === "function";
  }

  function isObject(value) {
    return (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value)
    );
  }

  function isAnyObject(value) {
    return (
      value !== null &&
      typeof value === "object"
    );
  }

  function safeObject(value, fallback = {}) {
    return isObject(value)
      ? value
      : fallback;
  }

  function safeArray(value) {
    return Array.isArray(value)
      ? value
      : [];
  }

  function safeText(value, fallback = "") {
    if (
      value === null ||
      value === undefined
    ) {
      return fallback;
    }

    const text =
      String(value)
        .replace(/[\r\n\t]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    return text || fallback;
  }

  function nowIso() {
    try {
      return new Date().toISOString();
    } catch {
      return "";
    }
  }

  function normalizeOptions(options = {}) {
    return safeObject(options);
  }

  function isErrorLike(value) {
    return (
      value instanceof Error ||
      (
        value &&
        typeof value === "object" &&
        (
          safeText(value.name, "") ||
          safeText(value.message, "")
        )
      )
    );
  }

  function normalizeShowInput(input = {}, options = {}) {
    const opts =
      normalizeOptions(options);

    if (typeof input === "string") {
      return {
        ...opts,
        message:
          input,
      };
    }

    if (isErrorLike(input)) {
      return {
        ...opts,

        message:
          safeText(
            input.message,
            "Error inesperado"
          ),

        error:
          input,

        type:
          "error",
      };
    }

    return {
      ...opts,
      ...normalizeOptions(input),
    };
  }

  function normalizeMessageAndOptions(message = "", options = {}) {
    if (isErrorLike(message)) {
      return {
        message:
          safeText(
            message.message,
            "Error inesperado"
          ),

        options: {
          error:
            message,

          ...normalizeOptions(options),
        },
      };
    }

    if (
      isObject(message) &&
      !safeText(message.message, "")
    ) {
      return {
        message:
          "",

        options: {
          ...message,
          ...normalizeOptions(options),
        },
      };
    }

    return {
      message:
        safeText(message, ""),

      options:
        normalizeOptions(options),
    };
  }

  /* =======================================================
     SANITIZE / LOG
  ======================================================= */

  function sanitizePayload(value, depth = 0, seen = null) {
    if (!seen) {
      try {
        seen = new WeakSet();
      } catch {
        seen = null;
      }
    }

    if (depth > 5) {
      return "[MaxDepth]";
    }

    if (typeof value === "string") {
      return value
        .replace(
          /(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi,
          "$1***"
        )
        .replace(
          /([?&#](?:token|access_token|refresh_token|id_token|code|otp|t)=)([^&#\s]+)/gi,
          "$1***"
        );
    }

    if (
      value === null ||
      value === undefined ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      return value;
    }

    if (typeof value === "function") {
      return "[Function]";
    }

    if (typeof value === "bigint") {
      return String(value);
    }

    if (value instanceof Error) {
      return {
        name:
          safeText(value.name, "Error"),

        message:
          safeText(value.message, "Error"),

        code:
          value.code || null,

        status:
          value.status ||
          value.statusCode ||
          null,

        stack:
          value.stack ? "[stack]" : null,
      };
    }

    if (isAnyObject(value)) {
      try {
        if (
          seen &&
          seen.has(value)
        ) {
          return "[Circular]";
        }

        seen?.add?.(value);
      } catch {}
    }

    if (Array.isArray(value)) {
      return value
        .slice(0, 50)
        .map((item) =>
          sanitizePayload(
            item,
            depth + 1,
            seen
          )
        );
    }

    if (isObject(value)) {
      const output = {};

      for (const [key, item] of Object.entries(value).slice(0, 80)) {
        if (
          /token|password|secret|authorization|cookie|credential|otp|mfa|2fa/i.test(key)
        ) {
          output[key] =
            item ? "***" : item;
          continue;
        }

        if (
          /^(event|target|currentTarget|nativeEvent|source|raw|response|request|promise)$/i.test(key)
        ) {
          output[key] =
            item ? `[${key}]` : item;
          continue;
        }

        output[key] =
          sanitizePayload(
            item,
            depth + 1,
            seen
          );
      }

      return output;
    }

    return String(value);
  }

  function rememberError(error, context = "") {
    errorCount += 1;

    lastError =
      sanitizePayload({
        context:
          safeText(context, "toast"),

        error,
        at:
          nowIso(),
      });

    return lastError;
  }

  function safeLog(...args) {
    const clean =
      args.map((item) =>
        sanitizePayload(item)
      );

    try {
      AppCore?.utils?.log?.(
        "[Toast]",
        ...clean
      );

      return;
    } catch {}

    try {
      if (
        AppCore?.config?.debug === true ||
        AppCore?.config?.debugToast === true
      ) {
        console.log(
          "[Toast]",
          ...clean
        );
      }
    } catch {}
  }

  function safeWarn(...args) {
    const clean =
      args.map((item) =>
        sanitizePayload(item)
      );

    try {
      AppCore?.utils?.warn?.(
        "[Toast]",
        ...clean
      );

      return;
    } catch {}

    try {
      if (
        AppCore?.config?.debug === true ||
        AppCore?.config?.debugToast === true
      ) {
        console.warn(
          "[Toast]",
          ...clean
        );
      }
    } catch {}
  }

  function safeError(...args) {
    const clean =
      args.map((item) =>
        sanitizePayload(item)
      );

    try {
      AppCore?.utils?.error?.(
        "[Toast]",
        ...clean
      );

      return;
    } catch {}

    try {
      if (
        AppCore?.config?.debug === true ||
        AppCore?.config?.debugToast === true
      ) {
        console.error(
          "[Toast]",
          ...clean
        );
      }
    } catch {}
  }

  function shouldEmitLifecycleEvents() {
    try {
      return Boolean(
        AppCore?.config?.diagnostics?.toastEvents === true ||
          AppCore?.config?.diagnostics?.uiEvents === true ||
          AppCore?.config?.debugToast === true
      );
    } catch {
      return false;
    }
  }

  function safeEmit(eventName, payload = {}, options = {}) {
    const name =
      safeText(eventName, "");

    if (!name) {
      return false;
    }

    const opts =
      safeObject(options);

    if (
      opts.lifecycle === true &&
      !shouldEmitLifecycleEvents()
    ) {
      return false;
    }

    const cleanPayload =
      sanitizePayload({
        source:
          "Toast",

        version:
          TOAST_MODULE_VERSION,

        scope:
          TOAST_SCOPE,

        at:
          nowIso(),

        ...safeObject(payload),
      });

    let emitted =
      false;

    try {
      if (isFunction(AppCore?.events?.emit)) {
        AppCore.events.emit(
          name,
          cleanPayload
        );

        emitted =
          true;
      }
    } catch {}

    try {
      if (
        isBrowser() &&
        (opts.window === true || !emitted)
      ) {
        window.dispatchEvent(
          new CustomEvent(name, {
            detail:
              cleanPayload,
          })
        );

        emitted =
          true;
      }
    } catch {}

    return emitted;
  }

  /* =======================================================
     DOM
  ======================================================= */

  function allowRuntimeKeyframes() {
    try {
      return Boolean(
        AppCore?.config?.toast?.runtimeKeyframes === true ||
          AppCore?.config?.allowToastRuntimeKeyframes === true
      );
    } catch {
      return false;
    }
  }

  function ensureDom() {
    if (!isBrowser()) {
      return false;
    }

    /*
      Por arquitectura, los estilos deben vivir en CSS.
      Sólo permitimos ensureToastKeyframes() si la config lo activa.
    */
    if (allowRuntimeKeyframes()) {
      try {
        ensureToastKeyframes?.();
      } catch (error) {
        rememberError(
          error,
          "ensureToastKeyframes"
        );

        safeWarn(
          "No se pudieron asegurar keyframes toast.",
          error
        );
      }
    }

    try {
      ensureToastContainer?.();
      return true;
    } catch (error) {
      rememberError(
        error,
        "ensureToastContainer"
      );

      safeWarn(
        "No se pudo asegurar contenedor toast.",
        error
      );

      return false;
    }
  }

  /* =======================================================
     MODULE REGISTRATION
  ======================================================= */

  function getRegisteredModule(name = "") {
    const clean =
      safeText(name, "");

    if (!clean) {
      return null;
    }

    try {
      if (isFunction(AppCore?.modules?.get)) {
        return AppCore.modules.get(clean) || null;
      }
    } catch {}

    try {
      if (AppCore?.registry?.modules?.get) {
        return AppCore.registry.modules.get(clean) || null;
      }
    } catch {}

    try {
      if (
        AppCore?.modules &&
        typeof AppCore.modules === "object" &&
        AppCore.modules[clean]
      ) {
        return AppCore.modules[clean];
      }
    } catch {}

    return null;
  }

  function warnBridgeConflictOnce(name = "") {
    const clean =
      safeText(name, "");

    if (!clean || bridgeWarnings.has(clean)) {
      return;
    }

    bridgeWarnings.add(clean);

    safeWarn(
      "Bridge toast existente con otra instancia. No se fuerza reemplazo para evitar duplicados.",
      {
        name:
          clean,
      }
    );
  }

  function registerOneModuleName(name = "") {
    const clean =
      safeText(name, "");

    if (!clean) {
      return false;
    }

    const existing =
      getRegisteredModule(clean);

    if (existing === api) {
      return true;
    }

    if (
      existing &&
      existing !== api
    ) {
      warnBridgeConflictOnce(clean);
      return false;
    }

    try {
      if (AppCore?.registry?.modules?.set) {
        AppCore.registry.modules.set(
          clean,
          api
        );

        return true;
      }
    } catch {}

    try {
      if (isFunction(AppCore?.modules?.register)) {
        const result =
          AppCore.modules.register(
            clean,
            api,
            {
              aliases:
                clean === "Toast"
                  ? ["toast"]
                  : [],

              overwrite:
                false,

              replace:
                false,

              idempotent:
                true,

              emit:
                false,

              source:
                "ui.toast",
            }
          );

        return result !== false;
      }
    } catch {}

    try {
      if (isFunction(AppCore?.modules?.set)) {
        AppCore.modules.set(
          clean,
          api,
          {
            source:
              "ui.toast",
            emit:
              false,
          }
        );

        return true;
      }
    } catch {}

    try {
      if (
        AppCore?.modules &&
        typeof AppCore.modules === "object" &&
        Object.isExtensible(AppCore.modules) &&
        !AppCore.modules[clean]
      ) {
        AppCore.modules[clean] =
          api;

        return true;
      }
    } catch {}

    return false;
  }

  function registerAppCoreBridge() {
    let ok =
      false;

    try {
      if (AppCore) {
        AppCore.Toast =
          api;

        ok =
          true;
      }
    } catch {}

    try {
      if (AppCore) {
        AppCore.toast =
          api;

        ok =
          true;
      }
    } catch {}

    try {
      if (
        AppCore &&
        typeof AppCore === "object" &&
        Object.isExtensible(AppCore)
      ) {
        AppCore.ui =
          isObject(AppCore.ui)
            ? AppCore.ui
            : {};

        AppCore.ui.Toast =
          api;

        AppCore.ui.toast =
          api;

        ok =
          true;
      }
    } catch {}

    return ok;
  }

  function registerWindowBridge() {
    if (!isBrowser()) {
      return false;
    }

    let ok =
      false;

    try {
      window.OnionToast =
        api;

      ok =
        true;
    } catch {}

    try {
      if (!window.Toast) {
        window.Toast =
          api;
      }

      ok =
        true;
    } catch {}

    try {
      window.OnionApp =
        window.OnionApp || {};

      window.OnionApp.Toast =
        api;

      window.OnionApp.toast =
        api;

      ok =
        true;
    } catch {}

    return ok;
  }

  function registerModule(options = {}) {
    const opts =
      safeObject(options);

    const registryResults = {
      Toast:
        false,

      toast:
        false,

      toastModule:
        false,
    };

    try {
      registryResults.Toast =
        registerOneModuleName("Toast");

      registryResults.toast =
        registerOneModuleName("toast");

      registryResults.toastModule =
        registerOneModuleName("toastModule");
    } catch (error) {
      rememberError(
        error,
        "registerModule"
      );
    }

    const coreOk =
      registerAppCoreBridge();

    const windowOk =
      opts.windowBridge === false
        ? false
        : registerWindowBridge();

    safeEmit(
      "toast:module:registered",
      {
        registry:
          registryResults,

        coreOk,
        windowOk,
      },
      {
        lifecycle:
          true,
      }
    );

    return Boolean(
      registryResults.Toast ||
        registryResults.toast ||
        registryResults.toastModule ||
        coreOk ||
        windowOk
    );
  }

  /* =======================================================
     EVENTS
  ======================================================= */

  function buildEventHandlers() {
    return {
      show,
      update,
      dismiss,
      clear,

      success,
      error,
      warning,
      warn,
      info,
      loading,

      dismissAll,

      refreshAllToastsLanguage:
        refreshLanguage,

      refreshLanguage,
    };
  }

  function bindEvents() {
    if (eventsBound) {
      return true;
    }

    try {
      bindToastGlobalEvents(
        buildEventHandlers()
      );
    } catch (error) {
      rememberError(
        error,
        "bindToastGlobalEvents"
      );

      safeWarn(
        "bindToastGlobalEvents falló.",
        error
      );
    }

    try {
      bindToastDomEvents({
        dismiss,
        dismissToast:
          dismiss,
        clear,
      });
    } catch (error) {
      rememberError(
        error,
        "bindToastDomEvents"
      );

      safeWarn(
        "bindToastDomEvents falló.",
        error
      );
    }

    eventsBound =
      true;

    bindCount += 1;
    lastBindAt =
      nowIso();

    safeEmit(
      "toast:events:bound",
      {
        bindCount,
      },
      {
        lifecycle:
          true,
      }
    );

    return true;
  }

  function unbindEvents() {
    if (!eventsBound) {
      return true;
    }

    try {
      unbindToastEvents?.();
    } catch (error) {
      rememberError(
        error,
        "unbindToastEvents"
      );

      safeWarn(
        "unbindToastEvents falló.",
        error
      );
    }

    eventsBound =
      false;

    safeEmit(
      "toast:events:unbound",
      {},
      {
        lifecycle:
          true,
      }
    );

    return true;
  }

  /* =======================================================
     LIFECYCLE
  ======================================================= */

  function init(options = {}) {
    const opts =
      safeObject(options);

    if (initialized) {
      ensureDom();
      registerModule(opts);

      return api;
    }

    if (initializing) {
      return api;
    }

    initializing =
      true;

    destroyed =
      false;

    try {
      ensureDom();
      bindEvents();
      registerModule(opts);

      initialized =
        true;

      initCount += 1;
      lastInitAt =
        nowIso();

      safeEmit(
        "toast:init",
        {
          initialized:
            true,
          initCount,
        },
        {
          lifecycle:
            true,
        }
      );

      safeLog(
        "Toast UI inicializado correctamente.",
        {
          version:
            TOAST_MODULE_VERSION,
          scope:
            TOAST_SCOPE,
        }
      );

      return api;
    } catch (error) {
      initialized =
        false;

      rememberError(
        error,
        "init"
      );

      safeError(
        "No se pudo inicializar Toast.",
        error
      );

      safeEmit(
        "toast:init:error",
        {
          error:
            lastError,
          message:
            safeText(
              error?.message,
              "Toast init error"
            ),
        },
        {
          lifecycle:
            true,
          window:
            true,
        }
      );

      return api;
    } finally {
      initializing =
        false;
    }
  }

  function ensureReady() {
    if (
      destroyed &&
      !initializing
    ) {
      destroyed =
        false;
    }

    if (!initialized) {
      init();
    } else {
      ensureDom();
    }

    return true;
  }

  function destroy(options = {}) {
    const opts =
      safeObject(options);

    try {
      unbindEvents();
    } catch {}

    if (opts.clear !== false) {
      try {
        clearToasts();
      } catch (error) {
        rememberError(
          error,
          "destroy:clearToasts"
        );
      }
    }

    if (opts.resetRuntime !== false) {
      try {
        resetToastApiState?.();
      } catch (error) {
        rememberError(
          error,
          "destroy:resetToastApiState"
        );
      }
    }

    initialized =
      false;

    initializing =
      false;

    destroyed =
      true;

    destroyCount += 1;
    lastDestroyAt =
      nowIso();

    safeEmit(
      "toast:destroy",
      {
        destroyed:
          true,
        destroyCount,
      },
      {
        lifecycle:
          true,
      }
    );

    return true;
  }

  /* =======================================================
     SAFE CALLS
  ======================================================= */

  function callToastFunction(fn, args = [], context = "") {
    ensureReady();

    try {
      const result =
        fn(...args);

      showCount +=
        context.startsWith("show") ||
        context.startsWith("success") ||
        context.startsWith("error") ||
        context.startsWith("warning") ||
        context.startsWith("info") ||
        context.startsWith("loading")
          ? 1
          : 0;

      lastToastAt =
        nowIso();

      return result;
    } catch (error) {
      rememberError(
        error,
        context
      );

      safeWarn(
        "Toast API falló.",
        {
          context,
          error,
        }
      );

      return null;
    }
  }

  /* =======================================================
     PUBLIC API · CORE
  ======================================================= */

  function show(input = {}, options = {}) {
    return callToastFunction(
      showToast,
      [
        normalizeShowInput(
          input,
          options
        ),
      ],
      "show"
    );
  }

  function update(id, patch = {}) {
    const toastId =
      safeText(id, "");

    if (!toastId) {
      return null;
    }

    return callToastFunction(
      updateToast,
      [
        toastId,
        normalizeOptions(patch),
      ],
      "update"
    );
  }

  function dismiss(id = null) {
    ensureReady();

    if (
      id === null ||
      id === undefined ||
      id === ""
    ) {
      return clear();
    }

    return callToastFunction(
      dismissToast,
      [
        id,
      ],
      "dismiss"
    );
  }

  function dismissAll() {
    return clear();
  }

  function clear() {
    return callToastFunction(
      clearToasts,
      [],
      "clear"
    );
  }

  /* =======================================================
     PUBLIC API · VARIANTS
  ======================================================= */

  function success(message = "", options = {}) {
    const normalized =
      normalizeMessageAndOptions(
        message,
        options
      );

    return callToastFunction(
      successToast,
      [
        normalized.message,
        normalized.options,
      ],
      "success"
    );
  }

  function error(message = "", options = {}) {
    const normalized =
      normalizeMessageAndOptions(
        message,
        options
      );

    return callToastFunction(
      errorToast,
      [
        normalized.message ||
          "Error inesperado",
        normalized.options,
      ],
      "error"
    );
  }

  function warning(message = "", options = {}) {
    const normalized =
      normalizeMessageAndOptions(
        message,
        options
      );

    return callToastFunction(
      warningToast,
      [
        normalized.message,
        normalized.options,
      ],
      "warning"
    );
  }

  function warn(message = "", options = {}) {
    return warning(
      message,
      options
    );
  }

  function info(message = "", options = {}) {
    const normalized =
      normalizeMessageAndOptions(
        message,
        options
      );

    return callToastFunction(
      infoToast,
      [
        normalized.message,
        normalized.options,
      ],
      "info"
    );
  }

  function loading(message = "", options = {}) {
    const normalized =
      normalizeMessageAndOptions(
        message,
        options
      );

    return callToastFunction(
      loadingToast,
      [
        normalized.message,
        {
          persist:
            true,
          ...normalized.options,
        },
      ],
      "loading"
    );
  }

  /* =======================================================
     PUBLIC API · LANGUAGE / LEGACY
  ======================================================= */

  function refreshLanguage() {
    return callToastFunction(
      refreshAllToastsLanguage,
      [],
      "refreshLanguage"
    );
  }

  function exists(id = null) {
    /*
      Alias legacy:
      - Sin id: confirma que el módulo existe.
      - Con id: si api.js no expone estado interno, devolvemos true sólo si
        hay un id textual. Evita romper vistas legacy que esperan boolean.
    */
    if (
      id === null ||
      id === undefined ||
      id === ""
    ) {
      return true;
    }

    return Boolean(
      safeText(id, "")
    );
  }

  function ready() {
    return Boolean(
      initialized &&
        !destroyed
    );
  }

  function resolve() {
    ensureReady();

    return api;
  }

  /* =======================================================
     DEBUG
  ======================================================= */

  function getSnapshot() {
    return sanitizePayload({
      version:
        TOAST_MODULE_VERSION,

      initialized:
        Boolean(initialized),

      initializing:
        Boolean(initializing),

      eventsBound:
        Boolean(eventsBound),

      destroyed:
        Boolean(destroyed),

      scope:
        TOAST_SCOPE,

      counters: {
        initCount,
        bindCount,
        destroyCount,
        showCount,
        errorCount,
      },

      timestamps: {
        lastInitAt,
        lastBindAt,
        lastDestroyAt,
        lastToastAt,
      },

      bridges: {
        hasAppCore:
          Boolean(AppCore),

        hasEventBus:
          Boolean(AppCore?.events),

        hasModules:
          Boolean(AppCore?.modules),

        hasRegistryModules:
          Boolean(AppCore?.registry?.modules),

        appCoreToast:
          Boolean(AppCore?.Toast === api),

        appCoreToastLower:
          Boolean(AppCore?.toast === api),

        hasWindowBridge:
          isBrowser()
            ? Boolean(window.OnionToast === api)
            : false,

        hasWindowToast:
          isBrowser()
            ? Boolean(window.Toast === api)
            : false,
      },

      config: {
        runtimeKeyframes:
          allowRuntimeKeyframes(),
      },

      lastError,
    });
  }

  function getState() {
    return getSnapshot();
  }

  /* =======================================================
     API
  ======================================================= */

  const api = {
    TOAST_MODULE_VERSION,
    version:
      TOAST_MODULE_VERSION,

    scope:
      TOAST_SCOPE,

    init,
    destroy,

    ensureReady,
    resolve,

    show,
    update,

    dismiss,
    dismissAll,
    clear,

    success,
    error,
    warning,
    warn,
    info,
    loading,

    refreshAllToastsLanguage:
      refreshLanguage,

    refreshLanguage,

    exists,
    ready,

    getSnapshot,
    getState,
    getDebugSnapshot:
      getSnapshot,

    registerModule,
    bindEvents,
    unbindEvents,

    get initialized() {
      return Boolean(initialized);
    },

    get initializing() {
      return Boolean(initializing);
    },

    get eventsBound() {
      return Boolean(eventsBound);
    },

    get destroyed() {
      return Boolean(destroyed);
    },
  };

  return api;
})();

export { Toast };
export default Toast;

/* =========================================================
   Onion SPA - Cuenta View
   Archivo: src/views/cuenta/cuentaView.js

   FINAL PRO SYSTEM · VIEW REAL · 10/10

   RESPONSABILIDADES:
   - punto de entrada real de la vista cuenta
   - render principal de header + panel de preferencias
   - carga inicial robusta
   - refresh con loader SOLO en panel principal
   - guardado con estado visual de saving
   - bind de eventos de la pantalla
   - evitar doble bind de listeners
   - soportar destroy limpio del router
   - permitir reload con rerender seguro
   - coordinar modal / actions / api sin mezclar responsabilidades

   HARDENING PRO:
   - render inicial inmediato
   - carga posterior segura
   - anti-race token
   - cleanup total
   - click delegation sólida
   - fallback elegante si el modal aún no existe
   - single resource mode real para /api/user/preferences
   - aplica el theme real al DOM / AppCore / storage
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
  bindCuentaEvents,
} from "./cuenta.bindings.js";

import {
  buildCuentaSnapshot,
  showToast,
} from "./cuenta.utils.js";

export const CuentaView = (() => {
  "use strict";

  const SCOPE = "view:cuenta";

  let initialized = false;
  let destroyed = false;
  let inflightInit = null;
  let bindingsCleanup = null;
  let renderToken = 0;

  /* =====================================================
     HELPERS CORE
  ===================================================== */

  function safeLog(...args) {
    try {
      AppCore?.utils?.log?.("[CuentaView]", ...args);
    } catch {}
  }

  function safeWarn(...args) {
    try {
      AppCore?.utils?.warn?.("[CuentaView]", ...args);
    } catch {}
  }

  function safeEmit(event = "", payload = {}) {
    try {
      AppCore?.events?.emit?.(event, payload);
    } catch {}
  }

  function getContainer() {
    return (
      AppCore?.dom?.viewContainer ||
      document.getElementById("view-container") ||
      null
    );
  }

  function nextRenderToken() {
    renderToken += 1;
    return renderToken;
  }

  function isActiveToken(token) {
    return !destroyed && token === renderToken;
  }

  function cleanupBindings() {
    try {
      bindingsCleanup?.();
    } catch {}

    bindingsCleanup = null;

    try {
      AppCore?.cleanup?.run?.(SCOPE);
    } catch {}
  }

  function setState(patch = {}) {
    if (!patch || typeof patch !== "object") {
      return cuentaState;
    }

    Object.assign(cuentaState, patch);

    return cuentaState;
  }

  function ensureBaseState() {
    if (typeof cuentaState.loading !== "boolean") {
      cuentaState.loading = false;
    }

    if (typeof cuentaState.refreshing !== "boolean") {
      cuentaState.refreshing = false;
    }

    if (typeof cuentaState.saving !== "boolean") {
      cuentaState.saving = false;
    }

    cuentaState.error =
      typeof cuentaState.error === "string"
        ? cuentaState.error
        : "";
  }

  function getCurrentItem() {
    try {
      const raw = getCuentaStore();

      if (!raw) {
        return null;
      }

      return normalizeCuentaModel(raw);
    } catch (error) {
      safeWarn("getCurrentItem falló:", error);
      return null;
    }
  }

  function safeErrorMessage(error = null) {
    if (!error) {
      return "No se pudo cargar la cuenta.";
    }

    const message =
      error?.message ||
      error?.response?.message ||
      error?.response?.data?.message ||
      error?.data?.message ||
      "No se pudo cargar la cuenta.";

    return String(message).trim() || "No se pudo cargar la cuenta.";
  }

  /* =====================================================
     THEME APPLY
  ===================================================== */

  function resolveThemeMode(value = true) {
    return Boolean(value) ? "dark" : "light";
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
    } catch {}

    try {
      document.body?.classList?.toggle?.("theme-dark", isDark);
      document.body?.classList?.toggle?.("theme-light", !isDark);
    } catch {}

    try {
      AppCore.state = AppCore.state || {};
      AppCore.state.theme = theme;
      AppCore.state.darkMode = isDark;
    } catch {}

    try {
      AppCore?.setTheme?.(theme);
    } catch {}

    try {
      AppCore?.events?.emit?.("app:theme:change", {
        theme,
        darkMode: isDark,
        source: "cuenta",
      });
    } catch {}

    try {
      localStorage.setItem("theme", theme);
      localStorage.setItem("darkMode", String(isDark));
    } catch {}

    return theme;
  }

  function applyCuentaPreferencesSideEffects(detail = null) {
    const item = detail || getCurrentItem();

    if (!item) {
      return null;
    }

    applyCuentaThemeToDom(Boolean(item.darkMode));

    return item;
  }

  /* =====================================================
     MODAL BRIDGE
  ===================================================== */

  function openCuentaModalBridge(detail = null) {
    if (!detail) {
      return false;
    }

    let handled = false;

    try {
      safeEmit("cuenta:modal:open", { detail });
      handled = true;
    } catch {}

    try {
      const globalHook =
        window?.OnionCuentaModal?.open ||
        window?.renderCuentaModal;

      if (typeof globalHook === "function") {
        globalHook(detail);
        handled = true;
      }
    } catch (error) {
      safeWarn("modal bridge hook falló:", error);
    }

    if (!handled) {
      showToast(
        "Detalle cargado. Falta conectar cuenta.modal.js para abrir el popup.",
        "info"
      );
    }

    return handled;
  }

  /* =====================================================
     RENDER
  ===================================================== */

  function buildHtml() {
    const item = getCurrentItem();

    return renderCuentaTemplate({
      item,
      state: cuentaState,
    });
  }

  function render() {
    const container = getContainer();

    if (!container) {
      safeWarn("No se encontró #view-container.");
      return null;
    }

    ensureBaseState();

    try {
      AppCore?.setDocumentTitle?.("Cuenta");
    } catch {}

    try {
      AppCore?.clearDynamicContainers?.();
    } catch {}

    container.innerHTML = buildHtml();

    setHydrated?.(true);

    return container;
  }

  function rerender() {
    if (destroyed) {
      return null;
    }

    const container = render();

    if (!destroyed) {
      bind();
    }

    return container;
  }

  /* =====================================================
     DATA LOAD
  ===================================================== */

  async function loadData({
    force = false,
    silent = false,
    asRefresh = false,
  } = {}) {
    const itemBefore = getCurrentItem();
    const hasVisibleData = Boolean(itemBefore);

    setState({
      error: "",
      loading: !hasVisibleData && !silent,
      refreshing: hasVisibleData && asRefresh,
    });

    render();

    try {
      const detail = await loadCuenta({ force });

      applyCuentaPreferencesSideEffects(detail);

      setState({
        loading: false,
        refreshing: false,
        error: "",
        lastSyncAt: new Date().toISOString(),
      });

      syncViewFormFromItem?.();

      safeEmit("cuenta:loaded", {
        detail,
      });

      return detail;
    } catch (error) {
      const message = safeErrorMessage(error);

      safeWarn("loadCuenta falló:", error);

      setState({
        loading: false,
        refreshing: false,
        error: message,
      });

      if (!silent) {
        showToast(message, "error");
      }

      return getCurrentItem();
    }
  }

  async function renderAndLoad({
    force = false,
    asRefresh = false,
  } = {}) {
    const token = nextRenderToken();

    try {
      hydrateCuentaFromCache?.();
    } catch (error) {
      safeWarn("hydrateCuentaFromCache falló:", error);
    }

    ensureBaseState();
    render();

    await loadData({
      force,
      silent: false,
      asRefresh,
    });

    if (!isActiveToken(token)) {
      return api;
    }

    render();

    return api;
  }

  /* =====================================================
     FORM / SAVE FLOWS
  ===================================================== */

  function getCurrentFormPayload() {
    const form = cuentaState?.view?.form || {};

    return {
      darkMode: Boolean(form.darkMode),
      privacyMode: Boolean(form.privacyMode),
    };
  }

  function syncFormFromCurrentItem() {
    const item = getCurrentItem();

    if (!item) {
      setViewForm?.({
        darkMode: true,
        privacyMode: false,
      });

      return {
        darkMode: true,
        privacyMode: false,
      };
    }

    setViewForm?.({
      darkMode: Boolean(item.darkMode),
      privacyMode: Boolean(item.privacyMode),
    });

    return {
      darkMode: Boolean(item.darkMode),
      privacyMode: Boolean(item.privacyMode),
    };
  }

  async function handleSaveCuenta(payload = null) {
    const nextPayload = payload || getCurrentFormPayload();

    clearViewErrors?.();
    clearViewSuccess?.();
    setViewServerError?.("");

    setState({
      saving: true,
      error: "",
    });

    rerender();

    try {
      const detail = await updateCuenta({
        darkMode: Boolean(nextPayload.darkMode),
        privacyMode: Boolean(nextPayload.privacyMode),
      });

      applyCuentaPreferencesSideEffects(detail);

      syncViewFormFromItem?.();

      setViewSuccess?.({
        successMessage: "Preferencias guardadas correctamente.",
        updatedAt: detail?.updatedAt || "",
      });

      safeEmit("cuenta:update:success", {
        detail,
      });

      showToast("Preferencias guardadas", "success");

      return detail;
    } catch (error) {
      const message = safeErrorMessage(error);

      safeWarn("handleSaveCuenta falló:", error);

      setViewServerError?.(message);

      safeEmit("cuenta:update:error", {
        error,
      });

      showToast(message, "error");

      return null;
    } finally {
      setState({
        saving: false,
      });

      if (!destroyed) {
        rerender();
      }
    }
  }

  async function handleUpdateTheme(darkMode = true) {
    clearViewErrors?.();
    clearViewSuccess?.();
    setViewServerError?.("");

    setState({
      saving: true,
      error: "",
    });

    patchViewForm?.({
      darkMode: Boolean(darkMode),
    });

    rerender();

    try {
      const detail = await updateCuentaTheme(Boolean(darkMode));

      applyCuentaPreferencesSideEffects(detail);

      patchViewForm?.({
        darkMode: Boolean(detail?.darkMode),
        privacyMode: Boolean(detail?.privacyMode),
      });

      setViewSuccess?.({
        successMessage: "Tema actualizado correctamente.",
        updatedAt: detail?.updatedAt || "",
      });

      safeEmit("cuenta:theme:update:success", {
        detail,
      });

      showToast("Tema actualizado", "success");

      return detail;
    } catch (error) {
      const message = safeErrorMessage(error);

      safeWarn("handleUpdateTheme falló:", error);

      syncFormFromCurrentItem();
      setViewServerError?.(message);

      safeEmit("cuenta:theme:update:error", {
        error,
      });

      showToast(message, "error");

      return null;
    } finally {
      setState({
        saving: false,
      });

      if (!destroyed) {
        rerender();
      }
    }
  }

  async function handleRefreshCuenta() {
    try {
      const detail = await reload({
        force: true,
        asRefresh: true,
      });

      const item = getCurrentItem();

      safeEmit("cuenta:refresh:success", {
        detail: item,
      });

      return item;
    } catch (error) {
      safeWarn("handleRefreshCuenta falló:", error);

      safeEmit("cuenta:refresh:error", {
        error,
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

    return openCuentaModalBridge(item);
  }

  /* =====================================================
     CLICK DELEGATION EXTRA
  ===================================================== */

  function bindNativeActions(container) {
    if (!container) {
      return () => {};
    }

    const onClick = async (event) => {
      const openModalBtn = event.target.closest(
        '[data-action="open-cuenta-modal"], #cuenta-open-modal-btn'
      );

      if (openModalBtn) {
        event.preventDefault();
        handleOpenModal();
        return;
      }
    };

    container.addEventListener("click", onClick);

    return () => {
      container.removeEventListener("click", onClick);
    };
  }

  function bindModalBridgeEvents() {
    const eventBus = AppCore?.events;

    if (!eventBus?.on) {
      return () => {};
    }

    const onRefresh = async () => {
      await handleRefreshCuenta();
    };

    const onUpdateTheme = async (event) => {
      const darkMode =
        event?.detail?.darkMode ??
        event?.darkMode ??
        true;

      await handleUpdateTheme(Boolean(darkMode));
    };

    const onUpdatePreferences = async (event) => {
      const payload = {
        darkMode:
          event?.detail?.darkMode ??
          event?.darkMode ??
          getCurrentFormPayload().darkMode,

        privacyMode:
          event?.detail?.privacyMode ??
          event?.privacyMode ??
          getCurrentFormPayload().privacyMode,
      };

      await handleSaveCuenta(payload);
    };

    try {
      eventBus.on("cuenta:modal:refresh", onRefresh);
      eventBus.on("cuenta:modal:update-theme", onUpdateTheme);
      eventBus.on("cuenta:modal:update-preferences", onUpdatePreferences);
    } catch (error) {
      safeWarn("bind modal bridge error:", error);
    }

    return () => {
      try {
        eventBus?.off?.("cuenta:modal:refresh", onRefresh);
      } catch {}

      try {
        eventBus?.off?.("cuenta:modal:update-theme", onUpdateTheme);
      } catch {}

      try {
        eventBus?.off?.("cuenta:modal:update-preferences", onUpdatePreferences);
      } catch {}
    };
  }

  function bind() {
    cleanupBindings();

    const container = getContainer();
    const cleanups = [];

    cleanups.push(
      bindCuentaEvents({
        loadCuenta: async ({ force = true } = {}) => {
          await reload({
            force,
            asRefresh: true,
          });

          return getCurrentItem();
        },

        updateCuenta: async (payload = {}) => {
          return handleSaveCuenta(payload);
        },

        updateCuentaTheme: async (darkMode = true) => {
          return handleUpdateTheme(Boolean(darkMode));
        },

        saveCuenta: async (payload = {}) => {
          return handleSaveCuenta(payload);
        },

        reload: async () => {
          await reload({
            force: true,
            asRefresh: true,
          });

          return getCurrentItem();
        },

        scope: SCOPE,
      })
    );

    cleanups.push(bindNativeActions(container));
    cleanups.push(bindModalBridgeEvents());

    bindingsCleanup = () => {
      for (const cleanup of cleanups) {
        try {
          cleanup?.();
        } catch {}
      }
    };
  }

  /* =====================================================
     PUBLIC FLOWS
  ===================================================== */

  async function reload(options = {}) {
    if (destroyed) {
      return api;
    }

    const {
      force = true,
      asRefresh = true,
    } = options || {};

    try {
      await renderAndLoad({
        force,
        asRefresh,
      });
    } catch (error) {
      safeWarn("reload falló:", error);
    }

    if (!destroyed) {
      bind();
    }

    return api;
  }

  async function init() {
    if (initialized && inflightInit) {
      return inflightInit;
    }

    destroyed = false;
    initialized = true;

    ensureBaseState();
    syncFormFromCurrentItem();

    inflightInit = (async () => {
      safeLog("init");

      await renderAndLoad({
        force: false,
        asRefresh: false,
      });

      try {
        await loadCuentaMeta?.();
      } catch (error) {
        safeWarn("loadCuentaMeta falló:", error);
      }

      syncViewFormFromItem?.();
      applyCuentaPreferencesSideEffects(getCurrentItem());

      if (!destroyed) {
        bind();
      }

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

    nextRenderToken();

    cleanupBindings();

    setState({
      refreshing: false,
      loading: false,
      saving: false,
    });

    safeLog("destroy");
  }

  /* =====================================================
     EXTRAS ÚTILES
  ===================================================== */

  function getItem() {
    return getCurrentItem();
  }

  function getSnapshot() {
    const item = getCurrentItem();

    if (!item) {
      return null;
    }

    return buildCuentaSnapshot(item);
  }

  function openModal() {
    return handleOpenModal();
  }

  /* =====================================================
     API
  ===================================================== */

  const api = {
    init,
    render: rerender,
    reload,
    destroy,

    saveCuenta: handleSaveCuenta,
    updateTheme: handleUpdateTheme,
    refreshCuenta: handleRefreshCuenta,
    openModal,

    getItem,
    getSnapshot,

    get initialized() {
      return initialized;
    },

    get destroyed() {
      return destroyed;
    },
  };

  return api;
})();

export default CuentaView;

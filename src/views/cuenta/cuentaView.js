/* =========================================================
   Onion SPA - Cuenta View
   Archivo: src/views/cuenta/cuentaView.js

   CLIENT EXPERIENCE MODE · VIEW REAL · HARDENED · FINAL 10/10

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
   - single resource mode real para /api/user/preferences

   HARDENING PRO:
   - render inicial inmediato
   - bind inmediato tras primer render para evitar pérdida de clicks
   - carga posterior segura
   - anti-race token
   - inflightReload anti spam
   - cleanup total
   - click delegation sólida
   - change delegation sólida
   - fallback elegante si el modal aún no existe
   - template controlado por state real
   - aplica theme real al DOM / AppCore / storage
   - aplica lang real al DOM / AppCore / storage
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
  const PASSWORD_MIN_LENGTH = 8;

  /* =========================================================
     LOCAL RUNTIME
  ========================================================= */

  let initialized = false;
  let destroyed = false;
  let inflightInit = null;
  let inflightReload = null;
  let bindingsCleanup = null;
  let renderToken = 0;

  /* =========================================================
     SAFE HELPERS
  ========================================================= */

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

  function safeText(value, fallback = "") {
    if (value === null || value === undefined) return fallback;

    const text = String(value).trim();

    return text || fallback;
  }

  function safeObject(value) {
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};
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
      .trim();
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

    try {
      AppCore?.events?.emit?.(eventName, payload);
      return true;
    } catch {}

    try {
      window.dispatchEvent(
        new CustomEvent(eventName, {
          detail: payload,
        })
      );
      return true;
    } catch {}

    return false;
  }

  function showToast(message = "", type = "info") {
    const text = safeText(message, "");
    if (!text) return;

    try {
      if (typeof AppCore?.toast?.[type] === "function") {
        AppCore.toast[type](text);
        return;
      }
    } catch {}

    try {
      AppCore?.toast?.show?.(text, type);
      return;
    } catch {}

    try {
      AppCore?.ui?.toast?.[type]?.(text);
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

  function safeErrorMessage(error = null) {
    return safeText(
      first(
        error?.message,
        error?.response?.message,
        error?.response?.data?.message,
        error?.data?.message,
        error?.error,
        "No se pudo cargar la cuenta."
      ),
      "No se pudo cargar la cuenta."
    );
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
    if (typeof cuentaState.loading !== "boolean") {
      cuentaState.loading = false;
    }

    if (typeof cuentaState.refreshing !== "boolean") {
      cuentaState.refreshing = false;
    }

    if (typeof cuentaState.saving !== "boolean") {
      cuentaState.saving = false;
    }

    if (typeof cuentaState.hydrated !== "boolean") {
      cuentaState.hydrated = false;
    }

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

      if (!raw) {
        return null;
      }

      return normalizeCuentaModel(raw);
    } catch (error) {
      safeWarn("getCurrentItem falló:", error);
      return null;
    }
  }

  function getCurrentFormState() {
    return safeObject(cuentaState?.view?.form);
  }

  function normalizeLang(value = "es") {
    const key = normalizeKey(value);

    if (["en", "english"].includes(key)) return "en";
    if (["ca", "cat", "catala", "catalan"].includes(key)) return "ca";

    return "es";
  }

  function syncFormFromDetail(detail = null) {
    const item = detail || getCurrentItem();

    const payload = {
      darkMode: Boolean(item?.darkMode),
      privacyMode: Boolean(item?.privacyMode),
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

  function readFormPayloadFromDom() {
    const container = getContainer();
    const item = getCurrentItem();
    const currentForm = getCurrentFormState();

    const darkInput =
      container?.querySelector?.('[data-role="cuenta-darkmode-input"]') ||
      container?.querySelector?.("#cuenta-darkmode-input");

    const langSelect =
      container?.querySelector?.('[data-role="cuenta-language-select"]') ||
      container?.querySelector?.("#cuenta-language-select");

    const darkMode =
      typeof darkInput?.checked === "boolean"
        ? Boolean(darkInput.checked)
        : Boolean(first(currentForm.darkMode, item?.darkMode, false));

    const privacyMode = Boolean(
      first(
        currentForm.privacyMode,
        item?.privacyMode,
        item?.raw?.privacyMode,
        false
      )
    );

    const lang = normalizeLang(
      first(
        langSelect?.value,
        currentForm.lang,
        item?.lang,
        item?.language,
        item?.locale,
        item?.raw?.lang,
        item?.raw?.language,
        item?.raw?.locale,
        "es"
      )
    );

    return {
      darkMode,
      privacyMode,
      lang,
    };
  }

  /* =========================================================
     THEME / LANGUAGE SIDE EFFECTS
  ========================================================= */

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
      localStorage.setItem("theme", theme);
      localStorage.setItem("darkMode", String(isDark));
    } catch {}

    safeEmit("app:theme:change", {
      theme,
      darkMode: isDark,
      source: "cuenta",
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
    } catch {}

    try {
      AppCore?.setLang?.(nextLang);
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
      localStorage.setItem("lang", nextLang);
      localStorage.setItem("language", nextLang);
    } catch {}

    safeEmit("app:lang:change", {
      lang: nextLang,
      language: nextLang,
      source: "cuenta",
    });

    return nextLang;
  }

  function applyCuentaPreferencesSideEffects(detail = null) {
    const item = detail || getCurrentItem();

    if (!item) {
      return null;
    }

    applyCuentaThemeToDom(Boolean(item.darkMode));

    applyCuentaLanguageToDom(
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
        setHydrated?.(true);
        cuentaState.hydrated = true;
        hydrated = true;
      }
    } catch {}

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
    } catch (error) {
      safeWarn("OnionCuentaModal hook falló:", error);
    }

    try {
      const hook =
        window?.renderCuentaModal ||
        window?.openCuentaModal;

      if (typeof hook === "function") {
        hook(payload);
        return true;
      }
    } catch (error) {
      safeWarn("cuenta modal hook legacy falló:", error);
    }

    safeEmit("cuenta:modal:open", {
      detail: payload,
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
    } catch (error) {
      safeWarn("OnionCuentaPassword hook falló:", error);
    }

    try {
      const modal = window?.OnionCuentaModal;

      if (typeof modal?.changePassword === "function") {
        modal.changePassword(data);
        return true;
      }
    } catch (error) {
      safeWarn("OnionCuentaModal.changePassword falló:", error);
    }

    try {
      const hook =
        window?.changeCuentaPassword ||
        window?.updateCuentaPassword ||
        window?.renderCuentaPasswordModal;

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

    const oldBanner = container.querySelector(
      "[data-cuenta-error-banner='true']"
    );

    if (oldBanner) {
      oldBanner.remove();
    }

    const message = safeText(cuentaState.error, "");
    const hasVisibleData = Boolean(getCurrentItem());

    if (!message || !hasVisibleData) {
      return;
    }

    const anchor =
      container.querySelector(".cuenta-panel") ||
      container.querySelector("[data-view='cuenta']") ||
      container.querySelector(".content-wrapper");

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

  function decorateDom(container) {
    if (!container) return container;

    applyErrorStateToDom(container);

    return container;
  }

  /* =========================================================
     RENDER
  ========================================================= */

  function buildHtml() {
    const item = getCurrentItem();

    return `
      <section class="panel-content dashboard ready" data-view="cuenta">
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

    container.innerHTML = buildHtml();
    decorateDom(container);

    try {
      setHydrated?.(true);
    } catch {
      cuentaState.hydrated = true;
    }

    return container;
  }

  function rerender() {
    if (destroyed) return null;

    const container = render();

    if (!destroyed) {
      bind();
    }

    return container;
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

  async function handleSaveCuenta(payload = null) {
    if (destroyed) return null;

    const nextPayload = {
      ...readFormPayloadFromDom(),
      ...safeObject(payload),
    };

    nextPayload.darkMode = Boolean(nextPayload.darkMode);
    nextPayload.privacyMode = Boolean(nextPayload.privacyMode);
    nextPayload.lang = normalizeLang(nextPayload.lang);

    clearViewErrors?.();
    clearViewSuccess?.();
    setViewServerError?.("");

    patchViewForm?.({
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
      const detail = await updateCuenta({
        darkMode: nextPayload.darkMode,
        privacyMode: nextPayload.privacyMode,
        lang: nextPayload.lang,
      });

      const normalized = detail ? normalizeCuentaModel(detail) : getCurrentItem();

      applyCuentaPreferencesSideEffects(normalized);
      syncFormFromDetail(normalized);

      try {
        syncViewFormFromItem?.();
      } catch {}

      setViewSuccess?.({
        successMessage: "Preferencias guardadas correctamente.",
        updatedAt: normalized?.updatedAt || new Date().toISOString(),
      });

      safeEmit("cuenta:update:success", {
        detail: normalized,
      });

      showToast("Preferencias guardadas", "success");

      return normalized;
    } catch (error) {
      const message = safeErrorMessage(error);

      safeWarn("handleSaveCuenta falló:", error);

      syncFormFromCurrentItem();
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
    if (destroyed) return null;

    const nextDarkMode = Boolean(darkMode);

    clearViewErrors?.();
    clearViewSuccess?.();
    setViewServerError?.("");

    patchViewForm?.({
      ...readFormPayloadFromDom(),
      darkMode: nextDarkMode,
    });

    setState({
      saving: true,
      error: "",
    });

    rerender();
    await waitForPaint();

    try {
      const detail = await updateCuentaTheme(nextDarkMode);

      const normalized = detail ? normalizeCuentaModel(detail) : getCurrentItem();

      applyCuentaPreferencesSideEffects(normalized);

      patchViewForm?.({
        darkMode: Boolean(normalized?.darkMode),
        privacyMode: Boolean(normalized?.privacyMode),
        lang: normalizeLang(
          first(
            normalized?.lang,
            normalized?.language,
            normalized?.locale,
            "es"
          )
        ),
      });

      setViewSuccess?.({
        successMessage: "Tema actualizado correctamente.",
        updatedAt: normalized?.updatedAt || new Date().toISOString(),
      });

      safeEmit("cuenta:theme:update:success", {
        detail: normalized,
      });

      showToast("Tema actualizado", "success");

      return normalized;
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

  async function handleUpdateLanguage(lang = "es") {
    if (destroyed) return null;

    const nextLang = normalizeLang(lang);
    const currentPayload = readFormPayloadFromDom();

    clearViewErrors?.();
    clearViewSuccess?.();
    setViewServerError?.("");

    patchViewForm?.({
      ...currentPayload,
      lang: nextLang,
    });

    setState({
      saving: true,
      error: "",
    });

    rerender();
    await waitForPaint();

    try {
      const detail = await updateCuenta({
        darkMode: Boolean(currentPayload.darkMode),
        privacyMode: Boolean(currentPayload.privacyMode),
        lang: nextLang,
      });

      const normalized = detail ? normalizeCuentaModel(detail) : getCurrentItem();

      applyCuentaPreferencesSideEffects(normalized);
      syncFormFromDetail(normalized);

      setViewSuccess?.({
        successMessage: "Idioma actualizado correctamente.",
        updatedAt: normalized?.updatedAt || new Date().toISOString(),
      });

      safeEmit("cuenta:language:update:success", {
        detail: normalized,
        lang: nextLang,
      });

      showToast("Idioma actualizado", "success");

      return normalized;
    } catch (error) {
      const message = safeErrorMessage(error);

      safeWarn("handleUpdateLanguage falló:", error);

      syncFormFromCurrentItem();
      setViewServerError?.(message);

      safeEmit("cuenta:language:update:error", {
        error,
        lang: nextLang,
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

    const opened = openCuentaModalBridge(item);

    if (!opened) {
      showToast(
        "Detalle preparado. Falta conectar cuenta.modal.js para abrir el popup.",
        "info"
      );
    }

    return opened;
  }

  async function handlePasswordChange() {
    if (destroyed) return false;

    const container = getContainer();

    const currentPasswordInput =
      container?.querySelector?.('[data-role="cuenta-current-password"]') ||
      container?.querySelector?.("#cuenta-current-password");

    const newPasswordInput =
      container?.querySelector?.('[data-role="cuenta-new-password"]') ||
      container?.querySelector?.("#cuenta-new-password");

    const currentPassword = safeText(currentPasswordInput?.value, "");
    const newPassword = safeText(newPasswordInput?.value, "");

    if (!currentPassword) {
      showToast("Introduce la contraseña actual.", "error");
      currentPasswordInput?.focus?.();
      return false;
    }

    if (!newPassword) {
      showToast("Introduce la nueva contraseña.", "error");
      newPasswordInput?.focus?.();
      return false;
    }

    if (newPassword.length < PASSWORD_MIN_LENGTH) {
      showToast(
        `La nueva contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`,
        "error"
      );
      newPasswordInput?.focus?.();
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
        source: "cuenta",
      });

      safeEmit("cuenta:password:requested", {
        source: "cuenta",
      });

      if (handled) {
        showToast("Solicitud de cambio de contraseña enviada.", "success");
      } else {
        showToast(
          "Conecta el handler cuenta:password:change para procesar la contraseña.",
          "info"
        );
      }

      return handled;
    } catch (error) {
      const message = safeErrorMessage(error);

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

        const item = getCurrentItem();
        const currentPayload = readFormPayloadFromDom();

        const nextDarkMode = !Boolean(
          first(
            currentPayload.darkMode,
            item?.darkMode,
            false
          )
        );

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
        patchViewForm?.({
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
        patchViewForm?.({
          ...readFormPayloadFromDom(),
          lang: normalizeLang(languageSelect.value),
        });
      }
    };

    container.addEventListener("click", onClick);
    container.addEventListener("change", onChange);

    return () => {
      try {
        container.removeEventListener("click", onClick);
        container.removeEventListener("change", onChange);
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
        true;

      await handleUpdateTheme(Boolean(darkMode));
    };

    const onUpdateLanguage = async (event) => {
      if (destroyed) return;

      const payload = getEventPayload(event);

      const lang =
        payload.lang ||
        payload.language ||
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
    };
  }

  function bindWindowEvents() {
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

    try {
      window.addEventListener("cuenta:external:refresh", onRefresh);
      window.addEventListener("cuenta:preferences:mutated", onPreferencesMutated);
      window.addEventListener("cuenta:modal:updated", onPreferencesMutated);
      window.addEventListener("cuenta:password:success", onPreferencesMutated);
    } catch {}

    return () => {
      try {
        window.removeEventListener("cuenta:external:refresh", onRefresh);
        window.removeEventListener("cuenta:preferences:mutated", onPreferencesMutated);
        window.removeEventListener("cuenta:modal:updated", onPreferencesMutated);
        window.removeEventListener("cuenta:password:success", onPreferencesMutated);
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
      await renderAndLoad(options);

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

    inflightReload = null;

    safeLog("destroy");
  }

  /* =========================================================
     EXTRAS
  ========================================================= */

  function getItem() {
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

  function getState() {
    return {
      ...cuentaState,
      initialized,
      destroyed,
      hasInflightInit: Boolean(inflightInit),
      hasInflightReload: Boolean(inflightReload),
      item: getCurrentItem(),
    };
  }

  function openModal() {
    return handleOpenModal();
  }

  /* =========================================================
     API
  ========================================================= */

  const api = {
    init,
    render: rerender,
    reload,
    destroy,

    saveCuenta: handleSaveCuenta,
    updateTheme: handleUpdateTheme,
    updateLanguage: handleUpdateLanguage,
    refreshCuenta: handleRefreshCuenta,
    changePassword: handlePasswordChange,
    openModal,

    getItem,
    getSnapshot,
    getState,

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

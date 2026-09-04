import { createModalLifecycle, focusModalElement } from "../features/entity-overlay/modal-lifecycle.js";
import { createAsyncScope } from "../core/async-scope.js";

(() => {
  "use strict";

  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (window.OnionGoogleConsent) return;

  const GOOGLE_ANALYTICS_TAG_ID = "G-RQ77310QBH";
  const GOOGLE_ADS_TAG_ID = "AW-18395700376";
  const CONTACT_CONVERSION_DESTINATION =
    "AW-18395700376/WjQvCIe1tuMcEJi54MNE";
  const WHATSAPP_CONVERSION_DESTINATION =
    "AW-18395700376/6zBcCL3zo-ccEJi54MNE";

  const CONSENT_VERSION = 2;
  const CONSENT_STORAGE_KEY = "onion_google_consent_v2";
  const CONSENT_MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000;
  const CONSENT_STYLESHEET_URL = "/src/analytics/google-consent.css";
  const GOOGLE_TAG_IDLE_TIMEOUT_MS = 2500;
  const GOOGLE_TAG_RETRY_DELAY_MS = 5000;
  const GOOGLE_TAG_MAX_ATTEMPTS = 2;
  const CONSENT_CHANGED_EVENT = "onion:google-consent:changed";
  const LEGACY_ANALYTICS_CONSENT_EVENT =
    "onion:analytics:consent-granted";

  const PUBLIC_MARKETING_PATHS = new Set([
    "/",
    "/reparacion-ordenadores",
    "/soporte-informatico",
    "/redes-wifi",
    "/impresoras",
    "/soporte-empresas",
  ]);

  const ALLOWED_CAMPAIGN_QUERY_KEYS = new Set([
    "gclid",
    "gbraid",
    "wbraid",
    "gad_source",
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "utm_id",
  ]);

  const DEBUG_QUERY_KEYS = new Set([
    "gtm_debug",
    "gtm_auth",
    "gtm_preview",
    "tagassistant",
  ]);

  const EMPTY_CHOICE = Object.freeze({
    analytics: false,
    ads: false,
  });

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag() {
    window.dataLayer.push(arguments);
  };

  const storedConsent = readStoredConsent();
  let consentChoice = storedConsent || { ...EMPTY_CHOICE };
  let consentWasDecided = Boolean(storedConsent);
  let productsConfigured = false;
  let remoteState = "idle";
  let remoteAttempts = 0;
  let remoteScheduleHandle = 0;
  let initialPageViewSent = false;
  let lastPageViewKey = "";
  let currentDialog = null;
  let consentRoot = null;
  let consentStylesheetReady = null;
  const consentScope = createAsyncScope();
  let routeRefreshQueued = false;
  const modalLifecycle = createModalLifecycle({
    getPanel: () => currentDialog,
    onEscape: () => closeConsentDialog(),
    onDetached: () => closeConsentDialog({ restoreFocus: false }),
  });

  function safeNow() {
    return Date.now();
  }

  function normalizePathname(value = "") {
    const clean = String(value || "/")
      .trim()
      .replace(/\/{2,}/g, "/")
      .replace(/\/+$/, "");

    return clean || "/";
  }

  function isPublicMarketingRoute(value = window.location.pathname) {
    return PUBLIC_MARKETING_PATHS.has(normalizePathname(value));
  }

  function isTagAssistantSession() {
    try {
      const params = new URLSearchParams(window.location.search);
      return [...DEBUG_QUERY_KEYS].some((key) => params.has(key));
    } catch {
      return false;
    }
  }

  function hasAdClickSignal() {
    try {
      const params = new URLSearchParams(window.location.search);
      return ["gclid", "gbraid", "wbraid", "gad_source", "_gl"].some(
        (key) => params.has(key)
      );
    } catch {
      return false;
    }
  }

  function normalizeChoice(value) {
    return {
      analytics: value?.analytics === true,
      ads: value?.ads === true,
    };
  }

  function readStoredConsent() {
    try {
      const raw = window.localStorage.getItem(CONSENT_STORAGE_KEY);
      if (!raw) return null;

      const parsed = JSON.parse(raw);
      const updatedAt = Number(parsed?.updatedAt || 0);
      const isCurrent =
        parsed?.version === CONSENT_VERSION &&
        Number.isFinite(updatedAt) &&
        updatedAt > 0 &&
        safeNow() - updatedAt <= CONSENT_MAX_AGE_MS;

      if (!isCurrent) {
        window.localStorage.removeItem(CONSENT_STORAGE_KEY);
        return null;
      }

      return normalizeChoice(parsed);
    } catch {
      return null;
    }
  }

  function writeStoredConsent(choice) {
    try {
      const normalized = normalizeChoice(choice);
      window.localStorage.setItem(
        CONSENT_STORAGE_KEY,
        JSON.stringify({
          version: CONSENT_VERSION,
          updatedAt: safeNow(),
          analytics: normalized.analytics,
          ads: normalized.ads,
        })
      );
    } catch {
      /* El consentimiento sigue aplicándose aunque el almacenamiento falle. */
    }
  }

  function consentCommandState(choice, includeWait = false) {
    const normalized = normalizeChoice(choice);
    const state = {
      analytics_storage: normalized.analytics ? "granted" : "denied",
      ad_storage: normalized.ads ? "granted" : "denied",
      ad_user_data: normalized.ads ? "granted" : "denied",
      ad_personalization: "denied",
    };

    if (includeWait) {
      state.wait_for_update = 500;
    }

    return state;
  }

  function sanitizePageLocation() {
    const url = new URL(window.location.href);
    const output = new URL(`${url.origin}${normalizePathname(url.pathname)}`);

    for (const [key, value] of url.searchParams.entries()) {
      const normalizedKey = String(key || "").toLowerCase();
      if (!ALLOWED_CAMPAIGN_QUERY_KEYS.has(normalizedKey)) continue;
      output.searchParams.append(normalizedKey, String(value || "").slice(0, 500));
    }

    return output.href;
  }

  function safePageTitle() {
    return String(document.title || "Onion Support")
      .replace(/[\r\n\t]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 300);
  }

  function eventDefaults() {
    return {
      page_location: sanitizePageLocation(),
      page_path: normalizePathname(window.location.pathname),
      page_title: safePageTitle(),
      language: String(document.documentElement.lang || "es").slice(0, 20),
      debug_mode: isTagAssistantSession(),
    };
  }

  /*
    Consent Mode v2 se declara antes de cualquier configuración. La
    personalización publicitaria permanece desactivada incluso cuando el usuario
    acepta medición: Onion Support sólo necesita analítica y atribución.
  */
  window.gtag(
    "consent",
    "default",
    consentCommandState(consentChoice, !consentWasDecided)
  );
  window.gtag("set", "ads_data_redaction", true);
  window.gtag("set", "url_passthrough", true);
  window.gtag("set", "allow_google_signals", false);
  window.gtag("set", "allow_ad_personalization_signals", false);
  window.gtag("js", new Date());

  function updateRouteMeasurementGuard(
    pathname = window.location.pathname
  ) {
    const disabled = !isPublicMarketingRoute(pathname);
    window[`ga-disable-${GOOGLE_ANALYTICS_TAG_ID}`] = disabled;
    return disabled;
  }

  /*
    Un único Google tag sirve a GA4 y Google Ads. Sólo se configura dentro de
    las seis superficies públicas de marketing. Los page_view son manuales para
    impedir duplicados en la SPA y excluir por contrato rutas privadas,
    incidencias, clientes, facturas y URLs con tokens.
  */
  function ensureGoogleProductsConfigured() {
    if (productsConfigured || !isPublicMarketingRoute()) return;

    updateRouteMeasurementGuard();
    productsConfigured = true;

    window.gtag("config", GOOGLE_ANALYTICS_TAG_ID, {
      send_page_view: false,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      page_location: sanitizePageLocation(),
    });
    window.gtag("config", GOOGLE_ADS_TAG_ID, {
      allow_ad_personalization_signals: false,
      page_location: sanitizePageLocation(),
    });
  }

  updateRouteMeasurementGuard();
  ensureGoogleProductsConfigured();

  function clearRemoteSchedule() {
    if (!remoteScheduleHandle) return;

    window.clearTimeout(remoteScheduleHandle);
    remoteScheduleHandle = 0;
  }

  function createRemoteGoogleTagScript() {
    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(
      GOOGLE_ANALYTICS_TAG_ID
    )}`;
    script.dataset.onionGoogleTag = GOOGLE_ANALYTICS_TAG_ID;
    script.referrerPolicy = "strict-origin-when-cross-origin";
    return script;
  }

  function loadRemoteGoogleTag() {
    if (!isPublicMarketingRoute()) return;
    if (remoteState === "loading" || remoteState === "loaded") return;

    ensureGoogleProductsConfigured();
    clearRemoteSchedule();
    remoteState = "loading";
    remoteAttempts += 1;

    const script = createRemoteGoogleTagScript();

    script.addEventListener(
      "load",
      () => {
        remoteState = "loaded";
      },
      { once: true }
    );

    script.addEventListener(
      "error",
      () => {
        script.remove();
        remoteState = "idle";

        if (
          remoteAttempts < GOOGLE_TAG_MAX_ATTEMPTS &&
          isPublicMarketingRoute()
        ) {
          remoteScheduleHandle = window.setTimeout(
            loadRemoteGoogleTag,
            GOOGLE_TAG_RETRY_DELAY_MS
          );
        }
      },
      { once: true }
    );

    document.head.appendChild(script);
  }

  function scheduleRemoteGoogleTag() {
    if (!isPublicMarketingRoute()) return;
    if (remoteState !== "idle" || remoteScheduleHandle) return;

    ensureGoogleProductsConfigured();

    if (
      consentChoice.analytics ||
      consentChoice.ads ||
      hasAdClickSignal() ||
      isTagAssistantSession()
    ) {
      loadRemoteGoogleTag();
      return;
    }

    const schedule = () => {
      if (remoteState !== "idle") return;

      if (typeof window.requestIdleCallback === "function") {
        window.requestIdleCallback(loadRemoteGoogleTag, {
          timeout: GOOGLE_TAG_IDLE_TIMEOUT_MS,
        });
        return;
      }

      remoteScheduleHandle = window.setTimeout(() => {
        remoteScheduleHandle = 0;
        loadRemoteGoogleTag();
      }, GOOGLE_TAG_IDLE_TIMEOUT_MS);
    };

    if (document.readyState === "complete") {
      schedule();
      return;
    }

    window.addEventListener("load", schedule, { once: true });
  }

  function trackCurrentPageView({ force = false } = {}) {
    if (!isPublicMarketingRoute()) return;
    if (!consentChoice.analytics) return;

    ensureGoogleProductsConfigured();
    const defaults = eventDefaults();
    const key = `${defaults.page_path}|${defaults.page_location}`;

    if (!force && key === lastPageViewKey) return;

    lastPageViewKey = key;
    initialPageViewSent = true;

    window.gtag("event", "page_view", {
      ...defaults,
      send_to: GOOGLE_ANALYTICS_TAG_ID,
    });

    loadRemoteGoogleTag();
  }

  function trackAnalyticsEvent(name, parameters = {}) {
    if (!isPublicMarketingRoute()) return;
    if (!consentChoice.analytics) return;

    ensureGoogleProductsConfigured();
    window.gtag("event", name, {
      ...eventDefaults(),
      ...parameters,
      send_to: GOOGLE_ANALYTICS_TAG_ID,
    });

    loadRemoteGoogleTag();
  }

  function sendGoogleAdsConversion(destination, parameters = {}) {
    if (!destination || !isPublicMarketingRoute()) return;
    if (!consentChoice.ads) return;

    ensureGoogleProductsConfigured();
    window.gtag("event", "conversion", {
      ...eventDefaults(),
      ...parameters,
      send_to: destination,
      event_timeout: 2000,
    });

    loadRemoteGoogleTag();
  }

  function announceConsentChange(source) {
    const detail = Object.freeze({
      version: CONSENT_VERSION,
      source: String(source || "unknown"),
      analytics: consentChoice.analytics,
      ads: consentChoice.ads,
      adPersonalization: false,
    });

    window.dispatchEvent(
      new CustomEvent(CONSENT_CHANGED_EVENT, { detail })
    );

    window.dataLayer.push({
      event: "onion_google_consent_update",
      onion_consent_source: detail.source,
      onion_analytics_storage: detail.analytics ? "granted" : "denied",
      onion_ad_storage: detail.ads ? "granted" : "denied",
      onion_ad_personalization: "denied",
    });
  }

  function applyConsent(nextChoice, { persist = true, source = "ui" } = {}) {
    const previous = { ...consentChoice };
    consentChoice = normalizeChoice(nextChoice);
    consentWasDecided = true;

    window.gtag(
      "consent",
      "update",
      consentCommandState(consentChoice, false)
    );

    if (persist) {
      writeStoredConsent(consentChoice);
    }

    announceConsentChange(source);
    loadRemoteGoogleTag();

    if (
      consentChoice.analytics &&
      (!previous.analytics || !initialPageViewSent)
    ) {
      trackCurrentPageView({ force: true });
    }

    refreshConsentUi();
  }

  function isWhatsAppLink(anchor) {
    const href = String(anchor?.getAttribute?.("href") || "").trim();
    if (!href) return false;
    if (/^whatsapp:/i.test(href)) return true;

    try {
      const url = new URL(href, document.baseURI);
      const host = url.hostname.toLowerCase();
      return (
        host === "wa.me" ||
        host.endsWith(".wa.me") ||
        host === "whatsapp.com" ||
        host.endsWith(".whatsapp.com")
      );
    } catch {
      return /(?:wa\.me|whatsapp\.com)/i.test(href);
    }
  }

  function safeLinkHost(anchor) {
    try {
      return new URL(anchor.href, document.baseURI).hostname
        .toLowerCase()
        .slice(0, 253);
    } catch {
      return "";
    }
  }

  document.addEventListener(
    "click",
    (event) => {
      const anchor = event.target?.closest?.("a[href]");
      if (!anchor || !isPublicMarketingRoute()) return;

      const href = String(anchor.getAttribute("href") || "").trim();

      if (isWhatsAppLink(anchor)) {
        trackAnalyticsEvent("generate_lead", {
          method: "whatsapp",
          link_domain: safeLinkHost(anchor),
        });
        sendGoogleAdsConversion(WHATSAPP_CONVERSION_DESTINATION);
        return;
      }

      if (/^tel:/i.test(href)) {
        trackAnalyticsEvent("click_to_call", {
          method: "telephone",
        });
        return;
      }

      if (/^mailto:/i.test(href)) {
        trackAnalyticsEvent("contact_email", {
          method: "email",
        });
      }
    },
    true
  );

  /*
    El formulario público emite este evento sólo después de que el backend haya
    aceptado la solicitud. No medimos el clic ni intentos fallidos.
  */
  window.addEventListener("onion:public-support:accepted", () => {
    trackAnalyticsEvent("generate_lead", {
      method: "public_support_form",
    });
    sendGoogleAdsConversion(CONTACT_CONVERSION_DESTINATION);
  });

  window.addEventListener(LEGACY_ANALYTICS_CONSENT_EVENT, () => {
    applyConsent(
      {
        analytics: true,
        ads: consentChoice.ads,
      },
      {
        persist: true,
        source: "legacy-event",
      }
    );
  });

  function ensureConsentStylesheet() {
    if (consentStylesheetReady) return consentStylesheetReady;

    const existing = document.querySelector(
      `link[data-onion-google-consent-style="${CONSENT_VERSION}"]`
    );
    const link = existing || document.createElement("link");

    consentStylesheetReady = new Promise((resolve) => {
      if (link.sheet) {
        resolve();
        return;
      }

      const settle = () => {
        link.removeEventListener("load", settle);
        link.removeEventListener("error", settle);
        resolve();
      };
      link.addEventListener("load", settle, { once: true });
      // A failed stylesheet must not leave the privacy controls hidden forever.
      link.addEventListener("error", settle, { once: true });

      if (!existing) {
        link.rel = "stylesheet";
        link.href = CONSENT_STYLESHEET_URL;
        link.dataset.onionGoogleConsentStyle = String(CONSENT_VERSION);
        document.head.appendChild(link);
      }
    });
    return consentStylesheetReady;
  }

  function consentRootMarkup() {
    return `
      <section
        class="onion-google-consent"
        data-onion-google-consent-root
        data-consent-version="${CONSENT_VERSION}"
        aria-label="Preferencias de privacidad"
      >
        <div
          class="onion-google-consent__banner"
          data-consent-banner
          role="region"
          aria-labelledby="onion-consent-title"
          aria-describedby="onion-consent-description"
          hidden
        >
          <div class="onion-google-consent__copy">
            <p class="onion-google-consent__eyebrow">Privacidad</p>
            <h2 id="onion-consent-title">Tú decides cómo medimos la web</h2>
            <p id="onion-consent-description">
              Usamos Google Analytics y Google Ads para saber qué páginas ayudan
              y qué contactos proceden de campañas. No activamos publicidad
              personalizada y puedes cambiar tu decisión cuando quieras.
            </p>
          </div>
          <div class="onion-google-consent__actions" aria-label="Decisión de privacidad">
            <button
              class="onion-google-consent__button onion-google-consent__button--decision"
              type="button"
              data-consent-action="reject"
            >Rechazar</button>
            <button
              class="onion-google-consent__button onion-google-consent__button--settings"
              type="button"
              data-consent-action="settings"
            >Configurar</button>
            <button
              class="onion-google-consent__button onion-google-consent__button--decision"
              type="button"
              data-consent-action="accept"
            >Aceptar medición</button>
          </div>
        </div>

        <button
          class="onion-google-consent__preferences"
          type="button"
          data-consent-action="settings"
          aria-label="Cambiar preferencias de medición"
          hidden
        >Cookies</button>

        <div
          class="onion-google-consent__backdrop"
          data-consent-backdrop
          hidden
        ></div>

        <section
          class="onion-google-consent__dialog"
          data-consent-dialog
          role="dialog"
          aria-modal="true"
          aria-labelledby="onion-consent-settings-title"
          aria-describedby="onion-consent-settings-description"
          tabindex="-1"
          hidden
        >
          <div class="onion-google-consent__dialog-head">
            <div>
              <p class="onion-google-consent__eyebrow">Configuración</p>
              <h2 id="onion-consent-settings-title">Preferencias de medición</h2>
            </div>
            <button
              class="onion-google-consent__close"
              type="button"
              data-consent-action="close"
              aria-label="Cerrar preferencias"
            >×</button>
          </div>

          <p id="onion-consent-settings-description">
            Las funciones técnicas necesarias siguen activas. Estas opciones son
            voluntarias y la decisión se recuerda durante 180 días.
          </p>

          <div class="onion-google-consent__options">
            <label class="onion-google-consent__option">
              <span>
                <strong>Analítica</strong>
                <small>Visitas, páginas vistas y rendimiento agregado en Google Analytics.</small>
              </span>
              <input type="checkbox" data-consent-option="analytics">
            </label>

            <label class="onion-google-consent__option">
              <span>
                <strong>Medición publicitaria</strong>
                <small>Atribución de contactos a Google Ads. Sin publicidad personalizada.</small>
              </span>
              <input type="checkbox" data-consent-option="ads">
            </label>
          </div>

          <details class="onion-google-consent__details">
            <summary>Información sobre el tratamiento</summary>
            <div>
              <p>
                Responsable: Onion Support, Cristian Ávila.
                Contacto: cristian@onionsupport.com.
              </p>
              <p>
                Proveedor tecnológico: Google. Finalidad: medición agregada y
                atribución de campañas. La
                personalización publicitaria permanece desactivada.
              </p>
              <p>
                Puedes retirar o modificar el consentimiento desde el botón
                “Cookies”. La preferencia técnica se guarda localmente durante
                180 días.
              </p>
              <p>
                <a
                  href="https://policies.google.com/privacy?hl=es"
                  target="_blank"
                  rel="noopener noreferrer"
                >Privacidad de Google</a>
                <span aria-hidden="true"> · </span>
                <a
                  href="https://www.aepd.es/guias/guia-cookies.pdf"
                  target="_blank"
                  rel="noopener noreferrer"
                >Guía de cookies de la AEPD</a>
              </p>
            </div>
          </details>

          <div class="onion-google-consent__dialog-actions">
            <button
              class="onion-google-consent__button onion-google-consent__button--settings"
              type="button"
              data-consent-action="close"
            >Cancelar</button>
            <button
              class="onion-google-consent__button onion-google-consent__button--decision"
              type="button"
              data-consent-action="save"
            >Guardar preferencias</button>
          </div>
        </section>
      </section>
    `;
  }

  function ensureConsentRoot() {
    if (consentRoot?.isConnected) return consentRoot;
    if (!document.body) return null;

    const stylesheetReady = ensureConsentStylesheet();

    const host = document.createElement("div");
    host.innerHTML = consentRootMarkup().trim();
    consentRoot = host.firstElementChild;
    host.remove();

    if (!consentRoot) return null;

    // The banner is fixed only after its stylesheet loads. Do not paint its
    // temporary document-flow position while that request is pending.
    consentRoot.hidden = true;
    consentRoot.addEventListener("click", handleConsentClick);
    document.body.appendChild(consentRoot);
    const root = consentRoot;
    stylesheetReady.then(() => {
      if (root.isConnected) root.hidden = false;
    });
    return consentRoot;
  }

  async function openConsentDialog() {
    if (!isPublicMarketingRoute()) return;
    const root = ensureConsentRoot();
    if (!root) return;

    const request = consentScope.begin("dialog");
    try {
      await ensureConsentStylesheet();
      if (
        !request.isCurrent() ||
        !root.isConnected ||
        !isPublicMarketingRoute()
      ) return;

      const dialog = root.querySelector("[data-consent-dialog]");
      const backdrop = root.querySelector("[data-consent-backdrop]");
      const analytics = root.querySelector('[data-consent-option="analytics"]');
      const ads = root.querySelector('[data-consent-option="ads"]');

      if (!dialog || !backdrop || !analytics || !ads) return;

      analytics.checked = consentChoice.analytics;
      ads.checked = consentChoice.ads;
      dialog.hidden = false;
      backdrop.hidden = false;
      document.documentElement.dataset.onionConsentDialog = "open";
      currentDialog = dialog;
      modalLifecycle.activate();

      window.requestAnimationFrame(() => {
        if (modalLifecycle.isTop() && currentDialog === dialog) focusModalElement(dialog);
      });
    } finally {
      request.finish();
    }
  }

  function closeConsentDialog({ restoreFocus = true } = {}) {
    consentScope.cancel("dialog", "closed");
    if (!consentRoot) return;

    const dialog = consentRoot.querySelector("[data-consent-dialog]");
    const backdrop = consentRoot.querySelector("[data-consent-backdrop]");

    if (dialog) dialog.hidden = true;
    if (backdrop) backdrop.hidden = true;
    delete document.documentElement.dataset.onionConsentDialog;
    currentDialog = null;

    modalLifecycle.deactivate({ restoreFocus });
  }

  function handleConsentClick(event) {
    const actionElement = event.target?.closest?.("[data-consent-action]");
    if (!actionElement) return;

    const action = actionElement.dataset.consentAction;

    if (action === "accept") {
      applyConsent(
        { analytics: true, ads: true },
        { persist: true, source: "accept-all-measurement" }
      );
      return;
    }

    if (action === "reject") {
      applyConsent(
        { analytics: false, ads: false },
        { persist: true, source: "reject" }
      );
      return;
    }

    if (action === "settings") {
      openConsentDialog();
      return;
    }

    if (action === "close") {
      closeConsentDialog();
      return;
    }

    if (action === "save") {
      const analytics = Boolean(
        consentRoot?.querySelector('[data-consent-option="analytics"]')?.checked
      );
      const ads = Boolean(
        consentRoot?.querySelector('[data-consent-option="ads"]')?.checked
      );

      closeConsentDialog({ restoreFocus: false });
      applyConsent(
        { analytics, ads },
        { persist: true, source: "settings" }
      );
    }
  }

  function refreshConsentUi() {
    if (!isPublicMarketingRoute()) {
      closeConsentDialog({ restoreFocus: false });
      consentRoot?.remove();
      consentRoot = null;
      return;
    }

    const root = ensureConsentRoot();
    if (!root) return;

    const banner = root.querySelector("[data-consent-banner]");
    const preferences = root.querySelector(
      '.onion-google-consent__preferences'
    );

    if (banner) {
      banner.hidden = consentWasDecided;
    }

    if (preferences) {
      preferences.hidden = !consentWasDecided;
    }
  }

  function queueRouteRefresh() {
    if (routeRefreshQueued) return;
    routeRefreshQueued = true;

    window.queueMicrotask(() => {
      routeRefreshQueued = false;
      updateRouteMeasurementGuard();

      if (isPublicMarketingRoute()) {
        ensureGoogleProductsConfigured();
        scheduleRemoteGoogleTag();
        trackCurrentPageView();
      }

      refreshConsentUi();
    });
  }

  function pathnameFromHistoryTarget(target) {
    if (target === undefined || target === null || target === "") {
      return window.location.pathname;
    }

    try {
      return new URL(String(target), window.location.href).pathname;
    } catch {
      return window.location.pathname;
    }
  }

  function installHistoryObserver() {
    for (const methodName of ["pushState", "replaceState"]) {
      const original = window.history?.[methodName];
      if (typeof original !== "function") continue;
      if (original.__onionGoogleMeasurementWrapped) continue;

      const wrapped = function onionGoogleMeasurementHistory(...args) {
        updateRouteMeasurementGuard(pathnameFromHistoryTarget(args[2]));
        const result = original.apply(this, args);
        queueRouteRefresh();
        return result;
      };

      Object.defineProperty(wrapped, "__onionGoogleMeasurementWrapped", {
        value: true,
      });

      window.history[methodName] = wrapped;
    }

    const handleLocationEvent = () => {
      updateRouteMeasurementGuard();
      queueRouteRefresh();
    };

    window.addEventListener("popstate", handleLocationEvent);
    window.addEventListener("hashchange", handleLocationEvent);
  }

  function mountConsentUiWhenReady() {
    if (!isPublicMarketingRoute()) return;

    const mount = () => {
      refreshConsentUi();
    };

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", mount, { once: true });
      return;
    }

    mount();
  }

  window.OnionGoogleConsent = Object.freeze({
    version: CONSENT_VERSION,
    open: openConsentDialog,
    get() {
      return Object.freeze({
        decided: consentWasDecided,
        analytics: consentChoice.analytics,
        ads: consentChoice.ads,
        adPersonalization: false,
      });
    },
    update(nextChoice) {
      applyConsent(nextChoice, {
        persist: true,
        source: "public-api",
      });
    },
  });

  installHistoryObserver();
  mountConsentUiWhenReady();
  scheduleRemoteGoogleTag();

  if (consentChoice.analytics) {
    trackCurrentPageView({ force: true });
  }
})();

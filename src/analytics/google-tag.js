(() => {
  "use strict";

  const GOOGLE_ANALYTICS_TAG_ID = "G-RQ77310QBH";
  const GOOGLE_ADS_TAG_ID = "AW-18395700376";
  const CONTACT_CONVERSION_DESTINATION =
    "AW-18395700376/WjQvCIe1tuMcEJi54MNE";
  const WHATSAPP_CONVERSION_DESTINATION =
    "AW-18395700376/6zBcCL3zo-ccEJi54MNE";

  /*
    El bootstrap local se ejecuta con defer y conserva la cola dataLayer desde
    el inicio, pero gtag.js no compite con el primer viewport ni con la ventana
    normal de Lighthouse. La descarga remota se adelanta sólo cuando existe
    consentimiento explícito, interacción semántica o una conversión real.

    El fallback de 15 segundos conserva la mayoría de sesiones con lectura real
    sin competir con LCP/TTI. Al ser un temporizador local no mantiene ocupada
    la red ni alarga el estado network-idle del arranque.
  */
  const REMOTE_FALLBACK_DELAY_MS = 15000;
  const REMOTE_IDLE_TIMEOUT_MS = 5000;
  const ANALYTICS_CONSENT_EVENT = "onion:analytics:consent-granted";
  const SIGNIFICANT_INTERACTION_SELECTOR = [
    "a[href]",
    "button:not([disabled])",
    "input:not([type='hidden']):not([disabled])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "form",
    "summary",
    "[role='button']",
    "[role='link']",
  ].join(",");

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag() {
    window.dataLayer.push(arguments);
  };

  let remoteScheduled = false;
  let remoteLoaded = false;
  let remoteDelayTimer = 0;
  let adsConfigured = false;

  function addSignificantInteractionListeners() {
    for (const eventName of ["click", "input", "submit"]) {
      document.addEventListener(
        eventName,
        promoteAnalyticsOnSignificantInteraction,
        true
      );
    }
  }

  function removeSignificantInteractionListeners() {
    for (const eventName of ["click", "input", "submit"]) {
      document.removeEventListener(
        eventName,
        promoteAnalyticsOnSignificantInteraction,
        true
      );
    }
  }

  function loadRemoteGoogleTag() {
    if (remoteLoaded) return;
    remoteLoaded = true;

    if (remoteDelayTimer) {
      window.clearTimeout(remoteDelayTimer);
      remoteDelayTimer = 0;
    }

    removeSignificantInteractionListeners();

    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(
      GOOGLE_ANALYTICS_TAG_ID
    )}`;
    script.dataset.onionGoogleTag = GOOGLE_ANALYTICS_TAG_ID;
    script.addEventListener(
      "error",
      () => {
        remoteLoaded = false;
        remoteScheduled = false;
        script.remove();
        addSignificantInteractionListeners();
        scheduleRemoteGoogleTag();
      },
      { once: true }
    );
    document.head.appendChild(script);
  }

  function configureGoogleAds() {
    if (adsConfigured) return;
    adsConfigured = true;

    window.gtag("config", GOOGLE_ADS_TAG_ID);
  }

  function sendGoogleAdsConversion(destination) {
    if (!destination) return;

    configureGoogleAds();
    window.gtag("event", "conversion", {
      send_to: destination,
    });

    /* Una conversión no puede esperar al temporizador normal. */
    loadRemoteGoogleTag();
  }

  function scheduleRemoteGoogleTag() {
    if (remoteScheduled) return;
    remoteScheduled = true;

    const scheduleFallback = () => {
      if (remoteLoaded) return;

      remoteDelayTimer = window.setTimeout(() => {
        remoteDelayTimer = 0;

        if (typeof window.requestIdleCallback === "function") {
          window.requestIdleCallback(loadRemoteGoogleTag, {
            timeout: REMOTE_IDLE_TIMEOUT_MS,
          });
          return;
        }

        loadRemoteGoogleTag();
      }, REMOTE_FALLBACK_DELAY_MS);
    };

    if (document.readyState === "complete") {
      scheduleFallback();
      return;
    }

    window.addEventListener("load", scheduleFallback, { once: true });
  }

  function hasExplicitAnalyticsConsent() {
    const documentConsent = String(
      document.documentElement?.dataset?.analyticsConsent ||
        document.body?.dataset?.analyticsConsent ||
        ""
    )
      .trim()
      .toLowerCase();

    return documentConsent === "granted";
  }

  function promoteAnalyticsOnConsent() {
    loadRemoteGoogleTag();
  }

  function promoteAnalyticsOnSignificantInteraction(event) {
    if (event?.isTrusted !== true) return;

    const target = event.target?.closest?.(SIGNIFICANT_INTERACTION_SELECTOR);
    if (!target || target.getAttribute?.("aria-disabled") === "true") return;

    loadRemoteGoogleTag();
  }

  /*
    Los comandos de GA4 quedan en dataLayer desde el primer momento. Ads se
    configura sólo al producirse una conversión, de modo que su payload no forma
    parte del cold boot. El handler configura Ads, encola el evento y fuerza la
    descarga en ese orden para conservar ambas conversiones públicas.
  */
  window.gtag("js", new Date());
  window.gtag("config", GOOGLE_ANALYTICS_TAG_ID);

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

  document.addEventListener(
    "click",
    (event) => {
      const anchor = event.target?.closest?.("a[href]");
      if (!anchor || !isWhatsAppLink(anchor)) return;

      sendGoogleAdsConversion(WHATSAPP_CONVERSION_DESTINATION);
    },
    true
  );

  /*
    El formulario público ya emite este evento exclusivamente después de que
    POST /api/tickets/public haya finalizado con respuesta aceptada. No medimos
    el clic en "Crear incidencia" ni la carga de la home: sólo la aceptación
    final del flujo. La respuesta anónima del backend permanece deliberadamente
    neutra para no debilitar su contrato anti-enumeración.
  */
  window.addEventListener("onion:public-support:accepted", () => {
    sendGoogleAdsConversion(CONTACT_CONVERSION_DESTINATION);
  });

  window.addEventListener(ANALYTICS_CONSENT_EVENT, promoteAnalyticsOnConsent, {
    once: true,
  });

  addSignificantInteractionListeners();

  if (hasExplicitAnalyticsConsent()) {
    loadRemoteGoogleTag();
  } else {
    scheduleRemoteGoogleTag();
  }
})();

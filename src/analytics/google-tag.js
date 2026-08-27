(() => {
  "use strict";

  const GOOGLE_ANALYTICS_TAG_ID = "G-RQ77310QBH";
  const GOOGLE_ADS_TAG_ID = "AW-18395700376";
  const WHATSAPP_CONVERSION_DESTINATION =
    "AW-18395700376/6zBcCL3zo-ccEJi54MNE";

  /*
    El bootstrap local permanece disponible desde <head>, pero el JavaScript
    remoto de Google no compite con el primer viewport. Un usuario que
    interactúa fuerza la carga inmediatamente; si no hay interacción, GA4 se
    activa después de una ventana mínima y Google Ads queda todavía más tarde.
  */
  const REMOTE_LOAD_MIN_DELAY_MS = 4000;
  const REMOTE_IDLE_TIMEOUT_MS = 2500;
  const ADS_AUTO_CONFIG_DELAY_MS = 9000;

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag() {
    window.dataLayer.push(arguments);
  };

  let remoteScheduled = false;
  let remoteLoaded = false;
  let remoteDelayTimer = 0;
  let adsConfigured = false;
  let adsTimer = 0;

  function loadRemoteGoogleTag() {
    if (remoteLoaded) return;
    remoteLoaded = true;

    if (remoteDelayTimer) {
      window.clearTimeout(remoteDelayTimer);
      remoteDelayTimer = 0;
    }

    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(
      GOOGLE_ANALYTICS_TAG_ID
    )}`;
    script.dataset.onionGoogleTag = GOOGLE_ANALYTICS_TAG_ID;
    document.head.appendChild(script);
  }

  function configureGoogleAds() {
    if (adsConfigured) return;
    adsConfigured = true;

    if (adsTimer) {
      window.clearTimeout(adsTimer);
      adsTimer = 0;
    }

    window.gtag("config", GOOGLE_ADS_TAG_ID);
  }

  function scheduleRemoteGoogleTag() {
    if (remoteScheduled) return;
    remoteScheduled = true;

    const scheduleAfterMinimumDelay = () => {
      remoteDelayTimer = window.setTimeout(() => {
        remoteDelayTimer = 0;

        if (typeof window.requestIdleCallback === "function") {
          window.requestIdleCallback(loadRemoteGoogleTag, {
            timeout: REMOTE_IDLE_TIMEOUT_MS,
          });
          return;
        }

        loadRemoteGoogleTag();
      }, REMOTE_LOAD_MIN_DELAY_MS);
    };

    if (document.readyState === "complete") {
      scheduleAfterMinimumDelay();
      return;
    }

    window.addEventListener("load", scheduleAfterMinimumDelay, { once: true });
  }

  function scheduleGoogleAds() {
    if (adsConfigured || adsTimer) return;

    adsTimer = window.setTimeout(() => {
      adsTimer = 0;
      configureGoogleAds();
      loadRemoteGoogleTag();
    }, ADS_AUTO_CONFIG_DELAY_MS);
  }

  function promoteAnalyticsOnInteraction() {
    loadRemoteGoogleTag();
  }

  /*
    Los comandos de GA4 quedan en dataLayer desde el primer momento. Ads se
    configura de forma deliberadamente diferida para que su payload adicional
    no forme parte del cold boot. Si existe una conversión antes, el handler de
    WhatsApp configura Ads primero y luego encola el evento en orden.
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

      configureGoogleAds();
      window.gtag("event", "conversion", {
        send_to: WHATSAPP_CONVERSION_DESTINATION,
      });

      /* Una conversión no puede esperar al temporizador normal. */
      loadRemoteGoogleTag();
    },
    true
  );

  for (const eventName of ["pointerdown", "keydown", "touchstart"]) {
    window.addEventListener(eventName, promoteAnalyticsOnInteraction, {
      once: true,
      passive: eventName !== "keydown",
    });
  }

  scheduleRemoteGoogleTag();
  scheduleGoogleAds();
})();

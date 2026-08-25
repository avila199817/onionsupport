(() => {
  "use strict";

  const GOOGLE_ANALYTICS_TAG_ID = "G-RQ77310QBH";
  const GOOGLE_ADS_TAG_ID = "AW-18395700376";
  const WHATSAPP_CONVERSION_DESTINATION =
    "AW-18395700376/6zBcCL3zo-ccEJi54MNE";

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag() {
    window.dataLayer.push(arguments);
  };

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(
    GOOGLE_ANALYTICS_TAG_ID
  )}`;
  script.dataset.onionGoogleTag = GOOGLE_ANALYTICS_TAG_ID;
  document.head.appendChild(script);

  window.gtag("js", new Date());
  window.gtag("config", GOOGLE_ANALYTICS_TAG_ID);
  window.gtag("config", GOOGLE_ADS_TAG_ID);

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

      window.gtag("event", "conversion", {
        send_to: WHATSAPP_CONVERSION_DESTINATION,
      });
    },
    true
  );
})();

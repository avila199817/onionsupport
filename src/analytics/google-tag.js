(() => {
  "use strict";

  const GOOGLE_TAG_ID = "G-RQ77310QBH";

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag() {
    window.dataLayer.push(arguments);
  };

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GOOGLE_TAG_ID)}`;
  script.dataset.onionGoogleTag = GOOGLE_TAG_ID;
  document.head.appendChild(script);

  window.gtag("js", new Date());
  window.gtag("config", GOOGLE_TAG_ID);
})();

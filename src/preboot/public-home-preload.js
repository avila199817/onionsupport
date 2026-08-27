(() => {
  "use strict";

  /*
    Cold-start hints exclusivos de la landing pública.
    index.html también sirve rutas privadas; por eso estos recursos no pueden
    vivir como <link> incondicionales en el documento.
  */
  try {
    if (window.location.pathname !== "/") return;

    const head = document.head;
    if (!head) return;

    const hints = [
      {
        rel: "stylesheet",
        href: "/src/css/views/public/home-critical.css",
        fetchPriority: "high",
      },
      { rel: "preload", as: "style", href: "/src/css/views/public/index.css" },
      { rel: "preload", as: "style", href: "/src/css/views/public/support-request.css" },
      { rel: "preload", as: "style", href: "/src/css/views/public/public-support-progress.css" },
      { rel: "preload", as: "style", href: "/src/css/views/public/home-experience.css" },
      { rel: "modulepreload", href: "/src/views/public/home/index.js" },
      { rel: "modulepreload", href: "/src/views/public/home/template.js" },
      {
        rel: "preload",
        as: "image",
        href: "/src/media/img/Cristian_Avila.png",
        fetchPriority: "high",
      },
    ];

    for (const hint of hints) {
      if (head.querySelector(`link[href="${hint.href}"]`)) continue;

      const link = document.createElement("link");
      link.rel = hint.rel;
      link.href = hint.href;
      if (hint.as) link.as = hint.as;
      if (hint.fetchPriority) {
        link.fetchPriority = hint.fetchPriority;
        link.setAttribute("fetchpriority", hint.fetchPriority);
      }
      link.dataset.onionPublicHomePreload = "true";
      head.appendChild(link);
    }
  } catch {
    // Una optimización especulativa nunca puede bloquear el arranque.
  }
})();
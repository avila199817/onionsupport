(() => {
  "use strict";

  /*
    Cold-start hints exclusivos de la landing pública.
    index.html también sirve rutas privadas; por eso estos recursos no pueden
    vivir como <link> incondicionales en el documento.
  */
  try {
    const head = document.head;
    if (!head) return;

    if (window.location.pathname !== "/") {
      for (const href of [
        "/src/features/ticket-deeplink/index.js",
        "/src/ui/chrome/index.js",
      ]) {
        if (head.querySelector(`link[href="${href}"]`)) continue;
        const link = document.createElement("link");
        link.rel = "modulepreload";
        link.href = href;
        link.dataset.onionPrivateBootPreload = "true";
        head.appendChild(link);
      }
      return;
    }

    const heroImageSrcset = [
      ["/src/media/img/Cristian_Avila_224.webp", "224w"].join(" "),
      ["/src/media/img/Cristian_Avila_480.webp", "480w"].join(" "),
      ["/src/media/img/Cristian_Avila_640.webp", "640w"].join(" "),
      ["/src/media/img/Cristian_Avila_960.webp", "960w"].join(" "),
    ].join(", ");
    const heroImageSizes = "(max-width: 720px) calc(100vw - 90px), (max-width: 1040px) 206px, (max-width: 1240px) 176px, 196px";

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
        href: "/src/media/img/Cristian_Avila_224.webp",
        type: "image/webp",
        imageSrcset: heroImageSrcset,
        imageSizes: heroImageSizes,
        fetchPriority: "high",
      },
    ];

    for (const hint of hints) {
      if (head.querySelector(`link[href="${hint.href}"]`)) continue;

      const link = document.createElement("link");
      link.rel = hint.rel;
      link.href = hint.href;
      if (hint.as) link.as = hint.as;
      if (hint.type) link.type = hint.type;
      if (hint.imageSrcset) link.setAttribute("imagesrcset", hint.imageSrcset);
      if (hint.imageSizes) link.setAttribute("imagesizes", hint.imageSizes);
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

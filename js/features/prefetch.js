"use strict";

/* =========================
   PREFETCH (PRO SaaS - ONION)
========================= */

(function(){

  if(!window.Onion){
    console.error("💥 Onion no está definido (prefetch.js)");
    return;
  }

  const Onion = window.Onion;

  let prefetched = new Set();

  /* =========================
     PREFETCH CORE
  ========================= */

  Onion.prefetch = async function(path){

    try{

      if(!path) return;

      // 🔥 normalizar
      let clean = path.startsWith("/") ? path : "/" + path;
      clean = clean.replace(/\/+/g, "/");

      if(prefetched.has(clean)){
        Onion.log("⚡ Prefetch ya hecho:", clean);
        return;
      }

      const route = Onion.routes[clean];
      if(!route) return;

      prefetched.add(clean);

      Onion.log("🚀 Prefetch:", clean);

      // 🔥 precargar HTML
      Onion.fetchHTML(route.page, true).catch(()=>{});

      // 🔥 precargar CSS
      if(route.style){
        const link = document.createElement("link");
        link.rel = "prefetch";
        link.href = route.style;
        document.head.appendChild(link);
      }

      // 🔥 precargar JS
      if(route.script){
        const script = document.createElement("link");
        script.rel = "prefetch";
        script.href = route.script;
        document.head.appendChild(script);
      }

    }catch(e){
      Onion.error("💥 Prefetch error:", e);
    }

  };

  /* =========================
     HOVER PREFETCH
  ========================= */

  function handleHover(e){

    let el = e.target;

    while(el && el !== document){

      if(el.tagName === "A" && el.hasAttribute("data-link")){

        const href = el.getAttribute("href");

        if(!href) return;

        // 🔥 ignorar externos
        if(
          href.startsWith("http") ||
          href.startsWith("mailto:") ||
          href.startsWith("tel:")
        ){
          return;
        }

        Onion.prefetch(href);

        return;
      }

      el = el.parentNode;
    }

  }

  document.addEventListener("mouseover", handleHover);

  /* =========================
     TOUCH PREFETCH (MÓVIL)
  ========================= */

  document.addEventListener("touchstart", function(e){

    let el = e.target;

    while(el && el !== document){

      if(el.tagName === "A" && el.hasAttribute("data-link")){
        const href = el.getAttribute("href");
        Onion.prefetch(href);
        return;
      }

      el = el.parentNode;
    }

  }, { passive: true });

})();

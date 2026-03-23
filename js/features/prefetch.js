"use strict";

/* =========================
   PREFETCH (ONION PRO FIXED)
   - Seguro
   - No invade render
   - Sin duplicación
========================= */

(function(){

  if(!window.Onion){
    console.error("💥 Onion no está definido (prefetch.js)");
    return;
  }

  const Onion = window.Onion;

  const prefetched = new Set();

  /* =========================
     NORMALIZE PATH
  ========================= */

  function normalizePath(path){

    if(!path) return null;

    let clean = path;

    if(!clean.startsWith("/")){
      clean = "/" + clean;
    }

    clean = clean.replace(/\/+/g, "/");

    if(clean.startsWith("/@")){
      const parts = clean.split("/").slice(2);
      clean = "/" + (parts.join("/") || "");
    }

    if(clean.length > 1 && clean.endsWith("/")){
      clean = clean.slice(0, -1);
    }

    return clean || "/";
  }

  /* =========================
     PREFETCH CORE
  ========================= */

  Onion.prefetch = function(path){

    try{

      const clean = normalizePath(path);
      if(!clean) return;

      if(prefetched.has(clean)) return;

      const route = Onion.routes[clean];
      if(!route) return;

      prefetched.add(clean);

      /* =========================
         HTML (LIGHT PREFETCH)
      ========================= */

      if(route.page){
        fetch(route.page, { credentials: "include" }).catch(()=>{});
      }

      /* =========================
         CSS
      ========================= */

      if(route.style){

        const exists = document.querySelector(
          `link[href^="${route.style}"]`
        );

        if(!exists){

          const link = document.createElement("link");
          link.rel = "prefetch";
          link.as = "style";
          link.href = route.style;

          document.head.appendChild(link);

        }

      }

      /* =========================
         JS
      ========================= */

      if(route.script){

        const exists = document.querySelector(
          `link[href^="${route.script}"]`
        );

        if(!exists){

          const link = document.createElement("link");
          link.rel = "prefetch";
          link.as = "script";
          link.href = route.script;

          document.head.appendChild(link);

        }

      }

    }catch(e){
      Onion.error?.("💥 Prefetch error:", e);
    }

  };

  /* =========================
     EVENTS (SAFE)
  ========================= */

  if(!window.__ONION_PREFETCH_BOUND__){

    window.__ONION_PREFETCH_BOUND__ = true;

    document.addEventListener("mouseover", function(e){

      const link = e.target.closest("a[data-spa]");
      if(!link) return;

      const href = link.getAttribute("href");
      if(!href) return;

      if(
        href.startsWith("http") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:")
      ){
        return;
      }

      Onion.prefetch(href);

    });

    document.addEventListener("touchstart", function(e){

      const link = e.target.closest("a[data-spa]");
      if(!link) return;

      const href = link.getAttribute("href");
      if(!href) return;

      Onion.prefetch(href);

    }, { passive: true });

  }

})();

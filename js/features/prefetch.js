"use strict";

/* =========================================================
   🧅 PREFETCH — FULL PRO (CONTROLADO, SIN FUGAS, EFICIENTE)
========================================================= */

(function(){

  if(!window.Onion){
    console.error("💥 Onion no está definido (prefetch.js)");
    return;
  }

  const Onion = window.Onion;

  /* =========================================================
     STATE PRIVADO
  ========================================================= */

  const prefetched = new Set();
  const MAX_PREFETCH = 50; // 🔥 límite anti-memoria

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
     ADD LINK SAFE
  ========================= */

  function addLink(rel, as, href){

    if(!href) return;

    if(document.querySelector(`link[href="${href}"]`)) return;

    const link = document.createElement("link");
    link.rel = rel;
    link.as = as;
    link.href = href;

    document.head.appendChild(link);
  }

  /* =========================
     PREFETCH
  ========================= */

  Onion.prefetch = function(path){

    try{

      if(!Onion.routes) return;

      const clean = normalizePath(path);
      if(!clean) return;

      if(prefetched.has(clean)) return;

      const route = Onion.routes[clean];
      if(!route) return;

      /* 🔥 control memoria */
      if(prefetched.size >= MAX_PREFETCH){
        prefetched.clear();
      }

      prefetched.add(clean);

      /* =========================
         HTML
      ========================= */

      if(route.page){
        fetch(route.page, { credentials: "include" }).catch(()=>{});
      }

      /* =========================
         CSS
      ========================= */

      if(route.style){

        const styles = Array.isArray(route.style)
          ? route.style
          : [route.style];

        styles.forEach(href=>{
          addLink("preload", "style", href);
        });

      }

      /* =========================
         JS
      ========================= */

      if(route.script){

        const scripts = Array.isArray(route.script)
          ? route.script
          : [route.script];

        scripts.forEach(src=>{
          addLink("preload", "script", src);
        });

      }

    }catch(e){
      console.error("💥 Prefetch error:", e);
    }

  };

  /* =========================
     EVENTOS (UNA SOLA VEZ)
  ========================= */

  if(!window.__ONION_PREFETCH_BOUND__){

    window.__ONION_PREFETCH_BOUND__ = true;

    const handler = function(e){

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
    };

    document.addEventListener("mouseover", handler);
    document.addEventListener("touchstart", handler, { passive: true });

  }

  /* =========================
     DEBUG
  ========================= */

  if(Onion.config?.DEBUG){
    Onion.log("⚡ Prefetch system PRO ready");
  }

})();

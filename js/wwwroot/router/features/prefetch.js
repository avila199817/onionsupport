"use strict";

/* =========================================================
   🧅 PREFETCH — GOD MODE (VIEW SAFE · ZERO INTERFERENCE · SMART CACHE)
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
  const MAX_PREFETCH = 50;

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

  function addLink(rel, href){

    if(!href) return;

    const existing = document.querySelector(`link[href="${href}"][rel="${rel}"]`);
    if(existing) return;

    const link = document.createElement("link");
    link.rel = rel;
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

      if(prefetched.size >= MAX_PREFETCH){
        prefetched.clear();
      }

      prefetched.add(clean);

      /* =========================
         HTML (FRONTEND)
      ========================= */

      if(route.page){
        fetch(route.page, {
          credentials: "include"
        }).catch(()=>{});
      }

      /* =========================
         CSS
      ========================= */

      if(route.style){

        const styles = Array.isArray(route.style)
          ? route.style
          : [route.style];

        styles.forEach(href=>{
          addLink("prefetch", href);
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
          addLink("prefetch", src);
        });

      }

    }catch(e){
      console.error("💥 Prefetch error:", e);
    }

  };

  /* =========================
     EVENTS (CORE — NO CLEANUP)
  ========================= */

  if(!window.__ONION_PREFETCH_BOUND__){

    window.__ONION_PREFETCH_BOUND__ = true;

    let last = 0;

    const handler = function(e){

      const now = performance.now();
      if(now - last < 80) return;
      last = now;

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

      if(document.visibilityState !== "visible") return;

      Onion.prefetch(href);
    };

    document.addEventListener("mouseover", handler);
    document.addEventListener("touchstart", handler, { passive: true });

  }

  /* =========================
     DEBUG
  ========================= */

  if(Onion.config?.DEBUG){
    Onion.log("⚡ Prefetch GOD MODE ready");
  }

})();

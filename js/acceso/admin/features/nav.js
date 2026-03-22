"use strict";

/* =========================
   NAV (PRO SaaS - ONION)
========================= */

(function(){

  if(!window.Onion){
    console.error("💥 Onion no está definido (nav.js)");
    return;
  }

  const Onion = window.Onion;

  /* =========================
     NAV CORE
  ========================= */

  Onion.go = function(path){

    try{

      if(!path){
        Onion.warn("NAV sin path");
        return;
      }

      if(!Onion.state.slug){
        Onion.warn("No slug yet");
        return;
      }

      // 🔥 NORMALIZE PATH
      let clean = path.startsWith("/") ? path : "/" + path;

      clean = clean.replace(/\/+/g, "/");

      if(clean.length > 1 && clean.endsWith("/")){
        clean = clean.slice(0, -1);
      }

      const current = Onion.router?.get?.() || "/";

      // 🔥 AVOID USELESS NAV
      if(current === clean){
        Onion.log("🔁 Ya estás en esta ruta:", clean);
        return;
      }

      // 🔥 LOCK NAVIGATION
      if(Onion.state.navigating || Onion.state.rendering){
        Onion.warn("⛔ Navegación bloqueada (estado activo)");
        return;
      }

      Onion.state.navigating = true;

      Onion.log("🚀 NAV →", clean);

      /* =========================
         UI CLOSE
      ========================= */

      Onion.events.emit("nav:search:close");

      /* =========================
         CLEANUP (CRÍTICO)
      ========================= */

      if(typeof Onion.runCleanup === "function"){
        Onion.runCleanup();
      }

      Onion.events.emit("nav:cleanup");

      /* =========================
         BUILD URL
      ========================= */

      const url = "/@" + Onion.state.slug + clean;

      const currentUrl = window.location.pathname + window.location.search;

      if(currentUrl !== url){
        window.history.pushState({}, "", url);
      }

      /* =========================
         NAV STATE
      ========================= */

      Onion.state.lastRoute = clean;
      Onion.state.lastNavAt = Date.now();

      /* =========================
         RENDER TRIGGER
      ========================= */

      Onion.events.emit("nav:change", {
        path: clean
      });

    }catch(e){

      Onion.error("💥 NAV ERROR:", e);

      Onion.state.navigating = false;

    }

  };

  /* =========================
     LINK INTERCEPTOR (SPA)
  ========================= */

  document.addEventListener("click", function(e){

    try{

      let el = e.target;

      while(el && el !== document){

        if(el.tagName === "A" && el.hasAttribute("data-link")){

          const href = el.getAttribute("href");

          if(!href){
            Onion.warn("Link sin href");
            return;
          }

          // 🔥 EXTERNAL LINKS → IGNORE
          if(
            href.startsWith("http") ||
            href.startsWith("mailto:") ||
            href.startsWith("tel:")
          ){
            return;
          }

          // 🔥 NEW TAB / MODIFIERS → IGNORE
          if(e.ctrlKey || e.metaKey || e.shiftKey || el.target === "_blank"){
            return;
          }

          // 🔥 BLOCK IF BUSY
          if(Onion.state.navigating || Onion.state.rendering){
            Onion.warn("⛔ Click bloqueado (estado activo)");
            e.preventDefault();
            return;
          }

          e.preventDefault();

          Onion.log("🔗 Link click:", href);

          Onion.go(href);

          return;
        }

        el = el.parentNode;
      }

    }catch(err){
      Onion.error("💥 LINKS ERROR:", err);
    }

  });

  /* =========================
     POPSTATE (BACK/FORWARD)
  ========================= */

  window.addEventListener("popstate", function(){

    try{

      if(Onion.state.navigating || Onion.state.rendering){
        Onion.warn("⛔ popstate bloqueado");
        return;
      }

      Onion.log("↩️ POPSTATE");

      Onion.events.emit("nav:change", {
        pop: true
      });

    }catch(e){
      Onion.error("💥 POPSTATE ERROR:", e);
    }

  });

})();

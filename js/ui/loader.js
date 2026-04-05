"use strict";

/* =========================================================
   🧅 LOADER — FULL PRO SAAS (FIXED · NO DESYNC · NO FLICKER REAL)
========================================================= */

(function(){

  if(!window.Onion){
    console.error("💥 Onion no está definido (loader.js)");
    return;
  }

  const Onion = window.Onion;

  let active = false;
  let showTimeout = null;
  let forceHideTimeout = null;
  let lock = 0; // 🔥 evita hide prematuro

  const MIN_SHOW_DELAY = 120;
  const MAX_DURATION = 8000;

  Onion.ui = Onion.ui || {};

  /* =========================
     SHOW
  ========================= */

  Onion.ui.showLoader = function(){

    lock++; // 🔥 cada show incrementa lock

    if(active) return;

    active = true;

    clearTimeout(showTimeout);
    clearTimeout(forceHideTimeout);

    showTimeout = setTimeout(()=>{
      document.body.classList.add("loading");
    }, MIN_SHOW_DELAY);

    forceHideTimeout = setTimeout(()=>{
      Onion.warn("Loader forzado a cerrar (failsafe)");
      Onion.ui.hideLoader(true);
    }, MAX_DURATION);

  };

  /* =========================
     HIDE
  ========================= */

  Onion.ui.hideLoader = function(force = false){

    if(!force){

      // 🔥 solo cerramos si no hay locks pendientes
      lock = Math.max(lock - 1, 0);
      if(lock > 0) return;

    }else{
      lock = 0;
    }

    if(!active && !force) return;

    clearTimeout(showTimeout);
    clearTimeout(forceHideTimeout);

    requestAnimationFrame(()=>{
      requestAnimationFrame(()=>{
        document.body.classList.remove("loading");
        active = false;
      });
    });

  };

  /* =========================
     SYNC CON EVENTS
  ========================= */

  Onion.events?.on?.("route:start", ()=>{
    Onion.ui.showLoader();
  });

  Onion.events?.on?.("route:end", ()=>{
    Onion.ui.hideLoader();
  });

  /* =========================
     DEBUG
  ========================= */

  if(Onion.config?.DEBUG){
    Onion.log("⏳ Loader system PRO ready");
  }

})();

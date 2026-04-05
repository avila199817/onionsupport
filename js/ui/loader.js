"use strict";

/* =========================================================
   🧅 LOADER — FULL PRO SAAS (FIABLE · SIN FLICKER · ANTI-RACE)
========================================================= */

(function(){

  if(!window.Onion){
    console.error("💥 Onion no está definido (loader.js)");
    return;
  }

  const Onion = window.Onion;

  let active = false;
  let forceHideTimeout = null;

  const MAX_DURATION = 8000;

  Onion.ui = Onion.ui || {};

  /* =========================
     SHOW (INMEDIATO Y SEGURO)
  ========================= */

  Onion.ui.showLoader = function(){

    if(active) return;

    active = true;

    clearTimeout(forceHideTimeout);

    // 🔥 aparece SIEMPRE (sin delays)
    document.body.classList.add("loading");

    // failsafe por si algo rompe el flujo
    forceHideTimeout = setTimeout(()=>{
      Onion.warn?.("⚠️ Loader forzado a cerrar (failsafe)");
      Onion.ui.hideLoader(true);
    }, MAX_DURATION);

  };

  /* =========================
     HIDE (SUAVE Y SIN CORTES)
  ========================= */

  Onion.ui.hideLoader = function(force = false){

    if(!active && !force) return;

    clearTimeout(forceHideTimeout);

    // 🔥 aseguramos que el render ya terminó
    requestAnimationFrame(()=>{
      requestAnimationFrame(()=>{
        document.body.classList.remove("loading");
        active = false;
      });
    });

  };

  /* =========================
     EVENTS SYNC (DOBLE SISTEMA)
  ========================= */

  // sistema moderno
  if(Onion.events?.on){
    Onion.events.on("route:start", Onion.ui.showLoader);
    Onion.events.on("route:end", Onion.ui.hideLoader);
  }

  // fallback legacy (por si algo no dispara events)
  document.addEventListener("onion:route:start", Onion.ui.showLoader);
  document.addEventListener("onion:route:end", Onion.ui.hideLoader);

  /* =========================
     DEBUG
  ========================= */

  if(Onion.config?.DEBUG){
    Onion.log?.("⏳ Loader PRO ready");
  }

})();

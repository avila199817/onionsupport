"use strict";

/* =========================================================
   🧅 CLEANUP — GOD MODE (VIEW-ONLY · CORE SAFE · ZERO BREAKS)
========================================================= */

(function(){

  if(!window.Onion){
    console.error("💥 Onion no está definido (cleanup.js)");
    return;
  }

  const Onion = window.Onion;

  /* =========================================================
     STATE BASE
  ========================================================= */

  if(!Onion.state){
    Onion.state = {};
  }

  if(!Array.isArray(Onion.state.cleanup)){
    Onion.state.cleanup = [];
  }

  if(!Array.isArray(Onion.state.globalEvents)){
    Onion.state.globalEvents = [];
  }

  /* =========================================================
     CORE vs VIEW SEPARATION 🔥
  ========================================================= */

  // 🔴 VIEW cleanup (se limpia en cada render)
  Onion.onCleanup = function(fn){

    if(typeof fn !== "function") return;

    Onion.state.cleanup.push(fn);

  };

  // 🔥 evento ligado a VIEW (se elimina en cleanup)
  Onion.cleanupEvent = function(target, type, handler, options){

    if(!target || !type || !handler) return;

    target.addEventListener(type, handler, options);

    Onion.state.cleanup.push(()=>{
      try{
        target.removeEventListener(type, handler, options);
      }catch{}
    });

  };

  /* =========================================================
     GLOBAL EVENTS (CORE — NO SE TOCAN)
  ========================================================= */

  Onion.onGlobalEvent = function(target, type, handler, options){

    if(!target || !type || !handler) return;

    target.addEventListener(type, handler, options);

    Onion.state.globalEvents.push({
      target,
      type,
      handler,
      options
    });

  };

  /* =========================================================
     RUN CLEANUP (SOLO VIEW)
  ========================================================= */

  Onion.runCleanup = function(){

    const list = Onion.state.cleanup;

    if(!list || !list.length) return;

    for(let i = list.length - 1; i >= 0; i--){
      try{
        list[i]();
      }catch(e){
        console.warn("⚠️ Cleanup error:", e);
      }
    }

    Onion.state.cleanup.length = 0;

  };

  /* =========================================================
     ALIAS
  ========================================================= */

  Onion.cleanupAll = function(){
    return Onion.runCleanup();
  };

  /* =========================================================
     DEBUG
  ========================================================= */

  if(Onion.config?.DEBUG){
    Onion.log("🧹 Cleanup GOD MODE ready (CORE SAFE)");
  }

})();

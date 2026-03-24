"use strict";

/* =========================
   CLEANUP (ONION CORE CLEAN)
========================= */

(function(){

  if(!window.Onion){
    console.error("💥 Onion no está definido (cleanup.js)");
    return;
  }

  const Onion = window.Onion;

  Onion.state = Onion.state || {};

  /* =========================
     STORAGE
  ========================= */

  if(!Array.isArray(Onion.state.cleanup)){
    Onion.state.cleanup = [];
  }

  if(!Array.isArray(Onion.state.globalEvents)){
    Onion.state.globalEvents = [];
  }

  /* =========================
     CORE CLEANUP
  ========================= */

  Onion.onCleanup = function(fn){
    if(typeof fn !== "function") return;
    Onion.state.cleanup.push(fn);
  };

  Onion.runCleanup = function(){

    const list = Onion.state.cleanup;

    if(Array.isArray(list)){
      for(const fn of list){
        try{ fn(); }
        catch(e){ Onion.error?.("Cleanup error:", e); }
      }
    }

    Onion.state.cleanup = [];

    // 🔥 limpiar eventos registrados
    if(Array.isArray(Onion.state.globalEvents)){

      for(const ev of Onion.state.globalEvents){
        try{
          ev.target.removeEventListener(ev.name, ev.handler, ev.options);
        }catch{}
      }

      Onion.state.globalEvents = [];

    }

  };

  /* =========================
     HELPERS
  ========================= */

  Onion.cleanupInterval = function(id){
    if(!id) return;
    Onion.onCleanup(()=> clearInterval(id));
  };

  Onion.cleanupTimeout = function(id){
    if(!id) return;
    Onion.onCleanup(()=> clearTimeout(id));
  };

  Onion.cleanupRAF = function(id){
    if(!id) return;
    Onion.onCleanup(()=> cancelAnimationFrame(id));
  };

  Onion.cleanupObserver = function(observer){
    if(!observer) return;
    Onion.onCleanup(()=> observer.disconnect());
  };

  /* =========================
     EVENTOS
  ========================= */

  Onion.cleanupEvent = function(target, name, handler, options){

    if(!target || !name || !handler) return;

    target.addEventListener(name, handler, options);

    // registrar para limpieza
    const ref = { target, name, handler, options };
    Onion.state.globalEvents.push(ref);

    Onion.onCleanup(()=>{
      try{
        target.removeEventListener(name, handler, options);
      }catch{}
    });

  };

  /* =========================
     CLEAN ALL
  ========================= */

  Onion.cleanupAll = function(){
    Onion.runCleanup();
  };

})();

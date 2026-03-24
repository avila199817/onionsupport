"use strict";

/* =========================
   CLEANUP (ONION PRO FIXED)
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
        catch(e){ console.error("Cleanup error:", e); }
      }
    }

    Onion.state.cleanup = [];

    // 🔥 limpiar eventos globales también
    if(Array.isArray(Onion.state.globalEvents)){

      for(const ev of Onion.state.globalEvents){
        try{
          ev.target.removeEventListener(ev.name, ev.handler, ev.options);
        }catch(e){}
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
     EVENTOS (🔥 FIX REAL)
  ========================= */

  Onion.cleanupEvent = function(target, name, handler, options){

    if(!target || !name || !handler) return;

    target.addEventListener(name, handler, options);

    // guardar para cleanup total
    Onion.state.globalEvents.push({
      target,
      name,
      handler,
      options
    });

    Onion.onCleanup(()=>{
      target.removeEventListener(name, handler, options);
    });

  };

  /* =========================
     GLOBAL EVENT (🔥 NUEVO)
  ========================= */

  Onion.onGlobalEvent = function(target, name, handler, options){

    if(!target || !name || !handler) return;

    target.addEventListener(name, handler, options);

    Onion.state.globalEvents.push({
      target,
      name,
      handler,
      options
    });

  };

  /* =========================
     CLEAN ALL
  ========================= */

  Onion.cleanupAll = function(){
    Onion.runCleanup();
  };

})();

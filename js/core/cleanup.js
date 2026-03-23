"use strict";

/* =========================
   CLEANUP (ONION LIFECYCLE CORE PRO)
   - Sin duplicados (Set)
   - Seguro contra loops
   - No rompe global UI
========================= */

(function(){

  if(!window.Onion){
    console.error("💥 Onion no está definido (cleanup.js)");
    return;
  }

  const Onion = window.Onion;

  // 🔥 asegurar estructura
  if(!Onion.state){
    Onion.state = {};
  }

  if(!Onion.state.cleanup){
    Onion.state.cleanup = new Set();
  }

  /* =========================
     REGISTER CLEANUP
  ========================= */

  Onion.onCleanup = function(fn){

    if(typeof fn !== "function"){
      Onion.warn?.("⚠️ cleanup inválido");
      return;
    }

    Onion.state.cleanup.add(fn);

  };

  /* =========================
     RUN CLEANUP (SAFE)
  ========================= */

  Onion.runCleanup = function(){

    const list = Onion.state.cleanup;

    if(!list || list.size === 0){
      Onion.log?.("🧹 cleanup vacío");
      return;
    }

    Onion.log?.("🧹 Ejecutando cleanup:", list.size);

    // 🔥 reset antes de ejecutar (evita loops)
    Onion.state.cleanup = new Set();

    for(const fn of list){

      try{
        fn();
      }catch(e){
        Onion.error?.("💥 cleanup error:", e);
      }

    }

  };

  /* =========================
     INTERVAL / TIMEOUT HELPERS
  ========================= */

  Onion.cleanupInterval = function(id){

    if(!id) return;

    Onion.onCleanup(()=>{
      try{ clearInterval(id); }catch{}
    });

  };

  Onion.cleanupTimeout = function(id){

    if(!id) return;

    Onion.onCleanup(()=>{
      try{ clearTimeout(id); }catch{}
    });

  };

  /* =========================
     EVENT LISTENER CLEANUP
  ========================= */

  Onion.cleanupEvent = function(target, name, handler, options){

    if(!target || !name || !handler) return;

    target.addEventListener(name, handler, options);

    Onion.onCleanup(()=>{
      try{
        target.removeEventListener(name, handler, options);
      }catch{}
    });

  };

  /* =========================
     OBSERVER CLEANUP
  ========================= */

  Onion.cleanupObserver = function(observer){

    if(!observer) return;

    Onion.onCleanup(()=>{
      try{ observer.disconnect(); }catch{}
    });

  };

  /* =========================
     RAF CLEANUP
  ========================= */

  Onion.cleanupRAF = function(id){

    if(!id) return;

    Onion.onCleanup(()=>{
      try{ cancelAnimationFrame(id); }catch{}
    });

  };

  /* =========================
     FULL CLEAR (DEBUG / RESET)
  ========================= */

  Onion.cleanupAll = function(){

    Onion.log?.("🧹 cleanup manual");

    Onion.runCleanup();

  };

})();

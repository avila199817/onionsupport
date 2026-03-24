"use strict";

(function(){

  if(!window.Onion){
    console.error("💥 Onion no está definido (cleanup.js)");
    return;
  }

  const Onion = window.Onion;

  Onion.state = Onion.state || {};

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
    if(typeof fn === "function"){
      Onion.state.cleanup.push(fn);
    }
  };

  Onion.runCleanup = function(){

    // ejecutar funciones
    for(const fn of Onion.state.cleanup){
      try{ fn(); }
      catch(e){ console.error("Cleanup error:", e); }
    }

    Onion.state.cleanup = [];

    // eliminar eventos
    for(const ev of Onion.state.globalEvents){
      try{
        ev.target.removeEventListener(ev.name, ev.handler, ev.options);
      }catch{}
    }

    Onion.state.globalEvents = [];
  };

  /* =========================
     HELPERS
  ========================= */

  Onion.cleanupInterval = id => id && Onion.onCleanup(()=> clearInterval(id));
  Onion.cleanupTimeout = id => id && Onion.onCleanup(()=> clearTimeout(id));
  Onion.cleanupRAF = id => id && Onion.onCleanup(()=> cancelAnimationFrame(id));
  Onion.cleanupObserver = obs => obs && Onion.onCleanup(()=> obs.disconnect());

  /* =========================
     EVENTOS
  ========================= */

  Onion.cleanupEvent = function(target, name, handler, options){

    if(!target || !name || !handler) return;

    target.addEventListener(name, handler, options);

    Onion.state.globalEvents.push({
      target, name, handler, options
    });

  };

  /* =========================
     CLEAN ALL
  ========================= */

  Onion.cleanupAll = function(){
    Onion.runCleanup();
  };

})();

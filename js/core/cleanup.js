"use strict";

/* =========================
   CLEANUP (ONION PRO FINAL CLEAN)
========================= */

(function(){

  if(!window.Onion){
    console.error("💥 Onion no está definido (cleanup.js)");
    return;
  }

  const Onion = window.Onion;

  // 🔥 asegurar state SIEMPRE
  Onion.state = Onion.state || {};

  /* =========================
     BASE
  ========================= */

  if(!Array.isArray(Onion.state.cleanup)){
    Onion.state.cleanup = [];
  }

  if(typeof Onion.onCleanup !== "function"){

    Onion.onCleanup = function(fn){

      if(typeof fn !== "function") return;

      if(!Array.isArray(Onion.state.cleanup)){
        Onion.state.cleanup = [];
      }

      if(Onion.state.cleanup.includes(fn)) return;

      Onion.state.cleanup.push(fn);

    };

  }

  if(typeof Onion.runCleanup !== "function"){

    Onion.runCleanup = function(){

      const list = Onion.state.cleanup;

      if(!Array.isArray(list) || list.length === 0){
        return;
      }

      Onion.state.cleanup = [];

      for(let i = 0; i < list.length; i++){
        try{
          list[i]();
        }catch(e){
          Onion.error?.("Cleanup error:", e);
        }
      }

    };

  }

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

  Onion.cleanupEvent = function(target, name, handler, options){

    if(!target || !name || !handler) return;

    target.addEventListener(name, handler, options);

    Onion.onCleanup(()=>{
      target.removeEventListener(name, handler, options);
    });

  };

  Onion.cleanupObserver = function(observer){
    if(!observer) return;
    Onion.onCleanup(()=> observer.disconnect());
  };

  Onion.cleanupRAF = function(id){
    if(!id) return;
    Onion.onCleanup(()=> cancelAnimationFrame(id));
  };

  Onion.cleanupAll = function(){
    Onion.runCleanup();
  };

})();

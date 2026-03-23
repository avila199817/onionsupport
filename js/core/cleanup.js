"use strict";

/* =========================
   CLEANUP (ONION PRO FINAL)
   - Compatible con core.js
   - Sin duplicados
   - Sin conflictos
========================= */

(function(){

  if(!window.Onion){
    console.error("💥 Onion no está definido (cleanup.js)");
    return;
  }

  const Onion = window.Onion;

  // 🔥 asegurar estructura correcta (ARRAY)
  if(!Array.isArray(Onion.state.cleanup)){
    Onion.state.cleanup = [];
  }

  /* =========================
     REGISTER CLEANUP
  ========================= */

  Onion.onCleanup = function(fn){

    if(typeof fn !== "function"){
      Onion.warn?.("⚠️ cleanup inválido");
      return;
    }

    // evitar duplicados
    if(Onion.state.cleanup.includes(fn)){
      return;
    }

    Onion.state.cleanup.push(fn);

  };

  /* =========================
     RUN CLEANUP
  ========================= */

  Onion.runCleanup = function(){

    const list = Onion.state.cleanup;

    if(!list || list.length === 0){
      Onion.log?.("🧹 cleanup vacío");
      return;
    }

    Onion.log?.("🧹 Ejecutando cleanup:", list.length);

    // reset antes de ejecutar
    Onion.state.cleanup = [];

    for(let i = 0; i < list.length; i++){

      try{
        list[i]();
      }catch(e){
        Onion.error?.("💥 cleanup error:", e);
      }

    }

  };

  /* =========================
     HELPERS
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

  Onion.cleanupEvent = function(target, name, handler, options){

    if(!target || !name || !handler) return;

    target.addEventListener(name, handler, options);

    Onion.onCleanup(()=>{
      try{
        target.removeEventListener(name, handler, options);
      }catch{}
    });

  };

  Onion.cleanupObserver = function(observer){

    if(!observer) return;

    Onion.onCleanup(()=>{
      try{ observer.disconnect(); }catch{}
    });

  };

  Onion.cleanupRAF = function(id){

    if(!id) return;

    Onion.onCleanup(()=>{
      try{ cancelAnimationFrame(id); }catch{}
    });

  };

  Onion.cleanupAll = function(){

    Onion.log?.("🧹 cleanup manual");

    Onion.runCleanup();

  };

})();

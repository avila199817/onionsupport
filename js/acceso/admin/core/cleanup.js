"use strict";

/* =========================
   CLEANUP (LIFECYCLE CORE)
========================= */

(function(){

  if(!window.Onion){
    console.error("💥 Onion no está definido (cleanup.js)");
    return;
  }

  const Onion = window.Onion;

  /* =========================
     REGISTER CLEANUP
  ========================= */

  Onion.onCleanup = function(fn){

    if(typeof fn !== "function"){
      Onion.warn("cleanup inválido");
      return;
    }

    Onion.state.cleanup.push(fn);

  };

  /* =========================
     RUN CLEANUP (SAFE + ISOLATED)
  ========================= */

  Onion.runCleanup = function(){

    const list = Onion.state.cleanup;

    if(!list || list.length === 0){
      Onion.log("🧹 cleanup vacío");
      return;
    }

    Onion.log("🧹 Ejecutando cleanup:", list.length);

    // 🔥 vaciar primero para evitar loops/reentradas
    Onion.state.cleanup = [];

    for(let i = 0; i < list.length; i++){

      const fn = list[i];

      try{
        fn();
      }catch(e){
        Onion.error("💥 cleanup fn error:", e);
      }

    }

  };

  /* =========================
     OPTIONAL HELPERS (PRO)
  ========================= */

  // 🔥 limpiar interval automáticamente
  Onion.cleanupInterval = function(id){
    if(!id) return;
    Onion.onCleanup(()=> clearInterval(id));
  };

  // 🔥 limpiar timeout automáticamente
  Onion.cleanupTimeout = function(id){
    if(!id) return;
    Onion.onCleanup(()=> clearTimeout(id));
  };

  // 🔥 limpiar eventListener manual (por si no usas Onion.events)
  Onion.cleanupEvent = function(target, name, handler){
    if(!target || !name || !handler) return;

    target.addEventListener(name, handler);

    Onion.onCleanup(()=>{
      target.removeEventListener(name, handler);
    });
  };

})();

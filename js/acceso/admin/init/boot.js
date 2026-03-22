"use strict";

/* =========================
   BOOT (ONION CORE START)
========================= */

(function(){

  /* =========================
     SAFE INIT CALL
  ========================= */

  function start(){

    try{

      if(!window.Onion){
        console.error("💥 Onion no encontrado en BOOT");
        return;
      }

      const Onion = window.Onion;

      if(typeof Onion.init !== "function"){
        console.error("💥 Onion.init no disponible");
        return;
      }

      // 🔥 evitar doble init
      if(Onion.__booted){
        Onion.warn("⚠️ Onion ya arrancado");
        return;
      }

      Onion.__booted = true;

      Onion.log("🧅 BOOT START");

      Onion.init();

    }catch(e){

      console.error("💥 BOOT ERROR:", e);

    }

  }

  /* =========================
     DOM READY (ROBUSTO)
  ========================= */

  if(document.readyState === "loading"){

    document.addEventListener("DOMContentLoaded", start, {
      once: true
    });

  } else {

    // 🔥 ya cargado → ejecuta directo pero en microtask
    Promise.resolve().then(start);

  }

})();

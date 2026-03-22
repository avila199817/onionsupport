"use strict";

/* =========================
   EVENTS (GLOBAL BUS PRO)
========================= */

(function(){

  if(!window.Onion){
    console.error("💥 Onion no está definido (events.js)");
    return;
  }

  const Onion = window.Onion;

  /* =========================
     EVENTS OBJECT
  ========================= */

  Onion.events = {

    /* =========================
       EMIT
    ========================= */

    emit(name, detail = {}){

      try{

        if(!name){
          Onion.warn("Evento sin nombre");
          return;
        }

        const event = new CustomEvent(name, { detail });

        window.dispatchEvent(event);

        Onion.log("📡 emit:", name, detail);

      }catch(e){
        Onion.error("emit error:", name, e);
      }

    },

    /* =========================
       ON
    ========================= */

    on(name, handler){

      if(!name || typeof handler !== "function"){
        Onion.warn("on inválido:", name);
        return;
      }

      const wrapped = (e) => {
        try{
          handler(e.detail, e);
        }catch(err){
          Onion.error("event handler error:", name, err);
        }
      };

      // 🔥 guardar referencia para OFF
      handler.__onionWrapped = wrapped;

      window.addEventListener(name, wrapped);

      // 🔥 AUTO CLEANUP (si existe el sistema)
      if(typeof Onion.onCleanup === "function"){
        Onion.onCleanup(()=>{
          window.removeEventListener(name, wrapped);
        });
      }

    },

    /* =========================
       OFF
    ========================= */

    off(name, handler){

      if(!name || !handler) return;

      const wrapped = handler.__onionWrapped || handler;

      window.removeEventListener(name, wrapped);

    }

  };

})();

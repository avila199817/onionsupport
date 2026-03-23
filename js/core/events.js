"use strict";

/* =========================
   EVENTS (ONION CORE BUS PRO)
========================= */

(function(){

  if(!window.Onion){
    console.error("💥 Onion no definido (events.js)");
    return;
  }

  const Onion = window.Onion;

  // registro interno
  const events = Object.create(null);

  // debug flag (opcional)
  const DEBUG = false;

  /* =========================
     ON (SUBSCRIBE)
  ========================= */

  Onion.events.on = function(name, handler){

    if(!name || typeof handler !== "function") return;

    if(!events[name]){
      events[name] = new Set();
    }

    events[name].add(handler);

    if(DEBUG){
      Onion.log?.("📡 ON:", name, "total:", events[name].size);
    }

    // auto-cleanup SPA
    Onion.onCleanup?.(()=>{
      events[name]?.delete(handler);

      if(events[name]?.size === 0){
        delete events[name];
      }
    });

  };

  /* =========================
     OFF (UNSUBSCRIBE)
  ========================= */

  Onion.events.off = function(name, handler){

    if(!name || !events[name]) return;

    if(handler){
      events[name].delete(handler);

      if(events[name].size === 0){
        delete events[name];
      }

    }else{
      delete events[name];
    }

    if(DEBUG){
      Onion.log?.("🧹 OFF:", name);
    }

  };

  /* =========================
     ONCE (RUN 1 TIME)
  ========================= */

  Onion.events.once = function(name, handler){

    if(!name || typeof handler !== "function") return;

    const wrapper = function(...args){
      try{
        handler(...args);
      }catch(e){
        Onion.error?.("💥 Event once error:", name, e);
      }finally{
        Onion.events.off(name, wrapper);
      }
    };

    Onion.events.on(name, wrapper);

  };

  /* =========================
     EMIT (TRIGGER)
  ========================= */

  Onion.events.emit = function(name, payload){

    if(!name || !events[name]) return;

    if(DEBUG){
      Onion.log?.("🚀 EMIT:", name, payload);
    }

    // copiar handlers (evita problemas si se modifica durante iteración)
    const handlers = Array.from(events[name]);

    for(const handler of handlers){
      try{
        handler(payload);
      }catch(e){
        Onion.error?.("💥 Event error:", name, e);
      }
    }

  };

  /* =========================
     CLEAR ALL (DEBUG)
  ========================= */

  Onion.events.clear = function(){

    Object.keys(events).forEach(k=>{
      delete events[k];
    });

    Onion.log?.("🧹 Events limpiados");

  };

})();

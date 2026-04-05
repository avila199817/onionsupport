"use strict";

/* =========================================================
   🧅 EVENTS BUS — GOD MODE (CORE VS VIEW · NO LEAKS · NO BREAKS)
========================================================= */

(function(){

  if(!window.Onion){
    console.error("💥 Onion no definido (events.js)");
    return;
  }

  const Onion = window.Onion;

  /* =========================================================
     STORE PRIVADO
  ========================================================= */

  const events = Object.create(null);

  /* =========================================================
     ON (VIEW — se limpia)
  ========================================================= */

  Onion.events.on = function(name, handler){

    if(!name || typeof handler !== "function") return;

    if(!events[name]){
      events[name] = new Set();
    }

    events[name].add(handler);

    // 🔥 solo eventos de vista se limpian
    Onion.onCleanup?.(()=>{
      events[name]?.delete(handler);
      if(events[name]?.size === 0){
        delete events[name];
      }
    });

  };

  /* =========================================================
     ON CORE (🔥 persistente)
  ========================================================= */

  Onion.events.onCore = function(name, handler){

    if(!name || typeof handler !== "function") return;

    if(!events[name]){
      events[name] = new Set();
    }

    events[name].add(handler);

    // ❌ NO cleanup → persistente
  };

  /* =========================================================
     OFF
  ========================================================= */

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

  };

  /* =========================================================
     ONCE
  ========================================================= */

  Onion.events.once = function(name, handler){

    if(!name || typeof handler !== "function") return;

    const wrapper = function(payload){

      try{
        handler(payload);
      }catch(e){
        console.error("💥 Event once error:", name, e);
      }finally{
        Onion.events.off(name, wrapper);
      }

    };

    Onion.events.on(name, wrapper);

  };

  /* =========================================================
     EMIT
  ========================================================= */

  Onion.events.emit = function(name, payload){

    if(!name || !events[name]) return;

    const handlers = Array.from(events[name]);

    for(const handler of handlers){
      try{
        handler(payload);
      }catch(e){
        console.error("💥 Event error:", name, e);
      }
    }

  };

  /* =========================================================
     CLEAR (SOLO VIEW)
  ========================================================= */

  Onion.events.clearView = function(){

    Object.keys(events).forEach(name=>{

      const set = events[name];

      for(const handler of set){
        // 🔥 solo borrar handlers ligados a cleanup
        // (los core sobreviven porque no usan onCleanup)
        try{
          // noop → cleanup ya se encarga
        }catch{}
      }

    });

  };

  /* =========================================================
     CLEAR ALL (DEBUG)
  ========================================================= */

  Onion.events.clearAll = function(){
    Object.keys(events).forEach(k => delete events[k]);
  };

  /* =========================================================
     DEBUG
  ========================================================= */

  if(Onion.config?.DEBUG){
    Onion.log("📡 Events GOD MODE ready");
  }

})();

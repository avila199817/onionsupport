"use strict";

/* =========================
   EVENTS (ONION CORE BUS)
========================= */

(function(){

  if(!window.Onion){
    console.error("💥 Onion no definido (events.js)");
    return;
  }

  const Onion = window.Onion;

  const events = Object.create(null);

  /* =========================
     ON (SUBSCRIBE)
  ========================= */

  Onion.events.on = function(name, handler){

    if(!name || typeof handler !== "function") return;

    if(!events[name]){
      events[name] = new Set();
    }

    events[name].add(handler);

    // 🔥 auto-cleanup si estás en SPA render
    Onion.onCleanup?.(()=>{
      events[name]?.delete(handler);
    });

  };

  /* =========================
     OFF (UNSUBSCRIBE)
  ========================= */

  Onion.events.off = function(name, handler){

    if(!name || !events[name]) return;

    if(handler){
      events[name].delete(handler);
    }else{
      delete events[name];
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

    events[name].forEach(handler=>{
      try{
        handler(payload);
      }catch(e){
        Onion.error("💥 Event error:", name, e);
      }
    });

  };

  /* =========================
     CLEAR ALL (DEBUG)
  ========================= */

  Onion.events.clear = function(){

    Object.keys(events).forEach(k=>{
      delete events[k];
    });

    Onion.log("🧹 Events limpiados");

  };

})();
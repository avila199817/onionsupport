"use strict";

/* =========================
   EVENTS (ONION CORE BUS PRO+)
========================= */

(function(){

  if(!window.Onion){
    console.error("💥 Onion no definido (events.js)");
    return;
  }

  const Onion = window.Onion;

  const events = Object.create(null);
  const DEBUG = false;

  function safeCleanup(fn){
    if(typeof Onion.onCleanup === "function"){
      Onion.onCleanup(fn);
    }
  }

  /* =========================
     ON
  ========================= */

  Onion.events.on = function(name, handler){

    if(!name || typeof handler !== "function") return;

    if(!events[name]){
      events[name] = new Set();
    }

    if(events[name].has(handler)) return;

    events[name].add(handler);

    if(DEBUG){
      Onion.log?.("📡 ON:", name, "total:", events[name].size);
    }

    // 🔥 SIEMPRE cleanup automático
    safeCleanup(()=>{
      if(events[name]){
        events[name].delete(handler);

        if(events[name].size === 0){
          delete events[name];
        }
      }
    });

  };

  /* =========================
     OFF
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

  };

  /* =========================
     ONCE
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
     EMIT
  ========================= */

  Onion.events.emit = function(name, payload){

    if(!name || !events[name]) return;

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
     CLEAR (🔥 PRO)
  ========================= */

  Onion.events.clear = function(){

    Object.keys(events).forEach(k=>{
      delete events[k];
    });

  };

})();

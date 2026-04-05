"use strict";

/* =========================================================
   🧅 VIEW ENGINE — CORE (LIFECYCLE + SAFE EXECUTION)
========================================================= */

(function(){

if(!window.Onion){
  console.error("💥 Onion no definido (viewEngine)");
  return;
}

const Onion = window.Onion;

/* =========================================================
   INIT DEBUG
========================================================= */

if(Onion.config?.DEBUG){
  Onion.log("🧠 ViewEngine initialized");
}

Onion.createView = function(){

  let destroyed = false;
  let requestId = 0;

  if(Onion.config?.DEBUG){
    Onion.log("🧠 View instance created");
  }

  Onion.onCleanup(()=>{
    destroyed = true;
    requestId++;

    if(Onion.config?.DEBUG){
      Onion.log("🧹 View destroyed (cleanup executed)");
    }
  });

  function isAlive(){
    return !destroyed;
  }

  function nextRequest(){
    requestId++;

    if(Onion.config?.DEBUG){
      Onion.log(`📡 New request -> ${requestId}`);
    }

    return requestId;
  }

  function isCurrent(id){
    const valid = id === requestId && !destroyed;

    if(Onion.config?.DEBUG && !valid){
      Onion.log(`⚠️ Stale request ignored -> ${id}`);
    }

    return valid;
  }

  async function safeFetch(fn){

    const id = nextRequest();

    try{

      const res = await fn();

      if(!isCurrent(id)) return null;

      return res;

    }catch(e){

      if(e.message === "ABORTED"){
        if(Onion.config?.DEBUG){
          Onion.log("⛔ Fetch aborted");
        }
        return null;
      }

      if(!isCurrent(id)) return null;

      if(Onion.config?.DEBUG){
        Onion.log("💥 Fetch error:", e);
      }

      throw e;

    }

  }

  function safeDOM(getter){

    if(!isAlive()){
      if(Onion.config?.DEBUG){
        Onion.log("⚠️ safeDOM blocked (view destroyed)");
      }
      return null;
    }

    const el = getter?.();

    if(!el || !document.body.contains(el)){
      if(Onion.config?.DEBUG){
        Onion.log("⚠️ safeDOM invalid element");
      }
      return null;
    }

    return el;

  }

  return {
    isAlive,
    safeFetch,
    safeDOM
  };

};

/* =========================================================
   GLOBAL READY DEBUG
========================================================= */

if(Onion.config?.DEBUG){
  Onion.log("🚀 ViewEngine GOD MODE ready");
}

})();

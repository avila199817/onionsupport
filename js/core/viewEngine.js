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

Onion.createView = function(){

  let destroyed = false;
  let requestId = 0;

  Onion.onCleanup(()=>{
    destroyed = true;
    requestId++;
  });

  function isAlive(){
    return !destroyed;
  }

  function nextRequest(){
    return ++requestId;
  }

  function isCurrent(id){
    return id === requestId && !destroyed;
  }

  async function safeFetch(fn){

    const id = nextRequest();

    try{

      const res = await fn();

      if(!isCurrent(id)) return null;

      return res;

    }catch(e){

      if(e.message === "ABORTED") return null;

      if(!isCurrent(id)) return null;

      throw e;

    }

  }

  function safeDOM(getter){

    if(!isAlive()) return null;

    const el = getter?.();

    if(!el || !document.body.contains(el)){
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

if(Onion.config?.DEBUG){
  Onion.log("🧠 ViewEngine ready");
}

})();

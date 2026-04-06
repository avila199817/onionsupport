"use strict";

(function(){

  if(!window.Onion){
    console.error("💥 Onion no existe (core/index.js)");
    return;
  }

  const Onion = window.Onion;

  /* =========================================================
     CORE INIT GUARD
  ========================================================= */

  if(Onion.__coreLoaded__){
    return;
  }

  Onion.__coreLoaded__ = true;

  /* =========================================================
     STATE BASE
  ========================================================= */

  Onion.state = Onion.state || {
    renderId: 0,
    rendering: false,
    appReady: false
  };

  /* =========================================================
     LOAD CORE MODULES (YA CARGADOS POR SERVER)
  ========================================================= */

  // Estos scripts YA están cargados por server.js
  // Aquí solo validamos y conectamos

  if(!Onion.runCleanup){
    console.warn("⚠️ cleanup.js no cargado");
  }

  if(!Onion.events){
    console.warn("⚠️ events.js no cargado");
  }

  if(!Onion.createView){
    console.warn("⚠️ viewEngine.js no cargado");
  }

  /* =========================================================
     SAFE HELPERS
  ========================================================= */

  Onion.safe = function(fn){
    try{
      return fn();
    }catch(e){
      console.error("💥 SAFE ERROR:", e);
      return null;
    }
  };

  /* =========================================================
     NEXT FRAME (UTIL GLOBAL)
  ========================================================= */

  Onion.nextFrame = function(){
    return new Promise(res => requestAnimationFrame(()=>requestAnimationFrame(res)));
  };

  /* =========================================================
     DEBUG
  ========================================================= */

  if(Onion.config?.DEBUG){
    Onion.log("🧠 Core index conectado");
  }

})();

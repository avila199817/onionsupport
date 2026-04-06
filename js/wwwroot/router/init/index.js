"use strict";

(function(){

  if(!window.Onion){
    console.error("Onion no existe (init/index)");
    return;
  }

  const Onion = window.Onion;

  // evitar doble ejecución
  if(Onion.__initModuleLoaded__) return;
  Onion.__initModuleLoaded__ = true;

  /* =========================================================
     VALIDAR MÓDULOS
  ========================================================= */

  if(!Onion.init){
    console.warn("⚠️ init.js no cargado");
  }

  if(!Onion.boot){
    console.warn("⚠️ boot.js no cargado");
  }

  /* =========================================================
     READY
  ========================================================= */

  console.log("🚀 Init módulo listo");

})();

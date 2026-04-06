"use strict";

(function(){

  if(!window.Onion){
    console.error("Onion no existe (features/index)");
    return;
  }

  const Onion = window.Onion;

  // evitar doble ejecución
  if(Onion.__featuresLoaded__) return;
  Onion.__featuresLoaded__ = true;

  /* =========================================================
     VALIDAR MÓDULOS
  ========================================================= */

  if(!Onion.fetch){
    console.warn("⚠️ fetch.js no cargado");
  }

  if(!Onion.router){
    console.warn("⚠️ router.js no cargado");
  }

  if(!Onion.render){
    console.warn("⚠️ render.js no cargado");
  }

  if(!Onion.i18n){
    console.warn("⚠️ i18n.js no cargado");
  }

  if(!Onion.auth){
    console.warn("⚠️ auth.js no cargado");
  }

  /* =========================================================
     READY
  ========================================================= */

  console.log("⚙️ Features listo");

})();

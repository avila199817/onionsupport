"use strict";

(function(){

  if(!window.Onion){
    console.error("Onion no existe (ui/index)");
    return;
  }

  const Onion = window.Onion;

  // evitar doble ejecución
  if(Onion.__uiLoaded__) return;
  Onion.__uiLoaded__ = true;

  /* =========================================================
     VALIDAR MÓDULOS UI
  ========================================================= */

  if(!Onion.ui){
    console.warn("⚠️ ui.js no cargado");
  }

  if(!Onion.ui?.showLoader){
    console.warn("⚠️ loader.js no cargado");
  }

  if(!Onion.ui?.toast){
    console.warn("⚠️ toast.js no cargado");
  }

  /* sidebar y topbar pueden no ser obligatorios */
  if(!document.querySelector(".sidebar")){
    console.warn("⚠️ sidebar no detectado en DOM");
  }

  if(!document.querySelector(".topbar")){
    console.warn("⚠️ topbar no detectado en DOM");
  }

  /* =========================================================
     READY
  ========================================================= */

  console.log("🎨 UI listo");

})();

"use strict";

(function(){

  if(!window.Onion){
    console.error("💥 Onion no está definido (loader.js)");
    return;
  }

  const Onion = window.Onion;

  let active = false;
  let forceHideTimeout = null;

  const MAX_DURATION = 8000;

  Onion.ui = Onion.ui || {};

  /* =========================
     SHOW
  ========================= */

  Onion.ui.showLoader = function(){

    if(active) return;

    active = true;

    document.body.classList.add("loading");

    clearTimeout(forceHideTimeout);

    forceHideTimeout = setTimeout(()=>{
      Onion.warn?.("⚠️ Loader forced reset");
      Onion.ui.hideLoader(true);
    }, MAX_DURATION);

  };

  /* =========================
     HIDE
  ========================= */

  Onion.ui.hideLoader = function(force = false){

    if(!active && !force) return;

    clearTimeout(forceHideTimeout);

    requestAnimationFrame(()=>{
      requestAnimationFrame(()=>{
        document.body.classList.remove("loading");
        active = false;
      });
    });

  };

  /* =========================
     DEBUG
  ========================= */

  if(Onion.config?.DEBUG){
    Onion.log("⏳ Loader SIMPLE ready");
  }

})();

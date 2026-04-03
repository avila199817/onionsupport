"use strict";

(function(){

  if(!window.Onion){
    console.error("💥 Onion no está definido (loader.js)");
    return;
  }

  const Onion = window.Onion;

  let timer = null;
  let active = false;

  const DELAY = 120; // 🔥 más rápido y fino

  /* =========================
     SHOW
  ========================= */
  Onion.ui.showLoader = function(){

    if(active || timer) return;

    timer = setTimeout(()=>{

      const el = document.getElementById("app-loader");
      if(!el) return;

      document.body.classList.add("loading");
      active = true;
      timer = null;

    }, DELAY);

  };

  /* =========================
     HIDE
  ========================= */
  Onion.ui.hideLoader = function(){

    if(timer){
      clearTimeout(timer);
      timer = null;
    }

    if(!active) return;

    // 🔥 salida suave
    setTimeout(()=>{
      document.body.classList.remove("loading");
      active = false;
    }, 80);

  };

})();

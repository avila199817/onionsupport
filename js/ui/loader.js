"use strict";

/* =========================
   LOADER (ONION PRO SAFE)
   - Autónomo
   - Tolerante a interferencias externas
========================= */

(function(){

  if(!window.Onion){
    console.error("💥 Onion no está definido (loader.js)");
    return;
  }

  const Onion = window.Onion;

  let timer = null;
  let active = false;

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

    }, 120);

  };

  /* =========================
     HIDE
  ========================= */

  Onion.ui.hideLoader = function(){

    if(timer){
      clearTimeout(timer);
      timer = null;
    }

    // 🔥 aunque otro script ya lo haya quitado, sincronizamos estado
    if(active){
      document.body.classList.remove("loading");
      active = false;
    }else{
      // asegurar coherencia (por si otro script lo quitó)
      if(document.body.classList.contains("loading")){
        document.body.classList.remove("loading");
      }
    }

  };

})();

"use strict";

/* =========================
   LOADER (SOLO FULLSCREEN)
   - Para cargas pesadas
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
     SHOW (SOLO MANUAL)
  ========================= */

  Onion.ui.showLoader = function(){

    if(active || timer) return;

    timer = setTimeout(()=>{

      const el = document.getElementById("app-loader");
      if(!el) return;

      document.body.classList.add("loading");
      active = true;

    }, 200); // pequeño delay anti parpadeo

  };

  /* =========================
     HIDE
  ========================= */

  Onion.ui.hideLoader = function(){

    if(timer){
      clearTimeout(timer);
      timer = null;
    }

    document.body.classList.remove("loading");
    active = false;

  };

})();

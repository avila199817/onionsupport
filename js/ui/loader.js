"use strict";

/* =========================
   LOADER (ONION PRO FIXED)
========================= */

(function(){

  if(!window.Onion){
    console.error("💥 Onion no está definido (loader.js)");
    return;
  }

  const Onion = window.Onion;

  let timer = null;

  /* =========================
     SHOW
  ========================= */

  Onion.ui.showLoader = function(){

    if(timer) return;

    timer = setTimeout(()=>{

      const el = document.getElementById("app-loader");
      if(!el) return;

      document.body.classList.add("loading");

    }, 120);

  };

  /* =========================
     HIDE
  ========================= */

  Onion.ui.hideLoader = function(){

    clearTimeout(timer);
    timer = null;

    document.body.classList.remove("loading");

  };

})();

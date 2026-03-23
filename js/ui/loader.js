"use strict";

/* =========================
   LOADER (ONION PRO SAFE)
   - Con tiempo mínimo (2.5s)
========================= */

(function(){

  if(!window.Onion){
    console.error("💥 Onion no está definido (loader.js)");
    return;
  }

  const Onion = window.Onion;

  let timer = null;
  let active = false;
  let startTime = 0;

  const MIN_TIME = 2500; // 🔥 2.5s

  /* =========================
     SHOW
  ========================= */

  Onion.ui.showLoader = function(){

    if(active || timer) return;

    startTime = Date.now();

    timer = setTimeout(()=>{

      const el = document.getElementById("app-loader");
      if(!el) return;

      document.body.classList.add("loading");
      active = true;

    }, 120);

  };

  /* =========================
     HIDE (CON TIEMPO MÍNIMO)
  ========================= */

  Onion.ui.hideLoader = function(){

    if(timer){
      clearTimeout(timer);
      timer = null;
    }

    const elapsed = Date.now() - startTime;
    const remaining = Math.max(0, MIN_TIME - elapsed);

    setTimeout(()=>{

      document.body.classList.remove("loading");
      active = false;

    }, remaining);

  };

})();

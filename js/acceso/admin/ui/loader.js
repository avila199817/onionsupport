"use strict";

/* =========================
   LOADER (PRO SaaS - ONION)
========================= */

(function(){

  if(!window.Onion){
    console.error("💥 Onion no está definido (loader.js)");
    return;
  }

  const Onion = window.Onion;

  let visible = false;
  let timer = null;

  /* =========================
     SHOW LOADER
  ========================= */

  Onion.ui.showLoader = function(){

    // 🔥 evitar flicker (solo aparece si tarda)
    if(timer) return;

    timer = setTimeout(()=>{

      const el = document.getElementById("app-loader");
      if(!el) return;

      el.classList.remove("hide");
      document.body.classList.add("loading");

      visible = true;

      Onion.log("⏳ Loader show");

    }, 120); // delay anti flicker

  };

  /* =========================
     HIDE LOADER
  ========================= */

  Onion.ui.hideLoader = function(){

    clearTimeout(timer);
    timer = null;

    const el = document.getElementById("app-loader");
    if(!el) return;

    if(!visible){
      // nunca llegó a mostrarse
      document.body.classList.remove("loading");
      return;
    }

    el.classList.add("hide");

    setTimeout(()=>{
      if(el.parentNode){
        el.remove();
      }
    }, 350);

    document.body.classList.remove("loading");

    visible = false;

    Onion.log("✅ Loader hide");

  };

  /* =========================
     AUTO INTEGRATION (SPA)
  ========================= */

  // 🔥 cuando empieza navegación/render
  Onion.events.on("nav:change", ()=>{
    Onion.ui.showLoader();
  });

  // 🔥 cuando termina render
  Onion.events.on("nav:ready", ()=>{
    Onion.ui.hideLoader();
  });

})();

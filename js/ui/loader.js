"use strict";

(function(){

  if(!window.Onion){
    console.error("💥 Onion no está definido (loader.js)");
    return;
  }

  const Onion = window.Onion;

  let active = false;

  /* =========================
     SHOW
  ========================= */
  Onion.ui = Onion.ui || {};

  Onion.ui.showLoader = function(){

    if(active) return;

    active = true;

    document.body.classList.add("loading");

  };

  /* =========================
     HIDE
  ========================= */
  Onion.ui.hideLoader = function(){

    if(!active) return;

    // 🔥 dejamos 2 frames para asegurar render completo
    requestAnimationFrame(()=>{
      requestAnimationFrame(()=>{
        document.body.classList.remove("loading");
        active = false;
      });
    });

  };

  /* =========================
     AUTO HOOK (OPCIONAL PRO)
  ========================= */
  // 👉 si usas eventos del router, puedes disparar esto
  document.addEventListener("onion:route:start", ()=>{
    Onion.ui.showLoader();
  });

  document.addEventListener("onion:route:end", ()=>{
    Onion.ui.hideLoader();
  });

})();

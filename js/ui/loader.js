"use strict";

(function(){

  if(!window.Onion){
    console.error("💥 Onion no está definido (loader.js)");
    return;
  }

  const Onion = window.Onion;

  let active = false;
  let showTimeout = null;
  let forceHideTimeout = null;

  const MIN_SHOW_DELAY = 120;   // evita flicker
  const MAX_DURATION = 8000;    // failsafe brutal

  Onion.ui = Onion.ui || {};

  /* =========================
     SHOW
  ========================= */

  Onion.ui.showLoader = function(){

    if(active) return;

    active = true;

    clearTimeout(showTimeout);
    clearTimeout(forceHideTimeout);

    // 🔥 pequeño delay para evitar parpadeo
    showTimeout = setTimeout(()=>{

      document.body.classList.add("loading");

    }, MIN_SHOW_DELAY);

    // 🔥 failsafe por si algo peta
    forceHideTimeout = setTimeout(()=>{

      console.warn("⚠️ Loader forzado a cerrar (failsafe)");
      Onion.ui.hideLoader(true);

    }, MAX_DURATION);

  };

  /* =========================
     HIDE
  ========================= */

  Onion.ui.hideLoader = function(force = false){

    if(!active && !force) return;

    clearTimeout(showTimeout);
    clearTimeout(forceHideTimeout);

    requestAnimationFrame(()=>{
      requestAnimationFrame(()=>{

        document.body.classList.remove("loading");
        active = false;

      });
    });

  };

  /* =========================
     AUTO HOOK (OPCIONAL)
  ========================= */

  document.addEventListener("onion:route:start", ()=>{
    Onion.ui.showLoader();
  });

  document.addEventListener("onion:route:end", ()=>{
    Onion.ui.hideLoader();
  });

})();

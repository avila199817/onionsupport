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
    console.warn("⚠️ Loader forced reset");
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
   🔥 AUTO HOOK RENDER
========================= */

if(!Onion.__loaderHooked){

  const originalRender = Onion.render;

  Onion.render = async function(){

    try{

      Onion.ui.showLoader(); // 🔥 antes

      await originalRender.apply(this, arguments);

    }catch(e){

      console.error("💥 Render error:", e);

    }finally{

      // 🔥 SIEMPRE se quita
      Onion.ui.hideLoader();

    }

  };

  Onion.__loaderHooked = true;
}

/* =========================
   DEBUG
========================= */

if(Onion.config?.DEBUG){
  console.log("⏳ Loader FINAL PRO READY");
}

})();

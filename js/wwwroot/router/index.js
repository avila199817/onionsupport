"use strict";

(function(){

  const Onion = window.Onion;

  if(!Onion){
    console.error("💥 Onion no disponible (loader)");
    return;
  }

  /* =========================================================
     REGISTROS GLOBALES
  ========================================================= */

  Onion.features = Onion.features || Object.create(null);

  /* =========================================================
     LOAD FEATURES (AUTOMÁTICO)
  ========================================================= */

  function loadFeatures(){

    // 🔥 aquí registras los módulos UNA SOLA VEZ

    try{
      requireFeature("incidencias", "/js/wwwroot/features/incidencias/index.js");
      requireFeature("facturas", "/js/wwwroot/features/facturas/index.js");
    }catch(e){
      console.error("💥 Error cargando features:", e);
    }

  }

  function requireFeature(name, path){

    if(Onion.features[name]) return;

    const script = document.createElement("script");
    script.src = path;
    script.defer = true;

    script.onload = ()=>{
      console.log("🧩 Feature cargada:", name);
    };

    script.onerror = ()=>{
      console.error("💥 Error cargando:", name);
    };

    document.body.appendChild(script);

  }

  /* =========================================================
     INIT
  ========================================================= */

  document.addEventListener("DOMContentLoaded", ()=>{

    loadFeatures();

  });

})();

"use strict";

(function(){

  const Onion = window.Onion;

  if(!Onion){
    console.error("💥 Onion no disponible (features/index.js)");
    return;
  }

  /* =========================================================
     REGISTROS BASE
  ========================================================= */

  Onion.features = Onion.features || Object.create(null);

  /* =========================================================
     🔥 ZONA SAGRADA (AQUÍ SOLO AÑADES SCRIPTS)
  ========================================================= */

  const SCRIPTS = [

    // CORE EXTENSIONS / FEATURES BASE
    "/js/wwwroot/features/auth.js",
    "/js/wwwroot/features/fetch.js",
    "/js/wwwroot/features/i18n.js",
    "/js/wwwroot/features/prefetch.js",
    "/js/wwwroot/features/render.js",
    "/js/wwwroot/features/router.js",
    "/js/wwwroot/features/routers.js"

  ];

  /* =========================================================
     LOADER INTERNO (NO TOCAR)
  ========================================================= */

  const loaded = new Set();

  function loadScript(src){

    if(loaded.has(src)) return Promise.resolve();

    loaded.add(src);

    return new Promise((resolve, reject)=>{

      const s = document.createElement("script");
      s.src = src;
      s.defer = true;

      s.onload = ()=>{
        console.log("🧩 módulo cargado:", src);
        resolve();
      };

      s.onerror = ()=>{
        console.error("💥 error cargando:", src);
        reject(src);
      };

      document.body.appendChild(s);

    });

  }

  /* =========================================================
     CARGA SECUENCIAL (IMPORTANTE 🔥)
  ========================================================= */

  async function loadAll(){

    for(const src of SCRIPTS){
      try{
        await loadScript(src);
      }catch(e){
        console.error("💥 fallo en:", e);
      }
    }

    console.log("🚀 FEATURES CORE READY");

  }

  /* =========================================================
     INIT
  ========================================================= */

  function init(){

    console.log("🧠 features/index.js iniciado");

    loadAll();

  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", init);
  }else{
    init();
  }

})();

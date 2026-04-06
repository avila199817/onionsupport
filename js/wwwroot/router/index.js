"use strict";

(function(){

  const Onion = window.Onion;

  if(!Onion){
    console.error("💥 Onion no disponible (index.js)");
    return;
  }

  /* =========================================================
     REGISTROS BASE
  ========================================================= */

  Onion.features = Onion.features || Object.create(null);

  /* =========================================================
     🔌 LISTA DE SCRIPTS (ESTO ES TU BACKEND)
  ========================================================= */

  const SCRIPTS = [

    // FEATURES
    "/js/wwwroot/features/incidencias/index.js",
    "/js/wwwroot/features/facturas/index.js",

    // UI
    "/js/wwwroot/ui/index.js",

    // USER
    "/js/wwwroot/user/index.js"

  ];

  /* =========================================================
     LOADER
  ========================================================= */

  const loaded = new Set();

  function loadScript(src){

    if(loaded.has(src)) return;
    loaded.add(src);

    return new Promise((resolve, reject)=>{

      const s = document.createElement("script");
      s.src = src;
      s.defer = true;

      s.onload = ()=>{
        console.log("🧩 script cargado:", src);
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

    console.log("🚀 TODOS LOS SCRIPTS LISTOS");

  }

  /* =========================================================
     INIT
  ========================================================= */

  function init(){

    console.log("🔌 Script loader iniciado");

    loadAll();

  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", init);
  }else{
    init();
  }

})();

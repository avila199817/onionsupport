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
     🔥 ZONA SAGRADA (SOLO TOCAS ESTO)
     Añade aquí nuevos scripts y YA FUNCIONA
  ========================================================= */

  const SCRIPTS = [

    // FEATURES
       "/js/wwwroot/router/features/index.js",
    // "/js/wwwroot/features/facturas/index.js",

    // UI
    // "/js/wwwroot/ui/index.js",

    // USER
    // "/js/wwwroot/user/index.js"

    // 👉 AQUÍ AÑADES MÁS:
    // "/js/wwwroot/features/clientes/index.js"

  ];

  /* =========================================================
     LOADER (NO TOCAR)
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
     CARGA CONTROLADA (NO TOCAR)
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
     INIT (NO TOCAR)
  ========================================================= */

  function init(){

    console.log("🔌 Loader iniciado");

    loadAll();

  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", init);
  }else{
    init();
  }

})();

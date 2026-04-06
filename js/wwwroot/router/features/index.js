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
     🔥 ZONA SAGRADA (SOLO FEATURES REALES)
     👉 SOLO módulos de vistas / negocio
  ========================================================= */

  const SCRIPTS = [

    // 🧩 FEATURES REALES (EJEMPLOS)
    //"/js/wwwroot/features/incidencias.js",
    //"/js/wwwroot/features/facturas.js",
    //"/js/wwwroot/features/clientes.js"

    // 👉 AÑADES AQUÍ MÁS:
    // "/js/wwwroot/features/usuarios.js"

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
        console.log("🧩 feature cargada:", src);
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
     CARGA SECUENCIAL
  ========================================================= */

  async function loadAll(){

    for(const src of SCRIPTS){
      try{
        await loadScript(src);
      }catch(e){
        console.error("💥 fallo en:", e);
      }
    }

    console.log("🚀 FEATURES READY");

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

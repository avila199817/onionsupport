"use strict";

(function(){

  const Onion = window.Onion;

  if(!Onion){
    console.error("💥 Onion no disponible (ui/index.js)");
    return;
  }

  /* =========================================================
     🔥 ZONA SAGRADA (AQUÍ SOLO AÑADES SCRIPTS UI)
  ========================================================= */

  const SCRIPTS = [

    // UI CORE
    "/js/wwwroot/router/ui/sidebar.js",
    "/js/wwwroot/router/ui/topbar.js",
    "/js/wwwroot/router/ui/ui.js",
    "/js/wwwroot/router/ui/toast.js",
    "/js/wwwroot/router/ui/loader.js",

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
        console.log("🧩 UI cargado:", src);
        resolve();
      };

      s.onerror = ()=>{
        console.error("💥 UI error:", src);
        reject(src);
      };

      document.body.appendChild(s);

    });

  }

  /* =========================================================
     INIT
  ========================================================= */

  async function init(){

    console.log("🎨 UI INIT");

    for(const src of SCRIPTS){
      try{
        await loadScript(src);
      }catch(e){}
    }

    console.log("🎨 UI READY");

  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", init);
  }else{
    init();
  }

})();

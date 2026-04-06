"use strict";

(function(){

  const Onion = window.Onion;

  if(!Onion){
    console.error("💥 Onion no disponible (pages/index.js)");
    return;
  }

  /* =========================================================
     📦 ZONA SAGRADA (REGISTRO DE PÁGINAS)
  ========================================================= */

  const PAGES = [

    // 🔥 páginas
    "/js/wwwroot/router/pages/routers.js",

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
        console.log("📄 Page cargada:", src);
        resolve();
      };

      s.onerror = ()=>{
        console.error("💥 Page error:", src);
        reject(src);
      };

      document.body.appendChild(s);

    });

  }

  /* =========================================================
     INIT
  ========================================================= */

  async function init(){

    console.log("📦 PAGES INIT");

    for(const src of PAGES){
      try{
        await loadScript(src);
      }catch(e){}
    }

    console.log("📦 PAGES READY");

  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", init);
  }else{
    init();
  }

})();

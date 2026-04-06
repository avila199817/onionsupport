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
  Onion.modules  = Onion.modules  || Object.create(null);

  /* =========================================================
     CONFIG RUTAS BASE
  ========================================================= */

  const BASE = "/js/wwwroot/";

  const MODULES = [
    "features",
    "ui",
    "pages",
    "user",
    "i18n"
  ];

  /* =========================================================
     CARGADOR CORE
  ========================================================= */

  function loadAll(){

    MODULES.forEach(loadModuleFolder);

  }

  /* =========================================================
     CARGAR CARPETA COMPLETA
  ========================================================= */

  function loadModuleFolder(folder){

    // 🔥 IMPORTANTE:
    // aquí defines SOLO carpetas base
    // dentro de ellas deben existir subcarpetas con index.js

    fetchFolderStructure(folder)
      .then(files=>{
        files.forEach(name=>{
          loadScript(`${BASE}${folder}/${name}/index.js`);
        });
      })
      .catch(()=>{
        console.warn("⚠️ No se pudo cargar carpeta:", folder);
      });

  }

  /* =========================================================
     FETCH ESTRUCTURA (SIMULADO / MANUAL FALLBACK)
  ========================================================= */

  async function fetchFolderStructure(folder){

    // 🚨 IMPORTANTE:
    // JS puro NO puede leer carpetas del servidor
    // 👉 así que usamos lista manual fallback

    const MAP = {

      features: [
        "incidencias",
        "facturas"
      ],

      ui: [],
      pages: [],
      user: [],
      i18n: []

    };

    return MAP[folder] || [];

  }

  /* =========================================================
     SCRIPT LOADER (ANTI DUPES)
  ========================================================= */

  const loaded = new Set();

  function loadScript(src){

    if(loaded.has(src)) return;

    loaded.add(src);

    const s = document.createElement("script");
    s.src = src;
    s.defer = true;

    s.onload = ()=>{
      console.log("🧩 módulo cargado:", src);
    };

    s.onerror = ()=>{
      console.error("💥 error cargando:", src);
    };

    document.body.appendChild(s);

  }

  /* =========================================================
     INIT
  ========================================================= */

  function init(){

    console.log("🔌 Onion Index Loader iniciado");

    loadAll();

  }

  /* =========================================================
     START
  ========================================================= */

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", init);
  }else{
    init();
  }

})();

"use strict";

(function(){

  if(!window.Onion){
    console.error("💥 Onion no existe (router.js)");
    return;
  }

  const Onion = window.Onion;

  /* =========================================================
     STATE
  ========================================================= */

  Onion.state = Onion.state || {};

  /* =========================================================
     HELPERS
  ========================================================= */

  function getPath(){

    let path = window.location.pathname || "/";

    // quitar trailing slash
    if(path.length > 1 && path.endsWith("/")){
      path = path.slice(0, -1);
    }

    return path;

  }

  function getQuery(){

    const params = new URLSearchParams(window.location.search);
    const query = {};

    for(const [k,v] of params.entries()){
      query[k] = v;
    }

    return query;

  }

  /* =========================================================
     RESOLVE (CLAVE)
  ========================================================= */

  function resolve(){

    const path = getPath();

    let route = Onion.routes[path];

    if(!route){
      console.warn("⚠️ Ruta no encontrada:", path);

      route = Onion.routes["/"]; // fallback
    }

    return {
      ...route,
      path,
      query: getQuery()
    };

  }

  /* =========================================================
     NAVIGATE
  ========================================================= */

  function navigate(path, options = {}){

    if(!path) return;

    const current = getPath();

    // evitar doble navegación
    if(path === current) return;

    try{

      history.pushState({}, "", path);

      if(options.scroll !== false){
        window.scrollTo(0, 0);
      }

      Onion.render?.();

    }catch(e){

      console.error("💥 NAVIGATION ERROR:", e);

    }

  }

  /* =========================================================
     BACK / FORWARD
  ========================================================= */

  function initPopState(){

    window.addEventListener("popstate", ()=>{
      Onion.render?.();
    });

  }

  /* =========================================================
     PUBLIC API
  ========================================================= */

  Onion.router = {

    get: getPath,

    resolve,

    navigate,

    go: navigate, // alias estilo backend

    query: getQuery

  };

  /* =========================================================
     INIT
  ========================================================= */

  initPopState();

  /* =========================================================
     DEBUG
  ========================================================= */

  if(Onion.config?.DEBUG){
    Onion.log("🧭 Router READY");
  }

})();

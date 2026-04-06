"use strict";

(function(){

  if(!window.Onion){
    console.error("💥 Onion no existe (router.js)");
    return;
  }

  const Onion = window.Onion;

  Onion.state = Onion.state || {};

  /* =========================
     NORMALIZE PATH
  ========================= */

  function normalize(path){

    if(!path) return "/";

    // quitar query
    path = path.split("?")[0];

    // quitar trailing slash
    if(path.length > 1 && path.endsWith("/")){
      path = path.slice(0, -1);
    }

    return path || "/";

  }

  /* =========================
     GET PATH
  ========================= */

  function getPath(){
    return normalize(window.location.pathname);
  }

  /* =========================
     GET QUERY
  ========================= */

  function getQuery(){

    const params = new URLSearchParams(window.location.search);
    const query = {};

    for(const [k,v] of params.entries()){
      query[k] = v;
    }

    return query;

  }

  /* =========================
     RESOLVE
  ========================= */

  function resolve(){

    const path = getPath();

    let route = Onion.routes?.[path];

    if(!route){

      console.warn("⚠️ Ruta no encontrada:", path);

      route = Onion.routes["/"];

    }

    return {
      ...route,
      path,
      query: getQuery()
    };

  }

  /* =========================
     NAVIGATE
  ========================= */

  function navigate(path){

    if(!path) return;

    const target = normalize(path);
    const current = getPath();

    if(target === current) return;

    history.pushState({}, "", target);

    window.scrollTo(0, 0);

    Onion.render?.();

  }

  /* =========================
     POPSTATE
  ========================= */

  window.addEventListener("popstate", ()=>{
    Onion.render?.();
  });

  /* =========================
     PUBLIC
  ========================= */

  Onion.router = {
    get: getPath,
    resolve,
    navigate,
    go: navigate,
    query: getQuery
  };

  if(Onion.config?.DEBUG){
    Onion.log("🧭 Router FINAL READY");
  }

})();

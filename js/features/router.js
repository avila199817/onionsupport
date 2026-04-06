"use strict";

(function(){

  if(!window.Onion){
    console.error("💥 Onion no existe (router.js)");
    return;
  }

  const Onion = window.Onion;

  Onion.state = Onion.state || {};

  /* =========================================================
     NORMALIZE
  ========================================================= */

  function normalize(path){

    if(!path) return "/";

    // quitar query
    path = path.split("?")[0];

    // limpiar barras duplicadas
    path = path.replace(/\/+/g, "/");

    // quitar trailing slash
    if(path.length > 1 && path.endsWith("/")){
      path = path.slice(0, -1);
    }

    return path || "/";
  }

  /* =========================================================
     GET PATH (CON SLUG)
  ========================================================= */

  function getPath(){

    try{

      let path = normalize(window.location.pathname);

      // soporte /@usuario/...
      if(path.startsWith("/@")){

        const parts = path.split("/").filter(Boolean);

        Onion.state.slug = parts[0].replace("@","");

        return "/" + (parts.slice(1).join("/") || "");
      }

      return path;

    }catch(e){

      Onion.error?.("Router get error:", e);
      return "/";

    }

  }

  /* =========================================================
     QUERY
  ========================================================= */

  function getQuery(){
    return Object.fromEntries(new URLSearchParams(window.location.search));
  }

  /* =========================================================
     RESOLVE
  ========================================================= */

  function resolve(){

    const path = getPath();

    let route = Onion.routes?.[path];

    if(!route){

      console.warn("⚠️ Ruta no encontrada:", path);

      route = Onion.routes?.["/"];
    }

    return {
      ...route,
      path,
      query: getQuery()
    };

  }

  /* =========================================================
     BUILD URL (CON SLUG)
  ========================================================= */

  function buildUrl(href){

    const slug =
      Onion.state.slug ||
      localStorage.getItem("onion_user_slug");

    if(!slug) return href;

    if(href === "/") return "/@" + slug;

    if(href.startsWith("/@")) return href;

    return "/@" + slug + href;

  }

  /* =========================================================
     NAVIGATE (SIN LÓGICA EXTRA)
  ========================================================= */

  function navigate(href){

    if(!href) return;

    // externas
    if(href.startsWith("http")){
      window.location.href = href;
      return;
    }

    const finalHref = buildUrl(href);

    const current = normalize(window.location.pathname);
    const next    = normalize(finalHref);

    if(current === next) return;

    history.pushState({}, "", finalHref);

    window.scrollTo(0, 0);

    Onion.render?.();

  }

  /* =========================================================
     POPSTATE
  ========================================================= */

  window.addEventListener("popstate", ()=>{
    Onion.render?.();
  });

  /* =========================================================
     PUBLIC API
  ========================================================= */

  Onion.router = {
    get: getPath,
    resolve,
    navigate,
    go: navigate,
    query: getQuery
  };

  /* =========================================================
     DEBUG
  ========================================================= */

  if(Onion.config?.DEBUG){
    Onion.log("🧭 Router CLEAN ready");
  }

})();

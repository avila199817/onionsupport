"use strict";

(function(){

  if(!window.Onion){
    console.error("💥 Onion no existe (router.js)");
    return;
  }

  const Onion = window.Onion;

  /* =========================================================
     GET PATH
  ========================================================= */

  function get(){
    return window.location.pathname || "/";
  }

  function getQuery(){
    const params = new URLSearchParams(window.location.search);
    const query = {};

    for(const [k, v] of params.entries()){
      query[k] = v;
    }

    return query;
  }

  /* =========================================================
     NAVIGATE
  ========================================================= */

  function navigate(path){

    if(!path) return;

    // evitar duplicados
    if(path === get()) return;

    history.pushState({}, "", path);

  }

  /* =========================================================
     CLICK INTERCEPT
  ========================================================= */

  function handleClick(e){

    const link = e.target.closest("a[data-spa]");

    if(!link) return;

    const href = link.getAttribute("href");

    if(!href || href.startsWith("http")) return;

    e.preventDefault();

    navigate(href);

    // 🔥 el server se encarga de renderizar
    Onion.server?.handle?.();

  }

  /* =========================================================
     INIT
  ========================================================= */

  function init(){

    document.addEventListener("click", handleClick);

  }

  /* =========================================================
     API
  ========================================================= */

  Onion.router = {
    get,
    getQuery,
    navigate,
    init
  };

})();

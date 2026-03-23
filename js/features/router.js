"use strict";

/* =========================
   ROUTER (PRO SaaS - ONION)
========================= */

(function(){

  if(!window.Onion){
    console.error("💥 Onion no está definido (router.js)");
    return;
  }

  const Onion = window.Onion;

  /* =========================
     ROUTES REGISTRY
  ========================= */

  Onion.routes = Object.freeze({

    "/": {
      page: "/app/views/index.html",
      style: "/css/core/core.css",
      script: "/js/features/dashboard/index.js"
    },

    "/incidencias": {
      page: "/app/views/incidencias/index.html",
      style: "/css/core/core.css",
      script: "/js/features/incidencias/index.js"
    },

    "/facturas": {
      page: "/app/views/facturas/index.html",
      style: "/css/core/core.css",
      script: "/js/features/facturas/index.js"
    },

    "/cuenta": {
      page: "/app/views/cuenta/index.html",
      style: "/css/core/core.css",
      script: "/js/features/cuenta/index.js"
    }

  });

  /* =========================
     GET PATH (NORMALIZADO)
  ========================= */

  Onion.router.get = function(){

    try{

      let path = window.location.pathname || "/";

      // 🔥 quitar base /app
      if(path.startsWith("/app")){
        path = path.slice(4) || "/";
      }

      // 🔥 quitar slug tipo /@user
      if(path.startsWith("/@")){
        const parts = path.split("/").filter(Boolean);
        path = "/" + (parts.slice(1).join("/") || "");
      }

      // 🔥 normalizar barras
      path = path.replace(/\/+/g, "/");

      // 🔥 quitar slash final
      if(path.length > 1 && path.endsWith("/")){
        path = path.slice(0, -1);
      }

      // 🔥 asegurar formato
      if(!path.startsWith("/")){
        path = "/" + path;
      }

      return path || "/";

    }catch(e){

      Onion.error("💥 Router get error:", e);
      return "/";

    }

  };

  /* =========================
     RESOLVE ROUTE
  ========================= */

  Onion.router.resolve = function(){

    try{

      const route = Onion.router.get();

      // 🔥 sincronizar estado (clave)
      Onion.state.slug = route === "/" ? "index" : route.slice(1);

      const config = Onion.routes[route];

      if(config){
        Onion.log("🧭 Route:", route);
        return config;
      }

      // 🔥 fallback elegante
      Onion.warn("Ruta no encontrada:", route);

      return Onion.routes["/"];

    }catch(e){

      Onion.error("💥 Router resolve error:", e);

      return Onion.routes["/"];

    }

  };

  /* =========================
     NAVIGATION (SPA)
  ========================= */

  document.addEventListener("click", function(e){

    const link = e.target.closest("[data-link]");
    if(!link) return;

    const href = link.getAttribute("href");
    if(!href) return;

    // 🔥 solo rutas internas de app
    if(!href.startsWith("/app")) return;

    e.preventDefault();

    if(Onion.state.navigating) return;
    Onion.state.navigating = true;

    history.pushState({}, "", href);

    Onion.render();

  });

  /* =========================
     BACK / FORWARD
  ========================= */

  window.addEventListener("popstate", function(){
    Onion.render();
  });

  /* =========================
     HAS ROUTE
  ========================= */

  Onion.router.has = function(path){

    if(!path) return false;

    const clean = path.replace(/\/+$/,"") || "/";

    return !!Onion.routes[clean];

  };

})();

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

  Onion.routes = {

    "/": {
      page: "/es/acceso/admin/pages/index.html",
      style: "/css/acceso/admin/pages/dashboard.css",
      script: "/js/acceso/admin/pages/dashboard.js"
    },

    "/incidencias": {
      page: "/es/acceso/admin/pages/incidencias/index.html",
      style: "/css/acceso/admin/pages/incidencias/incidencias.css",
      script: "/js/acceso/admin/pages/incidencias/incidencias.js"
    },

    "/facturas": {
      page: "/es/acceso/admin/pages/facturas/index.html",
      style: "/css/acceso/admin/pages/facturas/facturas.css",
      script: "/js/acceso/admin/pages/facturas/facturas.js"
    },

    "/cuenta": {
      page: "/es/acceso/admin/pages/cuenta/index.html",
      style: "/css/acceso/admin/pages/cuenta/cuenta.css",
      script: "/js/acceso/admin/pages/cuenta/cuenta.js"
    }

  };

  /* =========================
     GET PATH (NORMALIZADO)
  ========================= */

  Onion.router.get = function(){

    try{

      let path = window.location.pathname || "/";

      // 🔥 quitar slug /@user/...
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

      // 🔥 asegurar formato válido
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

      const config = Onion.routes[route];

      if(config){
        Onion.log("🧭 Route:", route);
        return config;
      }

      // 🔥 fallback seguro
      Onion.warn("Ruta no encontrada:", route);

      return Onion.routes["/"];

    }catch(e){

      Onion.error("💥 Router resolve error:", e);

      return Onion.routes["/"];

    }

  };

  /* =========================
     OPTIONAL: HAS ROUTE
  ========================= */

  Onion.router.has = function(path){

    if(!path) return false;

    const clean = path.replace(/\/+$/,"") || "/";

    return !!Onion.routes[clean];

  };

})();

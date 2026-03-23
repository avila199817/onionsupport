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
     GET PATH (MULTI-TENANT)
  ========================= */

  Onion.router.get = function(){

    try{

      let path = window.location.pathname || "/";

      // 🔥 normalizar
      path = path.replace(/\/+/g, "/");

      if(path.length > 1 && path.endsWith("/")){
        path = path.slice(0, -1);
      }

      // 🔥 detectar @usuario
      if(path.startsWith("/@")){

        const parts = path.split("/").filter(Boolean);

        const userSlug = parts[0]; // "@cristian"
        const cleanUser = userSlug.replace("@","");

        // 🔥 guardar usuario en estado (pro)
        Onion.state.user = Onion.state.user || {};
        Onion.state.user.username = cleanUser;

        // 🔥 guardar slug real
        Onion.state.slug = cleanUser;

        // 👉 decidir ruta interna
        if(parts.length === 1){
          return "/"; // dashboard
        }

        return "/" + parts.slice(1).join("/");
      }

      // 🔥 ruta normal (fallback)
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

    // 🔥 SOLO rutas internas (soporta @usuario)
    if(!href.startsWith("/@")) return;

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

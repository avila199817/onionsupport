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
      style: "/css/app/dashboard.css",
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
     GET PATH (MULTI-TENANT PRO)
  ========================= */

  Onion.router.get = function(){

    try{

      let path = window.location.pathname || "/";

      // normalizar
      path = path.replace(/\/+/g, "/");

      if(path.length > 1 && path.endsWith("/")){
        path = path.slice(0, -1);
      }

      // 🔥 detectar /@usuario
      if(path.startsWith("/@")){

        const parts = path.split("/").filter(Boolean);

        const userSlug = parts[0]; // "@cristian"
        const cleanUser = userSlug.replace("@","");

        // 🔥 guardar SOLO si no existe (no pisar datos reales)
        if(!Onion.state.user){
          Onion.state.user = {};
        }

        if(!Onion.state.user.username){
          Onion.state.user.username = cleanUser;
        }

        Onion.state.slug = cleanUser;

        // ruta interna
        if(parts.length === 1){
          return "/";
        }

        return "/" + parts.slice(1).join("/");
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

      Onion.warn("Ruta no encontrada:", route);

      return Onion.routes["/"];

    }catch(e){

      Onion.error("💥 Router resolve error:", e);

      return Onion.routes["/"];

    }

  };

  /* =========================
     NAVIGATION (SPA PRO)
  ========================= */

  document.addEventListener("click", function(e){

    const link = e.target.closest("[data-link]");
    if(!link) return;

    let href = link.getAttribute("href");
    if(!href) return;

    // permitir enlaces externos
    if(href.startsWith("http")) return;

    // 🔥 usuario actual
    const username =
      Onion.state.user?.username ||
      localStorage.getItem("onion_user_slug");

    if(!username){
      Onion.warn("No username para navegación");
      return;
    }

    let finalHref;

    // HOME
    if(href === "/"){
      finalHref = "/@" + username;
    }
    // YA TIENE USER
    else if(href.startsWith("/@")){
      finalHref = href;
    }
    // RUTA NORMAL
    else{
      finalHref = "/@" + username + href;
    }

    e.preventDefault();

    if(Onion.state.navigating) return;
    Onion.state.navigating = true;

    history.pushState({}, "", finalHref);

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

"use strict";

/* =========================
   ROUTER (ONION PRO SPA)
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
      style: "/css/app/incidencias.css",
      script: "/js/features/incidencias/index.js"
    },

    "/facturas": {
      page: "/app/views/facturas/index.html",
      style: "/css/app/facturas.css",
      script: "/js/features/facturas/index.js"
    },

    "/cuenta": {
      page: "/app/views/cuenta/index.html",
      style: "/css/app/cuenta.css",
      script: "/js/features/cuenta/index.js"
    }

  });

  /* =========================
     NORMALIZE PATH
  ========================= */

  function normalize(path){

    if(!path) return "/";

    path = path.replace(/\/+/g, "/");

    if(path.length > 1 && path.endsWith("/")){
      path = path.slice(0, -1);
    }

    return path || "/";
  }

  /* =========================
     GET PATH (MULTI-TENANT)
  ========================= */

  Onion.router.get = function(){

    try{

      let path = normalize(window.location.pathname);

      // detectar /@usuario
      if(path.startsWith("/@")){

        const parts = path.split("/").filter(Boolean);

        const userSlug = parts[0]; // "@avila"
        const cleanUser = userSlug.replace("@","");

        if(!Onion.state.user){
          Onion.state.user = {};
        }

        if(!Onion.state.user.username){
          Onion.state.user.username = cleanUser;
        }

        Onion.state.slug = cleanUser;

        if(parts.length === 1){
          return "/";
        }

        return "/" + parts.slice(1).join("/");
      }

      return path;

    }catch(e){

      Onion.error?.("💥 Router get error:", e);
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
        Onion.log?.("🧭 Route:", route);
        return config;
      }

      Onion.warn?.("⚠️ Ruta no encontrada:", route);

      return Onion.routes["/"];

    }catch(e){

      Onion.error?.("💥 Router resolve error:", e);
      return Onion.routes["/"];

    }

  };

  /* =========================
     NAVIGATE (CORE)
  ========================= */

  Onion.router.navigate = function(href){

    if(!href) return;

    // evitar externas
    if(href.startsWith("http")) return;

    const username =
      Onion.state.user?.username ||
      localStorage.getItem("onion_user_slug");

    if(!username){
      Onion.warn?.("⚠️ No username para navegación");
      return;
    }

    let finalHref;

    if(href === "/"){
      finalHref = "/@" + username;
    }
    else if(href.startsWith("/@")){
      finalHref = href;
    }
    else{
      finalHref = "/@" + username + href;
    }

    // evitar navegación duplicada
    if(window.location.pathname === finalHref) return;

    if(Onion.state.navigating) return;
    Onion.state.navigating = true;

    history.pushState({}, "", finalHref);

    Onion.render();

  };

  /* =========================
     CLICK INTERCEPT (SPA)
  ========================= */

  document.addEventListener("click", function(e){

    const link = e.target.closest("a[data-spa]");
    if(!link) return;

    const href = link.getAttribute("href");
    if(!href) return;

    // nueva pestaña
    if(link.target === "_blank") return;

    // ctrl / cmd click
    if(e.metaKey || e.ctrlKey) return;

    // descarga
    if(link.hasAttribute("download")) return;

    e.preventDefault();

    Onion.router.navigate(href);

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

    const clean = normalize(path);

    return !!Onion.routes[clean];

  };

})();

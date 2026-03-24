"use strict";

/* =========================
   ROUTER (ONION PRO FINAL + META)
   - Navegación estable
   - Metadata centralizada (title)
========================= */

(function(){

  if(!window.Onion){
    console.error("💥 Onion no está definido (router.js)");
    return;
  }

  const Onion = window.Onion;

  /* =========================
     ROUTES (🔥 CON META)
  ========================= */

  Onion.routes = Object.freeze({

    "/": {
      page: "/app/views/index.html",
      style: "/css/app/dashboard.css",
      script: "/js/features/dashboard/index.js",
      title: "Onion Support"
    },

    "/incidencias": {
      page: "/app/views/incidencias/index.html",
      style: "/css/app/incidencias.css",
      script: "/js/features/incidencias/index.js",
      title: "Incidencias"
    },

    "/facturas": {
      page: "/app/views/facturas/index.html",
      style: "/css/app/facturas.css",
      script: "/js/features/facturas/index.js",
      title: "Facturas"
    },

    "/cuenta": {
      page: "/app/views/cuenta/index.html",
      style: "/css/app/cuenta.css",
      script: "/js/features/cuenta/index.js",
      title: "Cuenta"
    },
     
     "/usuarios": {
         page: "/app/views/usuarios/index.html",
         style: "/css/app/usuarios.css",
         script: "/js/features/usuarios/index.js",
         title: "Usuarios"
    }

  });

  /* =========================
     NORMALIZE
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
     GET ROUTE
  ========================= */

  Onion.router.get = function(){

    try{

      let path = normalize(window.location.pathname);

      if(path.startsWith("/@")){

        const parts = path.split("/").filter(Boolean);

        const userSlug = parts[0];
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
     RESOLVE (🔥 DEVUELVE META)
  ========================= */

  Onion.router.resolve = function(){

    try{

      const route = Onion.router.get();
      const config = Onion.routes[route];

      return config || Onion.routes["/"];

    }catch(e){

      Onion.error?.("💥 Router resolve error:", e);
      return Onion.routes["/"];

    }

  };

  /* =========================
     NAVIGATE
  ========================= */

  Onion.router.navigate = function(href){

    if(!href) return;

    if(href.startsWith("http")) return;

    const username =
      Onion.state.user?.username ||
      localStorage.getItem("onion_user_slug");

    if(!username){
      Onion.warn?.("⚠️ No username");
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

    if(window.location.pathname === finalHref) return;

    Onion.state.navigating = true;

    history.pushState({}, "", finalHref);

    Promise.resolve().then(()=>{
      Onion.render();
    });

  };

  /* =========================
     CLICK INTERCEPT
  ========================= */

  if(!window.__ONION_ROUTER_BOUND__){

    window.__ONION_ROUTER_BOUND__ = true;

    document.addEventListener("click", function(e){

      const link = e.target.closest("a[data-spa]");
      if(!link) return;

      const href = link.getAttribute("href");
      if(!href) return;

      if(link.target === "_blank") return;
      if(e.metaKey || e.ctrlKey) return;
      if(link.hasAttribute("download")) return;

      e.preventDefault();

      Onion.router.navigate(href);

    });

  }

  /* =========================
     BACK / FORWARD
  ========================= */

  if(!window.__ONION_POPSTATE_BOUND__){

    window.__ONION_POPSTATE_BOUND__ = true;

    window.addEventListener("popstate", function(){
      Onion.render();
    });

  }

  /* =========================
     HAS ROUTE
  ========================= */

  Onion.router.has = function(path){

    if(!path) return false;

    const clean = normalize(path);

    return !!Onion.routes[clean];

  };

})();

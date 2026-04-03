"use strict";

(function(){

  if(!window.Onion){
    console.error("💥 Onion no está definido (router.js)");
    return;
  }

  const Onion = window.Onion;

  /* =========================
     ROUTES
  ========================= */

  Onion.routes = Object.freeze({

    "/": {
      page: "/app/views/index.html",
      style: "/css/app/dashboard.css",
      script: "/js/features/dashboard/index.js",
      title: "Dashboard"
    },

    "/incidencias": {
      page: "/app/views/incidencias/index.html",
      style: "/css/app/incidencias/incidencias.css",
      script: "/js/features/incidencias/index.js",
      title: "Incidencias"
    },

    "/incidencias/detalle": {
      page: "/app/views/incidencias/detalle.html",
      style: [
        "/css/app/core/view.css", 
        "/css/app/incidencias/detalle.css"    
      ],
      script: "/js/features/incidencias/detalle.js",
      title: "Detalle incidencia"
    },
    
    "/incidencias/nueva": {
      page: "/app/views/incidencias/incidencia.html",
      style: "/css/app/incidencias/incidencia.css",
      script: "/js/features/incidencias/incidencia.js",
      title: "Nueva incidencia"
    },

    "/facturas": {
      page: "/app/views/facturas/index.html",
      style: "/css/app/facturas/facturas.css",
      script: "/js/features/facturas/index.js",
      title: "Facturas"
    },

    "/facturas/detalle": {
      page: "/app/views/facturas/detalle.html",
      style: [
        "/css/app/core/view.css", 
        "/css/app/facturas/detalle.css"    
      ],
      script: "/js/features/facturas/detalle.js",
      title: "Detalle factura"
    },

    "/facturas/nueva": {
      page: "/app/views/facturas/factura.html",
      style: "/css/app/facturas/factura.css",
      script: "/js/features/facturas/factura.js",
      title: "Nueva factura"
    },

    "/cuenta": {
      page: "/app/views/cuenta/index.html",
      style: "/css/app/cuenta.css",
      script: "/js/features/cuenta/index.js",
      title: "Cuenta"
    },

    "/usuarios": {
      page: "/app/views/usuarios/index.html",
      style: "/css/app/usuarios/usuarios.css",
      script: "/js/features/usuarios/index.js",
      title: "Usuarios"
    },

    "/usuarios/nuevo": {
      page: "/app/views/usuarios/usuario.html",
      style: "/css/app/usuarios/usuario.css",
      script: "/js/features/usuarios/usuario.js",
      title: "Nuevo usuario"
    },

    "/usuarios/detalle": {
      page: "/app/views/usuarios/detalle.html",
      style: "/css/app/usuarios/detalle.css",
      script: "/js/features/usuarios/detalle.js",
      title: "Detalle usuario"
    },

    "/clientes": {
      page: "/app/views/clientes/index.html",
      style: "/css/app/clientes/clientes.css",
      script: "/js/features/clientes/index.js",
      title: "Clientes"
    },

    "/clientes/cliente": {
      page: "/app/views/clientes/cliente.html",
      style: "/css/app/clientes.css",
      script: "/js/features/clientes/cliente.js",
      title: "Cliente"
    },

    "/ajustes": {
      page: "/app/views/ajustes/index.html",
      style: "/css/app/cuenta.css",
      script: "/js/features/ajustes/index.js",
      title: "Ajustes"
    }

  });

  /* =========================
     TITLE
  ========================= */

  Onion.setTitle = function(title){
    document.title = title ? `${title} · Onion` : "Onion Panel";
  };

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
     GET
  ========================= */

  Onion.router.get = function(){

    try{

      let path = normalize(window.location.pathname);

      if(path.startsWith("/@")){

        const parts = path.split("/").filter(Boolean);

        const userSlug = parts[0];
        const cleanUser = userSlug.replace("@","");

        Onion.state.slug = cleanUser;

        if(parts.length === 1){
          return "/";
        }

        return "/" + parts.slice(1).join("/");
      }

      return path;

    }catch(e){

      console.error("💥 Router get error:", e);
      return "/";

    }

  };

  /* =========================
     RESOLVE
  ========================= */

  Onion.router.resolve = function(){

    try{

      const route = Onion.router.get();
      const config = Onion.routes[route] || Onion.routes["/"];

      Onion.setTitle(config.title);

      return config;

    }catch(e){

      console.error("💥 Router resolve error:", e);
      Onion.setTitle("Panel");

      return Onion.routes["/"];

    }

  };

  /* =========================
     NAVIGATE
  ========================= */

  Onion.router.navigate = function(href){

    if(!href) return;

    if(href.startsWith("http")){
      window.location.href = href;
      return;
    }

    const username =
      Onion.state.slug ||
      localStorage.getItem("onion_user_slug");

    let finalHref;

    if(!username){
      finalHref = href;
    }
    else if(href === "/"){
      finalHref = "/@" + username;
    }
    else if(href.startsWith("/@")){
      finalHref = href;
    }
    else{
      finalHref = "/@" + username + href;
    }

    if(window.location.pathname === finalHref) return;

    history.pushState({}, "", finalHref);

    // 🔥 flujo limpio
    Onion.runCleanup();
    Onion.render().then(()=>{
      Onion.ui?.init?.();
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
     POPSTATE
  ========================= */

  if(!window.__ONION_POPSTATE_BOUND__){

    window.__ONION_POPSTATE_BOUND__ = true;

    window.addEventListener("popstate", function(){

      Onion.runCleanup();
      Onion.render().then(()=>{
        Onion.ui?.init?.();
      });

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

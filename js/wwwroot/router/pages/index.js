"use strict";

/* =========================================================
   🧅 ONION INDEX ENGINE (FULL PRO SAAS · FINAL)
   - NO toca server.js
   - NO rompe Onion.router (freeze safe)
   - Slug FIX + navegación correcta
   - CSS limpio por vista
   - JS SIEMPRE se re-ejecuta
========================================================= */

(function(){

if(!window.Onion){
  console.error("💥 Onion no está definido (index.js)");
  return;
}

const Onion = window.Onion;

/* =========================================================
   🔥 FIX SLUG (SIN TOCAR SERVER)
========================================================= */

(function fixSlug(){

  try{

    const path = window.location.pathname;

    if(path.startsWith("/@")){

      const parts = path.split("/").filter(Boolean);

      const slug = parts[0].replace("@","");

      Onion.state.slug = slug;

      try{
        localStorage.setItem("onion_user_slug", slug);
      }catch{}

    }

  }catch(e){
    console.warn("⚠️ slug fix error", e);
  }

})();

/* =========================================================
   🔥 PATCH NAVIGATE (SIN ROMPER CORE)
========================================================= */

Onion.router.navigate = function(href){

  if(!href) return;

  if(href.startsWith("http")){
    window.location.href = href;
    return;
  }

  const slug =
    Onion.state.slug ||
    localStorage.getItem("onion_user_slug");

  let final = href;

  if(slug){

    if(href === "/"){
      final = "/@" + slug;
    }
    else if(!href.startsWith("/@")){
      final = "/@" + slug + href;
    }

  }

  history.pushState({}, "", final);

  window.scrollTo(0,0);

  Onion.render();
};

/* =========================================================
   ROUTES (SE RESPETAN)
========================================================= */

Onion.routes = Object.freeze({

  "/": {
    page: "/app/views/index.html",
    style: "/css/app/dashboard.css",
    script: "/js/wwwroot/router/pages/dashboard/index.js",
    title: "Dashboard"
  },

  "/incidencias": {
    page: "/app/views/incidencias/index.html",
    style: [
      "/css/app/core/topbarview.css",
      "/css/app/incidencias/incidencias.css"
    ],
    script: [
      "/js/features/incidencias/topbarview.js",
      "/js/features/incidencias/index.js"
    ],
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
    style: [
      "/css/app/core/topbarview.css",
      "/css/app/facturas/facturas.css"
    ],
    script: [
      "/js/features/facturas/topbarview.js",
      "/js/features/facturas/index.js"
    ],
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

  "/usuarios": {
    page: "/app/views/usuarios/index.html",
    style: [
      "/css/app/core/topbarview.css",
      "/css/app/usuarios/usuarios.css"
    ],
    script: [
      "/js/features/usuarios/topbarview.js",
      "/js/features/usuarios/index.js"
    ],
    title: "Usuarios"
  },

  "/usuarios/detalle": {
    page: "/app/views/usuarios/detalle.html",
    style: [
      "/css/app/core/view.css",
      "/css/app/usuarios/detalle.css"
    ],
    script: "/js/features/usuarios/detalle.js",
    title: "Detalle usuario"
  },

  "/usuarios/nuevo": {
    page: "/app/views/usuarios/usuario.html",
    style: "/css/app/usuarios/usuario.css",
    script: "/js/features/usuarios/usuario.js",
    title: "Nuevo usuario"
  },

  "/clientes": {
    page: "/app/views/clientes/index.html",
    style: [
      "/css/app/core/topbarview.css",
      "/css/app/clientes/clientes.css"
    ],
    script: [
      "/js/features/clientes/topbarview.js",
      "/js/features/clientes/index.js"
    ],
    title: "Clientes"
  },

  "/clientes/detalle": {
    page: "/app/views/clientes/detalle.html",
    style: [
      "/css/app/core/view.css",
      "/css/app/clientes/detalle.css"
    ],
    script: "/js/features/clientes/detalle.js",
    title: "Detalle cliente"
  },

  "/clientes/cliente": {
    page: "/app/views/clientes/cliente.html",
    style: "/css/app/clientes.css",
    script: "/js/features/clientes/cliente.js",
    title: "Cliente"
  },

  "/cuenta": {
    page: "/app/views/cuenta/index.html",
    style: "/css/app/cuenta.css",
    script: "/js/features/cuenta/index.js",
    title: "Cuenta"
  },

  "/ajustes": {
    page: "/app/views/ajustes/index.html",
    style: "/css/app/cuenta.css",
    script: "/js/features/ajustes/index.js",
    title: "Ajustes"
  }

});

/* =========================================================
   🔥 INDEX ENGINE
========================================================= */

let currentScripts = [];
let currentStyles  = [];

/* ---------- CSS ---------- */

function loadStyle(href){

  currentStyles.forEach(el => el.remove());
  currentStyles = [];

  if(!href) return;

  const add = (h)=>{
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = h;
    l.dataset.dynamic = "true";

    document.head.appendChild(l);
    currentStyles.push(l);
  };

  Array.isArray(href) ? href.forEach(add) : add(href);
}

/* ---------- JS ---------- */

function loadScript(src){

  currentScripts.forEach(el => el.remove());
  currentScripts = [];

  if(!src) return;

  const add = (s)=>{
    const el = document.createElement("script");
    el.src = s;
    el.defer = true;
    el.dataset.dynamic = "true";

    el.onload = ()=> console.log("🧩 script:", s);
    el.onerror = ()=> console.error("💥 script error:", s);

    document.body.appendChild(el);
    currentScripts.push(el);
  };

  Array.isArray(src) ? src.forEach(add) : add(src);
}

/* ---------- LOAD ---------- */

function loadAssets(route){

  if(!route) return;

  loadStyle(route.style);
  loadScript(route.script);
}

/* =========================================================
   🔥 HOOK RENDER
========================================================= */

if(!Onion.__viewEngineHooked){

  const originalRender = Onion.render;

  Onion.render = async function(){

    const route = Onion.router.resolve();

    await originalRender.apply(this, arguments);

    loadAssets(route);
  };

  Onion.__viewEngineHooked = true;
}

/* =========================================================
   DEBUG
========================================================= */

if(Onion.config?.DEBUG){
  console.log("🧭 INDEX ENGINE FULL PRO 10/10 READY");
}

})();

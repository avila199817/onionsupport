"use strict";

/* =========================================================
   🧅 ONION INDEX ENGINE (FULL PRO SAAS · SAFE MODE)
   - NO toca server.js
   - NO modifica Onion.router (freeze safe)
   - Slug compatible
   - Scripts SIEMPRE se re-ejecutan
   - CSS limpio por vista
========================================================= */

(function(){

if(!window.Onion){
  console.error("💥 Onion no está definido (index.js)");
  return;
}

const Onion = window.Onion;

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
   🔥 INDEX ENGINE (SIN TOCAR ROUTER)
========================================================= */

let currentScripts = [];
let currentStyles  = [];

/* ---------- CSS CLEAN ---------- */

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

/* ---------- JS CLEAN + RELOAD ---------- */

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
   🔥 HOOK RENDER (SIN TOCAR CORE)
========================================================= */

if(!Onion.__viewEngineHooked){

  const originalRender = Onion.render;

  Onion.render = async function(){

    const route = Onion.router.resolve(); // 🔥 usamos router congelado

    await originalRender.apply(this, arguments);

    loadAssets(route);
  };

  Onion.__viewEngineHooked = true;
}

/* =========================================================
   DEBUG
========================================================= */

if(Onion.config?.DEBUG){
  console.log("🧭 INDEX ENGINE FULL PRO (SAFE) ready");
}

})();

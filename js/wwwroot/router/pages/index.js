"use strict";

(function(){

if(!window.Onion){
  console.error("💥 Onion no está definido (index.js)");
  return;
}

const Onion = window.Onion;

/* =========================================================
   🔥 FIX SLUG
========================================================= */

(function(){

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
    console.warn("⚠️ slug error", e);
  }

})();

/* =========================================================
   🔥 INTERCEPT SPA LINKS (SIN TOCAR ROUTER)
========================================================= */

if(!window.__ONION_SLUG_NAV__){

  window.__ONION_SLUG_NAV__ = true;

  document.addEventListener("click", function(e){

    const link = e.target.closest("[data-spa]");
    if(!link) return;

    const href = link.getAttribute("href");
    if(!href || href.startsWith("http")) return;

    e.preventDefault();

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

  });

}

/* =========================================================
   ROUTES
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
      "/js/wwwroot/router/pages/incidencias/index.js"
    ],
    title: "Incidencias"
  },
    
  "/facturas": {
    page: "/app/views/facturas/index.html",
    style: [
      "/css/app/core/topbarview.css",
      "/css/app/facturas/facturas.css"
    ],
    script: [
      "/js/features/facturas/topbarview.js",
      "/js/wwwroot/router/pages/dashboard/index.js"
    ],
    title: "Facturas"
  }

});

/* =========================================================
   🔥 INDEX ENGINE
========================================================= */

let currentScripts = [];
let currentStyles  = [];

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

function loadScript(src){

  currentScripts.forEach(el => el.remove());
  currentScripts = [];

  if(!src) return;

  const add = (s)=>{
    const el = document.createElement("script");
    el.src = s;
    el.defer = true;
    el.dataset.dynamic = "true";

    document.body.appendChild(el);
    currentScripts.push(el);
  };

  Array.isArray(src) ? src.forEach(add) : add(src);
}

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
  console.log("🧭 INDEX ENGINE FIXED (NO FREEZE ERROR)");
}

})();

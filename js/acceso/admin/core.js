(function(){

"use strict";

if(window.Onion) return;

const Onion = {};
window.Onion = Onion;


/* =========================
   CONFIG
========================= */

Onion.config = {
  API: "https://api.onionit.net/api",
  TIMEOUT: 10000
};


/* =========================
   STATE
========================= */

Onion.state = {
  user: null,
  slug: localStorage.getItem("onion_slug") || null,
  rendering: false,
  currentScript: null,
  currentStyle: null,
  renderId: 0,
  abortController: null,
};

Onion.cache = {
  html: {}
};


/* =========================
   LOAD SCRIPT
========================= */

Onion.loadScript = function(src){

  return new Promise((resolve, reject)=>{

    let finalSrc;

    if(src.startsWith("/")){
      finalSrc = window.location.origin + src;
    }else if(src.startsWith("http")){
      finalSrc = src;
    }else{
      finalSrc = window.location.origin + "/" + src.replace(/^\/+/,"");
    }

    const old = document.querySelector(`script[data-onion-page]`);
    if(old) old.remove();

    const s = document.createElement("script");
    s.src = finalSrc + "?v=" + Date.now();
    s.defer = true;
    s.setAttribute("data-onion-page","true");

    s.onload = ()=>{
      Onion.state.currentScript = finalSrc;
      resolve();
    };

    s.onerror = ()=>{
      console.warn("Script load fail:", finalSrc);
      resolve(); // 🔥 NO ROMPE RENDER
    };

    document.body.appendChild(s);

  });

};


/* =========================
   LOAD STYLE
========================= */

Onion.loadStyle = function(href){

  return new Promise((resolve)=>{

    if(Onion.state.currentStyle === href){
      return resolve();
    }

    const old = document.querySelector("link[data-onion-style]");
    if(old) old.remove();

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href + "?v=" + Date.now();
    link.setAttribute("data-onion-style","true");

    link.onload = ()=>{
      Onion.state.currentStyle = href;
      resolve();
    };

    document.head.appendChild(link);

  });

};


/* =========================
   AUTH
========================= */

function getToken(){
  const t = localStorage.getItem("onion_token");
  if(!t) throw new Error("NO_TOKEN");
  return t;
}

function redirectLogin(){
  window.location.href = "/es/acceso/";
}


/* =========================
   FETCH
========================= */

Onion.fetch = async function(url){

  const controller = new AbortController();
  const id = setTimeout(()=>controller.abort(), Onion.config.TIMEOUT);

  try{

    const res = await fetch(url,{
      headers:{
        Authorization: "Bearer " + getToken()
      },
      signal: controller.signal
    });

    if(res.status === 401){
      throw new Error("401");
    }

    const json = await res.json();

    if(!res.ok){
      throw new Error("HTTP " + res.status);
    }

    return json;

  }catch(e){

    if(e.name === "AbortError") throw new Error("TIMEOUT");
    throw e;

  }finally{
    clearTimeout(id);
  }

};


/* =========================
   UI
========================= */

Onion.ui = {};

Onion.ui.loading = function(){
  const app = document.getElementById("app-content");
  if(app) app.innerHTML = "<div style='padding:20px'>Cargando...</div>";
};

Onion.ui.hideLoader = function(){
  const el = document.getElementById("app-loader");
  if(el){
    el.classList.add("hide");
    setTimeout(()=>el.remove(),300);
  }
  document.body.classList.remove("loading");
};


/* =========================
   USER
========================= */

Onion.setUser = function(user){
  Onion.state.user = user;
  Onion.state.slug = user.slug;

  if(user.slug){
    localStorage.setItem("onion_slug", user.slug);
  }
};


/* =========================
   SLUG (LIMPIO)
========================= */

Onion.slug = {};

Onion.slug.apply = function(slug){

  if(!slug) return;

  let path = window.location.pathname || "/";

  // si ya tiene slug → no tocar
  if(path.startsWith("/@")) return;

  // limpiar base
  if(path.startsWith("/es/acceso/admin")){
    path = path.replace("/es/acceso/admin", "") || "/";
  }

  const final = "/@" + slug + (path === "/" ? "" : path);

  window.history.replaceState({}, "", final);
};


/* =========================
   ROUTES
========================= */

Onion.routes = {
  "/": "/es/acceso/admin/pages/index.html",
  "/incidencias": "/es/acceso/admin/pages/incidencias/index.html",
  "/facturas": "/es/acceso/admin/pages/facturas/index.html",
  "/cuenta": "/es/acceso/admin/pages/cuenta/index.html"
};

Onion.styles = {
  "/": "/css/acceso/admin/pages/home.css",
  "/incidencias": "/css/acceso/admin/pages/incidencias/incidencias.css",
  "/facturas": "/css/acceso/admin/pages/facturas/facturas.css",
  "/cuenta": "/css/acceso/admin/pages/cuenta/cuenta.css"
};

Onion.scripts = {
  "/": "/js/acceso/admin/pages/home.js",
  "/incidencias": "/js/acceso/admin/pages/incidencias/incidencias.js",
  "/facturas": "/js/acceso/admin/pages/facturas/facturas.js",
  "/cuenta": "/js/acceso/admin/pages/cuenta/cuenta.js"
};

Onion.titles = {
  "/": "Panel",
  "/incidencias": "Incidencias",
  "/facturas": "Facturas",
  "/cuenta": "Cuenta"
};


/* =========================
   ROUTER
========================= */

Onion.router = {};

Onion.router.get = function(){

  let path = window.location.pathname || "/";

  // quitar slug
  if(path.startsWith("/@")){
    const parts = path.split("/").filter(Boolean);
    path = "/" + (parts.slice(1).join("/") || "");
  }

  // quitar base
  if(path.startsWith("/es/acceso/admin")){
    path = path.replace("/es/acceso/admin", "") || "/";
  }

  path = path.replace(/\/+/g, "/");

  if(path.length > 1 && path.endsWith("/")){
    path = path.slice(0, -1);
  }

  return path || "/";
};


Onion.router.resolve = function(){
  const route = Onion.router.get();
  return Onion.routes[route] || Onion.routes["/"];
};


/* =========================
   NAV
========================= */

Onion.go = function(path){

  if(!Onion.state.slug) return;

  // 🔥 normalizar path entrada
  const clean = path.startsWith("/") ? path : "/" + path;
  const url = "/@" + Onion.state.slug + clean;

  // 🔥 función interna para normalizar
  function normalize(p){
    p = p.replace(/\/+/g, "/");
    if(p.length > 1 && p.endsWith("/")){
      p = p.slice(0, -1);
    }
    return p || "/";
  }

  const current = normalize(window.location.pathname);
  const target = normalize(url);

  // 🔥 misma ruta → forzar render limpio
  if(current === target){

    Onion.state.currentScript = null;
    Onion.state.currentStyle = null;
    Onion.cache.html = {};

    const app = document.getElementById("app-content");
    if(app) app.innerHTML = "";

    if(Onion.state.rendering){
      setTimeout(()=> Onion.render(), 50);
    } else {
      Onion.render();
    }

    return;
  }

  // 🔥 navegación normal
  window.history.pushState({}, "", url);
  window.dispatchEvent(new Event("onion:navigate"));

};


/* =========================
   LINKS
========================= */

document.addEventListener("click",(e)=>{

  let el = e.target;

  while(el && el !== document){

    if(el.tagName === "A" && el.hasAttribute("data-link")){

      const href = el.getAttribute("href");
      const force = el.hasAttribute("data-force");

      if(!href || href.startsWith("http")) return;

      e.preventDefault();

      // 🔥 FORZAR recarga total si tiene data-force
      if(force){
        Onion.state.currentScript = null;
        Onion.state.currentStyle = null;
        Onion.cache.html = {};
      }

      Onion.go(href);
      return;
    }

    el = el.parentNode;
  }

});


/* =========================
   RENDER
========================= */

Onion.render = async function(){

  // 🔥 anti race condition
  const renderId = ++Onion.state.renderId;

  if(Onion.state.rendering){
    console.warn("⛔ Render en curso, reintentando...");
    setTimeout(()=> Onion.render(), 50);
    return;
  }

  Onion.state.rendering = true;

  try{

    const app = document.getElementById("app-content");
    if(!app) return;

    Onion.ui.loading();

    const route = Onion.router.get();
    const url = Onion.router.resolve();

    console.log("🚀 RENDER:", { route, url });

    /* =========================
       STYLE
    ========================= */

    const style = Onion.styles[route] || Onion.styles["/"];

    if(style){
      await Onion.loadStyle(style);
    }

    /* =========================
       HTML
    ========================= */

    let html;

    // 🔥 HOME sin cache
    if(route === "/"){

      const res = await fetch(url + "?v=" + Date.now());
      if(!res.ok) throw new Error("PAGE_LOAD_ERROR " + res.status);
      html = await res.text();

    }else{

      html = Onion.cache.html[url];

      if(!html){
        const res = await fetch(url);
        if(!res.ok) throw new Error("PAGE_LOAD_ERROR " + res.status);
        html = await res.text();
        Onion.cache.html[url] = html;
      }

    }

    // 🔥 si este render ya no es el actual → abortar
    if(renderId !== Onion.state.renderId){
      console.warn("⚠️ Render obsoleto cancelado");
      return;
    }

    /* =========================
       DOM
    ========================= */

    const container = document.createElement("div");
    container.innerHTML = html;

    const content = container.querySelector(".panel-content");

    // 🔥 limpieza REAL antes de pintar
    app.innerHTML = "";
    app.appendChild(content || container);

    /* =========================
       SCRIPT
    ========================= */

    const script = Onion.scripts[route] || Onion.scripts["/"];

    if(script){

      Onion.state.currentScript = null; // 🔥 fuerza reload

      await Onion.loadScript(script);
    }

    if(renderId !== Onion.state.renderId){
      console.warn("⚠️ Render cancelado tras script");
      return;
    }

   /* =========================
      UI POST RENDER
   ========================= */
   
   try {
   
     if (typeof window.renderSidebar === "function") {
       window.renderSidebar();
     }
   
     if (typeof window.updateSidebarActive === "function") {
       window.updateSidebarActive();
     }
   
     if (typeof window.renderTopbar === "function") {
       window.renderTopbar();
     }
   
     document.body.classList.remove("loading");
   
   } catch (uiError) {
   
     console.error("⚠️ UI POST RENDER ERROR:", uiError);
   
   }
   
   
   /* =========================
      ERROR HANDLING (RENDER)
   ========================= */
   
   } catch (e) {
   
     console.error("💥 RENDER ERROR:", e);
   
     const app = document.getElementById("app-content");
   
     if (app) {
       app.innerHTML = `
         <div style="padding:20px">
           <h2>Error cargando página</h2>
           <p>Intenta recargar.</p>
         </div>
       `;
     }
   
   } finally {
   
     Onion.state.rendering = false;
   
   };
   
         
      /* =========================
         INIT
      ========================= */
      
      Onion.init = async function () {
      
        try {
      
          const res = await Onion.fetch(Onion.config.API + "/auth/me");
          const user = res.user || res;
      
          Onion.setUser(user);
          Onion.slug.apply(user.slug);
      
          window.addEventListener("onion:navigate", Onion.render);
      
          window.addEventListener("popstate", () => {
            Onion.render();
          });
      
          await Onion.render();
      
          Onion.ui.hideLoader();
      
        } catch (e) {
      
          console.error("💥 INIT ERROR:", e);
      
          if (e.message === "401" || e.message === "NO_TOKEN") {
            redirectLogin();
            return;
          }
      
          const app = document.getElementById("app-content");
      
          if (app) {
            app.innerHTML = `
              <div style="padding:20px">
                <h2>Error inicializando</h2>
                <p>Intenta recargar.</p>
              </div>
            `;
          }
      
        }
      
      };
      
      
      /* =========================
         BOOT
      ========================= */
      
      Onion.init();

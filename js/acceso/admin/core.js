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
  currentStyle: null
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

    if(Onion.state.currentScript === finalSrc){
      return resolve();
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
  const app = document.getElementById("app-view");
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
  "/facturas": "/es/acceso/admin/pages/facturas/index.html"
};

Onion.styles = {
  "/": "/css/acceso/admin/pages/home.css",
  "/incidencias": "/css/acceso/admin/pages/incidencias/incidencias.css",
  "/facturas": "/css/acceso/admin/pages/facturas/facturas.css"
};

Onion.scripts = {
  "/": "/js/acceso/admin/pages/home.js",
  "/incidencias": "/js/acceso/admin/pages/incidencias/incidencias.js",
  "/facturas": "/js/acceso/admin/pages/facturas/facturas.js"
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

  const clean = path.startsWith("/") ? path : "/" + path;
  const url = "/@" + Onion.state.slug + clean;

  const current = window.location.pathname;

  if(current === url){
    window.dispatchEvent(new Event("onion:navigate"));
    return;
  }

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

      if(!href || href.startsWith("http")) return;

      e.preventDefault();
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

  if(Onion.state.rendering) return;
  Onion.state.rendering = true;

  try{

    const app = document.getElementById("app-view");
    if(!app) return;

    Onion.ui.loading();

    const route = Onion.router.get();
    const url = Onion.router.resolve();

    const style = Onion.styles[route] || Onion.styles["/"];
    if(style){
      await Onion.loadStyle(style);
    }

let html;

// 🔥 SI ES HOME → NO CACHEAR NUNCA
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

    const container = document.createElement("div");
    container.innerHTML = html;

    const content = container.querySelector(".panel-content");

    app.innerHTML = "";
    app.appendChild(content || container);

    // 🔥 1. CARGAR SCRIPT PRIMERO
    const script = Onion.scripts[route] || Onion.scripts["/"];
    
    if(script){

      // 🔥 FORZAR recarga del script SIEMPRE
      Onion.state.currentScript = null;

      await Onion.loadScript(script);
    }

    // 🔥 2. DESPUÉS ejecutar lógica dependiente del JS
    if(window.renderSidebar){
      window.renderSidebar();
    }

    if(window.updateSidebarActive){
      window.updateSidebarActive();
    }

    document.body.classList.remove("loading");

  }catch(e){

    console.error("💥 RENDER ERROR:", e);

    const app = document.getElementById("app-view");
    if(app){
      app.innerHTML = `
        <div style="padding:20px">
          <h2>Error cargando página</h2>
          <p>Intenta recargar.</p>
        </div>
      `;
    }

  }

  Onion.state.rendering = false;
};


/* =========================
   INIT
========================= */

(async function(){

  try{

    const res = await Onion.fetch(Onion.config.API + "/auth/me");
    const user = res.user || res;

    Onion.setUser(user);
    Onion.slug.apply(user.slug);

    await Onion.render();

    window.addEventListener("onion:navigate", Onion.render);

    Onion.ui.hideLoader();

  }catch(e){

    console.error("INIT ERROR:", e);

    if(e.message === "401" || e.message === "NO_TOKEN"){
      redirectLogin();
    }

  }

})();

})();

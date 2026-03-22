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
   EVENTS (GLOBAL BUS)
========================= */

Onion.events = {

  emit(name, detail = {}){
    window.dispatchEvent(new CustomEvent(name, { detail }));
  },

  on(name, handler){
    window.addEventListener(name, handler);
  },

  off(name, handler){
    window.removeEventListener(name, handler);
  }

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

    s.async = false;
    s.setAttribute("data-onion-page","true");

    s.onload = ()=>{
      Onion.state.currentScript = finalSrc;
      resolve();
    };

    s.onerror = ()=>{
      reject(new Error("Script load fail: " + finalSrc));
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
   FETCH JSON
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
   FETCH HTML
========================= */

Onion.fetchHTML = async function(url, useCache = true){

  if(useCache && Onion.cache.html[url]){
    return Onion.cache.html[url];
  }

  if(Onion.state.abortController){
    Onion.state.abortController.abort();
  }

  Onion.state.abortController = new AbortController();

  const res = await fetch(url, {
    signal: Onion.state.abortController.signal
  });

  if(!res.ok){
    throw new Error("PAGE_LOAD_ERROR " + res.status);
  }

  const html = await res.text();

  if(useCache){
    Onion.cache.html[url] = html;
  }

  return html;

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

  const prev = Onion.state.user;

  Onion.state.user = user;
  Onion.state.slug = user?.slug || null;

  if(user?.slug){
    localStorage.setItem("onion_slug", user.slug);
  } else {
    localStorage.removeItem("onion_slug");
  }

  Onion.events.emit("user:changed", {
    prev,
    current: user
  });

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


/* =========================
   ROUTER
========================= */

Onion.router = {};

Onion.router.get = function(){

  let path = window.location.pathname || "/";

  if(path.startsWith("/@")){
    const parts = path.split("/").filter(Boolean);
    path = "/" + (parts.slice(1).join("/") || "");
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

  if(!Onion.state.slug){
    console.warn("No slug yet");
    return;
  }

  const clean = path.startsWith("/") ? path : "/" + path;
  const current = Onion.router.get();

  // 🔥 evitar navegación inútil
  if(current === clean){
    console.warn("🔁 Ya estás en esta ruta");
    return;
  }

  // 🔥 bloquear navegación múltiple
  if(Onion.state.navigating){
    console.warn("⛔ Navegación en curso");
    return;
  }

  Onion.state.navigating = true;

  // 🔥 cerrar search
  Onion.events.emit("nav:search:close");

  // 🔥 limpiar cosas globales
  Onion.events.emit("nav:cleanup");

  const url = "/@" + Onion.state.slug + clean;

  window.history.pushState({}, "", url);

  // 🔥 trigger render
  Onion.events.emit("nav:change");

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
   RENDER (PRO)
========================= */

Onion.render = async function(){

  const renderId = ++Onion.state.renderId;

  // 🔥 cancelar render anterior si sigue vivo
  if(Onion.state.abortController){
    Onion.state.abortController.abort();
  }

  Onion.state.rendering = true;

  try{

    const app = document.getElementById("app-content");
    if(!app){
      console.warn("No #app-content");
      return;
    }

    Onion.ui.loading();

    const route = Onion.router.get();
    const url = Onion.router.resolve();

    // 🔥 cargar CSS (no bloqueante duro)
    const style = Onion.styles[route];
    if(style){
      try{
        await Onion.loadStyle(style);
      }catch(e){
        console.error("💥 STYLE ERROR:", e);
      }
    }

    // 🔥 fetch HTML
    let html;
    try{
      html = await Onion.fetchHTML(url, route !== "/");
    }catch(e){
      throw new Error("Error cargando HTML: " + e.message);
    }

    if(!html){
      throw new Error("HTML vacío");
    }

    // 🔥 evitar race condition
    if(renderId !== Onion.state.renderId){
      console.warn("Render obsoleto ignorado");
      return;
    }

    const container = document.createElement("div");
    container.innerHTML = html;

    // 🔥 fallback si falta .panel-content
    let content = container.querySelector(".panel-content");

    if(!content){
      console.warn("⚠️ .panel-content no encontrado, usando fallback");
      content = container;
    }

    // 🔥 pintar
    app.innerHTML = "";
    app.appendChild(content);

    // 🔥 cargar script sin romper UI
    const script = Onion.scripts[route];
    if(script){
      try{
        await Onion.loadScript(script);
      }catch(err){
        console.error("💥 SCRIPT ERROR:", err);
      }
    }

    // 🔥 evento ready
    try{
      Onion.events.emit("nav:ready");
    }catch(e){
      console.error("nav:ready error", e);
    }

    // 🔥 UI global protegida
    try{
      if(typeof window.renderSidebar === "function"){
        window.renderSidebar();
      }
    }catch(e){
      console.error("Sidebar error", e);
    }

    try{
      if(typeof window.updateSidebarActive === "function"){
        window.updateSidebarActive();
      }
    }catch(e){
      console.error("Sidebar active error", e);
    }

    try{
      if(typeof window.renderTopbar === "function"){
        window.renderTopbar();
      }
    }catch(e){
      console.error("Topbar error", e);
    }

  }catch(e){

    console.error("💥 RENDER ERROR:", e);

    const app = document.getElementById("app-content");

    if(app){
      app.innerHTML = `
        <div style="padding:20px">
          <h2>Error cargando página</h2>
          <p>${e.message}</p>
          <button onclick="Onion.render()">Reintentar</button>
        </div>
      `;
    }

  } finally {

    Onion.state.rendering = false;

  }

};

/* =========================
   INIT
========================= */

Onion.init = async function(){

  try{

    // 🔥 1. Obtener usuario
    const res = await Onion.fetch(Onion.config.API + "/auth/me");
    const user = res.user || res;

    // 🔥 2. Guardar usuario
    Onion.setUser(user);

    // 🔥 3. Evitar duplicar eventos (MUY IMPORTANTE)
    Onion.events.off("nav:change", Onion.render);
    window.removeEventListener("popstate", Onion.render);

    Onion.events.on("nav:change", Onion.render);
    window.addEventListener("popstate", Onion.render);

    // 🔥 4. Primer render
    await Onion.render();

  } catch(e){

    console.error("💥 INIT ERROR:", e);

    // 🔐 Auth fallback
    if(e.message === "401" || e.message === "NO_TOKEN"){
      redirectLogin();
      return;
    }

    // 💥 UI error visible
    const app = document.getElementById("app-content");

    if(app){
      app.innerHTML = `
        <div style="padding:20px">
          <h2>Error inicializando</h2>
          <p>${e.message}</p>
          <button onclick="location.reload()">Reintentar</button>
        </div>
      `;
    }

  } finally {

    // 🔥 SIEMPRE quitar loader pase lo que pase
    Onion.ui.hideLoader();

  }

};


/* =========================
   BOOT
========================= */

Onion.init();

})();

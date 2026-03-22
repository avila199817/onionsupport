(function(){

"use strict";

/* =========================
   INIT GUARD (ANTI DUPLICADO)
========================= */

if(window.Onion){
  console.warn("⚠️ Onion ya inicializado");
  return;
}

/* =========================
   CORE OBJECT
========================= */

const Onion = {};
window.Onion = Onion;

/* =========================
   VERSION (DEBUG PRO)
========================= */

Onion.version = "1.0.0";

/* =========================
   CONFIG
========================= */

Onion.config = {

  API: "https://api.onionit.net/api",
  TIMEOUT: 10000,

  DEBUG: true, // 🔥 luego podrás apagar logs
  ENV: "production" // 🔥 preparado para futuro

};

/* =========================
   LOGGER (PRO)
========================= */

Onion.log = function(...args){
  if(Onion.config.DEBUG){
    console.log("🧅", ...args);
  }
};

Onion.warn = function(...args){
  if(Onion.config.DEBUG){
    console.warn("⚠️", ...args);
  }
};

Onion.error = function(...args){
  console.error("💥", ...args);
};

/* =========================
   STATE (PRO)
========================= */

Onion.state = {

  // 🔐 usuario
  user: null,

  // 🔗 slug persistente
  slug: localStorage.getItem("onion_slug") || null,

  // 🔄 control de render
  rendering: false,
  navigating: false,
  renderId: 0,

  // 📦 recursos actuales
  currentScript: null,
  currentStyle: null,

  // 🌐 control de requests
  abortController: null,

  // 🧹 cleanup de páginas (MUY IMPORTANTE)
  cleanup: [],

  // ⚡ estado interno (futuro)
  ready: false,

};


/* =========================
   CACHE (PRO)
========================= */

Onion.cache = {

  html: Object.create(null), // 🔥 sin prototype (más seguro)

};













   

/* =========================
   EVENTS (GLOBAL BUS PRO)
========================= */

Onion.events = {

  /* =========================
     EMIT
  ========================= */

  emit(name, detail = {}){

    try{

      if(!name){
        Onion.warn("Evento sin nombre");
        return;
      }

      const event = new CustomEvent(name, { detail });

      window.dispatchEvent(event);

      Onion.log("📡 emit:", name, detail);

    }catch(e){
      Onion.error("emit error:", name, e);
    }

  },

  /* =========================
     ON
  ========================= */

  on(name, handler){

    if(!name || typeof handler !== "function"){
      Onion.warn("on inválido:", name);
      return;
    }

    const wrapped = (e) => {
      try{
        handler(e.detail, e);
      }catch(err){
        Onion.error("event handler error:", name, err);
      }
    };

    // 🔥 guardar referencia para poder limpiar luego
    handler.__onionWrapped = wrapped;

    window.addEventListener(name, wrapped);

    // 🔥 auto cleanup (CLAVE)
    Onion.onCleanup(()=>{
      window.removeEventListener(name, wrapped);
    });

  },

  /* =========================
     OFF
  ========================= */

  off(name, handler){

    if(!name || !handler) return;

    const wrapped = handler.__onionWrapped || handler;

    window.removeEventListener(name, wrapped);

  }

};











   

/* =========================
   LOAD SCRIPT (PRO)
========================= */

Onion.loadScript = function(src){

  return new Promise((resolve, reject)=>{

    if(!src){
      Onion.warn("loadScript sin src");
      return resolve();
    }

    let finalSrc;

    try{

      if(src.startsWith("/")){
        finalSrc = window.location.origin + src;
      }else if(src.startsWith("http")){
        finalSrc = src;
      }else{
        finalSrc = window.location.origin + "/" + src.replace(/^\/+/,"");
      }

    }catch(e){
      Onion.error("URL parse error:", src);
      return reject(e);
    }

    // 🔥 evitar recargar mismo script
    if(Onion.state.currentScript === finalSrc){
      Onion.log("⚡ Script ya cargado:", finalSrc);
      return resolve();
    }

    // 🔥 eliminar script anterior
    const old = document.querySelector("script[data-onion-page]");
    if(old){
      try{
        old.remove();
      }catch(e){
        Onion.warn("Error eliminando script anterior");
      }
    }

    const s = document.createElement("script");

    s.src = finalSrc + "?v=" + Date.now();
    s.defer = true;
    s.async = false;

    s.setAttribute("data-onion-page","true");

    // 🔥 timeout protección
    const timeout = setTimeout(()=>{
      Onion.error("⏱️ Script timeout:", finalSrc);
      s.remove();
      reject(new Error("SCRIPT_TIMEOUT"));
    }, Onion.config.TIMEOUT);

    s.onload = ()=>{

      clearTimeout(timeout);

      Onion.state.currentScript = finalSrc;

      Onion.log("✅ Script cargado:", finalSrc);

      resolve();

    };

    s.onerror = ()=>{

      clearTimeout(timeout);

      Onion.error("💥 Script load fail:", finalSrc);

      s.remove();

      reject(new Error("SCRIPT_LOAD_FAIL"));

    };

    document.body.appendChild(s);

  });

};








   /* =========================
   LOAD STYLE (PRO)
========================= */

Onion.loadStyle = function(href){

  return new Promise((resolve)=>{

    if(!href){
      Onion.warn("loadStyle sin href");
      return resolve();
    }

    // 🔥 evitar recargar mismo estilo
    if(Onion.state.currentStyle === href){
      Onion.log("⚡ Style ya cargado:", href);
      return resolve();
    }

    let finalHref;

    try{

      if(href.startsWith("/")){
        finalHref = window.location.origin + href;
      }else if(href.startsWith("http")){
        finalHref = href;
      }else{
        finalHref = window.location.origin + "/" + href.replace(/^\/+/,"");
      }

    }catch(e){
      Onion.error("Style URL error:", href);
      return resolve(); // no romper render
    }

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = finalHref + "?v=" + Date.now();
    link.setAttribute("data-onion-style","true");

    // 🔥 timeout protección
    const timeout = setTimeout(()=>{
      Onion.warn("⏱️ Style timeout:", finalHref);
      resolve(); // no romper app
    }, Onion.config.TIMEOUT);

    link.onload = ()=>{

      clearTimeout(timeout);

      // 🔥 eliminar estilo anterior SOLO cuando el nuevo está listo
      const old = document.querySelector("link[data-onion-style]");
      if(old && old !== link){
        try{
          old.remove();
        }catch(e){
          Onion.warn("Error eliminando style anterior");
        }
      }

      Onion.state.currentStyle = href;

      Onion.log("🎨 Style cargado:", href);

      resolve();

    };

    link.onerror = ()=>{

      clearTimeout(timeout);

      Onion.error("💥 Style load fail:", finalHref);

      link.remove();

      resolve(); // 🔥 no romper render por CSS

    };

    document.head.appendChild(link);

  });

};




   /* =========================
   AUTH (PRO)
========================= */

Onion.auth = {};

/* =========================
   GET TOKEN
========================= */

Onion.auth.getToken = function(){

  try{

    const token = localStorage.getItem("onion_token");

    if(!token){
      throw new Error("NO_TOKEN");
    }

    return token;

  }catch(e){

    Onion.warn("Token no disponible");

    throw e;

  }

};


/* =========================
   SET TOKEN
========================= */

Onion.auth.setToken = function(token){

  if(!token){
    Onion.warn("Intento de guardar token vacío");
    return;
  }

  localStorage.setItem("onion_token", token);

  Onion.log("🔐 Token guardado");

};


/* =========================
   CLEAR TOKEN
========================= */

Onion.auth.clearToken = function(){

  localStorage.removeItem("onion_token");

  Onion.log("🧹 Token eliminado");

};


/* =========================
   REDIRECT LOGIN
========================= */

Onion.auth.redirectLogin = function(){

  Onion.warn("🔐 Redirigiendo a login");

  window.location.replace("/es/acceso/");

};









   

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
   FETCH HTML (PRO)
========================= */

Onion.fetchHTML = async function(url, useCache = true){

  // 🔥 cache hit
  if(useCache && Onion.cache.html[url]){
    return Onion.cache.html[url];
  }

  // 🔥 abort request anterior
  if(Onion.state.abortController){
    try{
      Onion.state.abortController.abort();
    }catch(e){
      console.warn("Abort error ignorado");
    }
  }

  const controller = new AbortController();
  Onion.state.abortController = controller;

  // 🔥 timeout manual
  const timeout = setTimeout(()=>{
    controller.abort();
  }, Onion.config.TIMEOUT);

  try{

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "X-Requested-With": "XMLHttpRequest" // 🔥 útil para backend
      }
    });

    if(!res.ok){
      throw new Error("PAGE_LOAD_ERROR " + res.status);
    }

    const html = await res.text();

    if(!html || html.trim().length === 0){
      throw new Error("EMPTY_HTML");
    }

    // 🔥 guardar en cache
    if(useCache){
      Onion.cache.html[url] = html;
    }

    return html;

  }catch(e){

    // 🔥 abort normal (no error real)
    if(e.name === "AbortError"){
      console.warn("⚠️ Fetch abortado (normal en SPA)");
      return null;
    }

    console.error("💥 FETCH HTML ERROR:", e);
    throw e;

  }finally{
    clearTimeout(timeout);
  }

};
   

/* =========================
   UI (PRO)
========================= */

Onion.ui = {};

/* =========================
   OVERLAY LOADING (SUAVE)
========================= */

Onion.ui.loading = function(){

  let overlay = document.getElementById("onion-overlay");

  // 🔥 ya existe → no duplicar
  if(overlay) return;

  overlay = document.createElement("div");
  overlay.id = "onion-overlay";

  overlay.style.position = "fixed";
  overlay.style.top = "0";
  overlay.style.left = "0";
  overlay.style.width = "100%";
  overlay.style.height = "100%";
  overlay.style.background = "rgba(255,255,255,0.35)";
  overlay.style.backdropFilter = "blur(4px)";
  overlay.style.zIndex = "9999";
  overlay.style.opacity = "0";
  overlay.style.transition = "opacity 0.2s ease";

  document.body.appendChild(overlay);

  // 🔥 forzar repaint + fade in
  requestAnimationFrame(()=>{
    overlay.style.opacity = "1";
  });

};

/* =========================
   HIDE OVERLAY
========================= */

Onion.ui.hideOverlay = function(){

  const overlay = document.getElementById("onion-overlay");

  if(!overlay) return;

  overlay.style.opacity = "0";

  setTimeout(()=>{
    if(overlay.parentNode){
      overlay.remove();
    }
  }, 200);

};

/* =========================
   FADE CONTENT (TRANSICIÓN)
========================= */

Onion.ui.swapContent = function(newContent){

  const app = document.getElementById("app-content");
  if(!app) return;

  // 🔥 preparar transición
  app.style.transition = "opacity 0.15s ease";
  app.style.opacity = "0";

  setTimeout(()=>{

    app.innerHTML = "";

    try{
      app.appendChild(newContent);
    }catch(e){
      console.error("💥 swapContent error:", e);
      app.innerHTML = "<div style='padding:20px'>Error renderizando contenido</div>";
    }

    // 🔥 fade in
    requestAnimationFrame(()=>{
      app.style.opacity = "1";
    });

  }, 150);

};

/* =========================
   HIDE INITIAL LOADER
========================= */

Onion.ui.hideLoader = function(){

  const el = document.getElementById("app-loader");

  if(el){
    el.classList.add("hide");

    setTimeout(()=>{
      if(el.parentNode){
        el.remove();
      }
    }, 300);
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
    Onion.ui.swapContent(content);

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
    Onion.state.navigating = false;

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
    Onion.state.navigating = false;
    Onion.ui.hideOverlay();
  }

};


/* =========================
   BOOT
========================= */

Onion.init();

})();

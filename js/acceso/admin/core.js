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

  // ⚡ estado interno
  ready: false,

};


/* =========================
   CLEANUP (PRO)
========================= */

Onion.onCleanup = function(fn){

  if(typeof fn !== "function"){
    Onion.warn("cleanup inválido");
    return;
  }

  Onion.state.cleanup.push(fn);

};


/* =========================
   RUN CLEANUP (CLAVE)
========================= */

Onion.runCleanup = function(){

  try{

    Onion.state.cleanup.forEach(fn => {
      try{
        fn();
      }catch(e){
        Onion.error("💥 cleanup fn error:", e);
      }
    });

  }catch(e){
    Onion.error("💥 cleanup global error:", e);
  }

  Onion.state.cleanup = [];

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
   FETCH JSON (PRO)
========================= */

Onion.fetch = async function(url, options = {}){

  if(!url){
    Onion.warn("fetch sin URL");
    throw new Error("NO_URL");
  }

  const controller = new AbortController();
  const timeout = setTimeout(()=>{
    controller.abort();
  }, Onion.config.TIMEOUT);

  try{

    const headers = Object.assign({
      "Content-Type": "application/json"
    }, options.headers || {});

    // 🔐 auth automática
    try{
      const token = Onion.auth.getToken();
      headers["Authorization"] = "Bearer " + token;
    }catch(e){
      // sin token → sigue (por si hay endpoints públicos)
    }

    const res = await fetch(url, {
      method: options.method || "GET",
      body: options.body ? JSON.stringify(options.body) : undefined,
      headers,
      signal: controller.signal,
      credentials: "include" // 🔥 importante para cookies si usas
    });

    // 🔥 401 → logout automático
    if(res.status === 401){

      Onion.warn("🔐 401 no autorizado");

      Onion.auth.clearToken();
      Onion.auth.redirectLogin();

      throw new Error("401");
    }

    let data;

    try{
      data = await res.json();
    }catch(e){
      throw new Error("INVALID_JSON");
    }

    if(!res.ok){

      const msg = data?.message || ("HTTP " + res.status);

      throw new Error(msg);
    }

    Onion.log("🌐 FETCH OK:", url);

    return data;

  }catch(e){

    if(e.name === "AbortError"){
      Onion.error("⏱️ TIMEOUT:", url);
      throw new Error("TIMEOUT");
    }

    Onion.error("💥 FETCH ERROR:", url, e.message);

    throw e;

  }finally{
    clearTimeout(timeout);
  }

};







   
/* =========================
   FETCH HTML (PRO)
========================= */

Onion.fetchHTML = async function(url, useCache = true){

  if(!url){
    Onion.warn("fetchHTML sin URL");
    return null;
  }

  // 🔥 normalizar URL (consistencia)
  let finalUrl;

  try{

    if(url.startsWith("/")){
      finalUrl = window.location.origin + url;
    }else if(url.startsWith("http")){
      finalUrl = url;
    }else{
      finalUrl = window.location.origin + "/" + url.replace(/^\/+/,"");
    }

  }catch(e){
    Onion.error("URL HTML inválida:", url);
    return null;
  }

  // 🔥 cache hit
  if(useCache && Onion.cache.html[finalUrl]){
    Onion.log("⚡ HTML cache:", finalUrl);
    return Onion.cache.html[finalUrl];
  }

  // 🔥 abort request anterior
  if(Onion.state.abortController){
    try{
      Onion.state.abortController.abort();
    }catch(e){
      Onion.warn("Abort error ignorado");
    }
  }

  const controller = new AbortController();
  Onion.state.abortController = controller;

  const timeout = setTimeout(()=>{
    controller.abort();
  }, Onion.config.TIMEOUT);

  try{

    const res = await fetch(finalUrl, {
      signal: controller.signal,
      headers: {
        "X-Requested-With": "XMLHttpRequest"
      },
      credentials: "include" // 🔥 importante si usas sesión
    });

    // 🔐 redirección login si backend lo fuerza
    if(res.status === 401){
      Onion.warn("🔐 HTML 401");
      Onion.auth.clearToken();
      Onion.auth.redirectLogin();
      return null;
    }

    if(!res.ok){
      throw new Error("PAGE_LOAD_ERROR " + res.status);
    }

    const html = await res.text();

    if(!html || html.trim().length === 0){
      throw new Error("EMPTY_HTML");
    }

    // 🔥 guardar en cache
    if(useCache){
      Onion.cache.html[finalUrl] = html;
    }

    Onion.log("📄 HTML OK:", finalUrl);

    return html;

  }catch(e){

    if(e.name === "AbortError"){
      Onion.log("⚡ Fetch abortado (normal)");
      return null;
    }

    Onion.error("💥 FETCH HTML ERROR:", finalUrl, e.message);

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

  // 🔥 evitar overlay duplicado
  if(document.getElementById("onion-overlay")) return;

  const overlay = document.createElement("div");
  overlay.id = "onion-overlay";

  Object.assign(overlay.style, {
    position: "fixed",
    top: "0",
    left: "0",
    width: "100%",
    height: "100%",
    background: "rgba(255,255,255,0.35)",
    backdropFilter: "blur(4px)",
    zIndex: "9999",
    opacity: "0",
    transition: "opacity 0.2s ease"
  });

  document.body.appendChild(overlay);

  // 🔥 fade in seguro
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
   SWAP CONTENT (SIN FLICKER)
========================= */

Onion.ui.swapContent = function(newContent){

  const app = document.getElementById("app-content");
  if(!app) return;

  // 🔥 evitar transiciones encadenadas
  if(app.__swapping) return;
  app.__swapping = true;

  app.style.transition = "opacity 0.15s ease";
  app.style.opacity = "0";

  setTimeout(()=>{

    try{

      app.innerHTML = "";

      if(newContent){
        app.appendChild(newContent);
      }else{
        app.innerHTML = "<div style='padding:20px'>Contenido vacío</div>";
      }

    }catch(e){

      Onion.error("💥 swapContent error:", e);

      app.innerHTML = "<div style='padding:20px'>Error renderizando contenido</div>";

    }

    requestAnimationFrame(()=>{
      app.style.opacity = "1";
      app.__swapping = false;
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
   USER (PRO)
========================= */

Onion.setUser = function(user){

  const prev = Onion.state.user || null;

  // 🔥 normalizar user
  const next = user || null;

  // 🔥 evitar emitir si no cambia (muy pro)
  const same = JSON.stringify(prev) === JSON.stringify(next);
  if(same){
    Onion.log("👤 User sin cambios");
    return;
  }

  // 🔥 actualizar estado
  Onion.state.user = next;

  // 🔗 gestionar slug de forma centralizada
  const slug = next?.slug || null;
  Onion.state.slug = slug;

  try{
    if(slug){
      localStorage.setItem("onion_slug", slug);
    }else{
      localStorage.removeItem("onion_slug");
    }
  }catch(e){
    Onion.warn("Error guardando slug");
  }

  // 🔥 marcar app ready si hay user
  if(next){
    Onion.state.ready = true;
  }

  Onion.log("👤 User actualizado:", next);

  // 🔥 evento global
  Onion.events.emit("user:changed", {
    prev,
    current: next
  });

};






   
/* =========================
   ROUTES (PRO)
========================= */

Onion.routes = {

  "/": {
    page: "/es/acceso/admin/pages/index.html",
    style: "/css/acceso/admin/pages/home.css",
    script: "/js/acceso/admin/pages/home.js"
  },

  "/incidencias": {
    page: "/es/acceso/admin/pages/incidencias/index.html",
    style: "/css/acceso/admin/pages/incidencias/incidencias.css",
    script: "/js/acceso/admin/pages/incidencias/incidencias.js"
  },

  "/facturas": {
    page: "/es/acceso/admin/pages/facturas/index.html",
    style: "/css/acceso/admin/pages/facturas/facturas.css",
    script: "/js/acceso/admin/pages/facturas/facturas.js"
  },

  "/cuenta": {
    page: "/es/acceso/admin/pages/cuenta/index.html",
    style: "/css/acceso/admin/pages/cuenta/cuenta.css",
    script: "/js/acceso/admin/pages/cuenta/cuenta.js"
  }

};







/* =========================
   ROUTER (PRO)
========================= */

Onion.router = {};

/* =========================
   GET PATH (NORMALIZADO)
========================= */

Onion.router.get = function(){

  try{

    let path = window.location.pathname || "/";

    // 🔥 quitar slug tipo /@user/...
    if(path.startsWith("/@")){
      const parts = path.split("/").filter(Boolean);
      path = "/" + (parts.slice(1).join("/") || "");
    }

    // 🔥 normalizar barras
    path = path.replace(/\/+/g, "/");

    // 🔥 quitar slash final
    if(path.length > 1 && path.endsWith("/")){
      path = path.slice(0, -1);
    }

    // 🔥 asegurar formato válido
    if(!path.startsWith("/")){
      path = "/" + path;
    }

    return path || "/";

  }catch(e){

    Onion.error("Router get error:", e);

    return "/"; // fallback seguro

  }

};


/* =========================
   RESOLVE ROUTE
========================= */

Onion.router.resolve = function(){

  const route = Onion.router.get();

  const config = Onion.routes[route];

  if(config){
    Onion.log("🧭 Route:", route);
    return config;
  }

  // 🔥 fallback seguro
  Onion.warn("Ruta no encontrada, fallback a /:", route);

  return Onion.routes["/"];

};










/* =========================
   NAV (PRO)
========================= */

Onion.go = function(path){

  try{

    if(!path){
      Onion.warn("NAV sin path");
      return;
    }

    if(!Onion.state.slug){
      Onion.warn("No slug yet");
      return;
    }

    // 🔥 normalizar path
    let clean = path.startsWith("/") ? path : "/" + path;

    clean = clean.replace(/\/+/g, "/");

    if(clean.length > 1 && clean.endsWith("/")){
      clean = clean.slice(0, -1);
    }

    const current = Onion.router.get();

    // 🔥 evitar navegación inútil
    if(current === clean){
      Onion.log("🔁 Ya estás en esta ruta:", clean);
      return;
    }

    // 🔥 bloquear navegación si render activo
    if(Onion.state.navigating || Onion.state.rendering){
      Onion.warn("⛔ Navegación bloqueada (estado activo)");
      return;
    }

    Onion.state.navigating = true;

    Onion.log("🚀 NAV →", clean);

    // 🔥 cerrar cosas UI
    Onion.events.emit("nav:search:close");

    // 🔥 cleanup REAL (ejecutar funciones registradas)
    try{
      Onion.state.cleanup.forEach(fn => {
        try{ fn(); } catch(e){ Onion.error("Cleanup error", e); }
      });
    }catch(e){
      Onion.error("Cleanup global error", e);
    }

    Onion.state.cleanup = [];

    // 🔥 evento cleanup adicional
    Onion.events.emit("nav:cleanup");

    // 🔥 construir URL final
    const url = "/@" + Onion.state.slug + clean;

    // 🔥 evitar pushState duplicado
    if(window.location.pathname !== url){
      window.history.pushState({}, "", url);
    }

    // 🔥 trigger render
    Onion.events.emit("nav:change");

  }catch(e){

    Onion.error("💥 NAV ERROR:", e);

    Onion.state.navigating = false;

  }

};







/* =========================
   LINKS (PRO)
========================= */

document.addEventListener("click",(e)=>{

  try{

    let el = e.target;

    while(el && el !== document){

      if(el.tagName === "A" && el.hasAttribute("data-link")){

        const href = el.getAttribute("href");

        // 🔥 ignorar sin href
        if(!href){
          Onion.warn("Link sin href");
          return;
        }

        // 🔥 ignorar externos
        if(href.startsWith("http") || href.startsWith("mailto:") || href.startsWith("tel:")){
          return;
        }

        // 🔥 permitir abrir en nueva pestaña
        if(e.ctrlKey || e.metaKey || e.shiftKey || el.target === "_blank"){
          return;
        }

        // 🔥 evitar navegación si ya bloqueado
        if(Onion.state.navigating || Onion.state.rendering){
          Onion.warn("⛔ Click bloqueado (estado activo)");
          e.preventDefault();
          return;
        }

        e.preventDefault();

        Onion.log("🔗 Link click:", href);

        Onion.go(href);

        return;
      }

      el = el.parentNode;
    }

  }catch(err){
    Onion.error("💥 LINKS ERROR:", err);
  }

});








   /* =========================
   RENDER (PRO FINAL)
========================= */

Onion.render = async function(){

  const renderId = ++Onion.state.renderId;

  // 🔥 cancelar fetch anterior
  if(Onion.state.abortController){
    try{
      Onion.state.abortController.abort();
    }catch(e){}
  }

  Onion.state.rendering = true;

  try{

    const app = document.getElementById("app-content");

    if(!app){
      Onion.warn("No #app-content");
      return;
    }

    Onion.ui.loading();

    // 🔥 obtener config de ruta
    const routeConfig = Onion.router.resolve();

    const url = routeConfig.page;
    const style = routeConfig.style;
    const script = routeConfig.script;

    Onion.log("🎯 Render:", url);

    /* =========================
       STYLE
    ========================= */

    if(style){
      try{
        await Onion.loadStyle(style);
      }catch(e){
        Onion.error("STYLE ERROR:", e);
      }
    }

    /* =========================
       HTML
    ========================= */

    let html;

    try{
      html = await Onion.fetchHTML(url, true);
    }catch(e){
      throw new Error("Error cargando HTML: " + e.message);
    }

    if(!html){
      Onion.warn("HTML vacío o abortado");
      return;
    }

    // 🔥 evitar race condition
    if(renderId !== Onion.state.renderId){
      Onion.warn("Render obsoleto ignorado");
      return;
    }

    /* =========================
       PARSE HTML
    ========================= */

    const container = document.createElement("div");
    container.innerHTML = html;

    let content = container.querySelector(".panel-content");

    if(!content){
      Onion.warn(".panel-content no encontrado, usando fallback");
      content = container;
    }

    /* =========================
       SWAP CONTENT
    ========================= */

    Onion.ui.swapContent(content);

    /* =========================
       SCRIPT
    ========================= */

    if(script){
      try{
        await Onion.loadScript(script);
      }catch(err){
        Onion.error("SCRIPT ERROR:", err);
      }
    }

    /* =========================
       EVENT READY
    ========================= */

    Onion.events.emit("nav:ready");

    /* =========================
       UI GLOBAL
    ========================= */

    try{
      Onion.ui.renderSidebar?.();
    }catch(e){
      Onion.error("Sidebar error", e);
    }

    try{
      Onion.ui.updateSidebarActive?.();
    }catch(e){
      Onion.error("Sidebar active error", e);
    }

    try{
      Onion.ui.renderTopbar?.();
    }catch(e){
      Onion.error("Topbar error", e);
    }

  }catch(e){

    Onion.error("💥 RENDER ERROR:", e);

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

    // 🔥 CLAVE → evitar overlay stuck
    Onion.ui.hideOverlay();

  }

};







   /* =========================
   INIT (PRO FINAL)
========================= */

Onion.init = async function(){

  try{

    Onion.log("🚀 INIT START");

    /* =========================
       USER
    ========================= */

    let user = null;

    try{

      const res = await Onion.fetch(Onion.config.API + "/auth/me");
      user = res?.user || res;

      Onion.setUser(user);

    }catch(e){

      // 🔐 auth fallida
      if(e.message === "401" || e.message === "NO_TOKEN"){
        Onion.warn("No autenticado");
        Onion.auth.redirectLogin();
        return;
      }

      Onion.error("Error obteniendo usuario:", e);
      throw e;

    }

    /* =========================
       EVENTS SPA
    ========================= */

    // 🔥 evitar duplicados
    Onion.events.off("nav:change", Onion.render);
    window.removeEventListener("popstate", Onion.render);

    Onion.events.on("nav:change", Onion.render);
    window.addEventListener("popstate", Onion.render);

    /* =========================
       FIRST RENDER
    ========================= */

    await Onion.render();

    /* =========================
       READY
    ========================= */

    Onion.state.ready = true;

    Onion.log("✅ INIT READY");

  }catch(e){

    Onion.error("💥 INIT ERROR:", e);

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

    // 🔥 limpieza SIEMPRE
    Onion.ui.hideLoader();
    Onion.ui.hideOverlay();

    Onion.state.navigating = false;
    Onion.state.rendering = false;

  }

};


/* =========================
   BOOT (PRO)
========================= */

(function boot(){

  try{

    Onion.log("🧅 BOOT");

    // 🔥 esperar DOM listo (seguro)
    if(document.readyState === "loading"){

      document.addEventListener("DOMContentLoaded", ()=>{
        Onion.init();
      }, { once: true });

    } else {

      Onion.init();

    }

  }catch(e){

    Onion.error("💥 BOOT ERROR:", e);

  }

})();

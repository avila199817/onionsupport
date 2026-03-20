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

    s.onerror = reject;

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

   if(path.startsWith("/es")){
     path = path.replace("/es", "");
   }

  path = path.split("?")[0];
  path = path.split("#")[0];

  path = path.replace(/\/+/g, "/");

  // 🔥 soporte /@usuario y /@usuario/subruta
  if(path.startsWith("/@")){
    const parts = path.split("/");
    return parts[2] ? "/" + parts[2] : "/";
  }

  if(path.length > 1 && path.endsWith("/")){
    path = path.slice(0, -1);
  }

  if(!path || path === ""){
    path = "/";
  }

  return path;
};


Onion.router.resolve = function(){

  const route = Onion.router.get();

  if(Onion.routes[route]){
    return Onion.routes[route];
  }

  return Onion.routes["/"];
};


/* =========================
   NAV
========================= */

Onion.go = function(path){

  let clean = path.startsWith("/") ? path : "/" + path;

  if(Onion.state.user){
    const username = (Onion.state.user.username || "usuario").toLowerCase();

    if(clean === "/"){
      clean = "/@" + username;
    } else {
      clean = "/@" + username + clean;
    }
  }

  window.history.pushState({}, "", clean);
  window.dispatchEvent(new Event("onion:navigate"));

};

window.addEventListener("popstate", ()=>{
  window.dispatchEvent(new Event("onion:navigate"));
});


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

    let html = Onion.cache.html[url];

    if(!html){
      const res = await fetch(url);
      if(!res.ok) throw new Error("PAGE_LOAD_ERROR " + res.status);
      html = await res.text();
      Onion.cache.html[url] = html;
    }

    const container = document.createElement("div");
    container.innerHTML = html;

    const content = container.querySelector(".panel-content");

    app.innerHTML = "";
    app.appendChild(content || container);

    await Onion.loadScript("/js/acceso/admin/pages/components/sidebar.js");

    if(window.renderSidebar){
      window.renderSidebar();
    }

    if(window.updateSidebarActive){
      window.updateSidebarActive();
    }

    const script = Onion.scripts[route] || Onion.scripts["/"];
    if(script){
      await Onion.loadScript(script);
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

  console.log("🔥 START");

  try{

    const res = await Onion.fetch(Onion.config.API + "/auth/me");
    const user = res.user || res;

    Onion.setUser(user);

    const username = (user.username || user.name || "usuario").toLowerCase();

    // 🔥 SIEMPRE normaliza URL tras login
    if(!window.location.pathname.startsWith("/@")){
      Onion.go("/");
      return;
    }

    await Onion.render();

    window.addEventListener("onion:navigate", Onion.render);

    Onion.ui.hideLoader();

    console.log("✅ READY");

  }catch(e){

    console.error("💥 INIT ERROR:", e);

    if(e.message === "401" || e.message === "NO_TOKEN"){
      redirectLogin();
    }

  }

})();

})();

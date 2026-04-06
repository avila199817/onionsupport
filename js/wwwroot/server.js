"use strict";

(function(){

/* =========================================================
   🧅 INIT GUARD
========================================================= */

if(window.Onion){
  console.warn("⚠️ Onion ya existe");
  return;
}

const Onion = {};
window.Onion = Onion;

/* =========================================================
   CONFIG
========================================================= */

Onion.config = {
  API: "https://api.onionit.net/api",
  DEBUG: true,
  TIMEOUT: 10000
};

const log = (...a)=> Onion.config.DEBUG && console.log("🧅", ...a);
const warn = (...a)=> Onion.config.DEBUG && console.warn("⚠️", ...a);
const error = (...a)=> console.error("💥", ...a);

/* =========================================================
   STATE (NO FREEZE)
========================================================= */

Onion.state = {
  user: null,
  slug: localStorage.getItem("onion_user_slug"),
  renderId: 0,
  rendering: false,
  cleanup: [],
  abortController: null,
  ready: false
};

/* =========================================================
   SAFE STORAGE
========================================================= */

const safeGet = k=>{ try{return localStorage.getItem(k);}catch{return null;} };
const safeSet = (k,v)=>{ try{localStorage.setItem(k,v);}catch{} };

/* =========================================================
   USER
========================================================= */

Onion.setUser = function(user){

  if(!user) return;

  const u = {
    id: user.id || null,
    username: user.username || "",
    name: user.name || user.username || "Usuario",
    email: user.email || "",
    avatar: user.avatar || null,
    role: user.role || "user",
    permissions: user.permissions || []
  };

  Onion.state.user = u;

  safeSet("onion_user_slug", u.username);
  safeSet("onion_user_name", u.name);
  safeSet("onion_user_avatar", u.avatar || "");

};

/* =========================================================
   CLEANUP SAFE
========================================================= */

Onion.onCleanup = fn=>{
  if(typeof fn==="function"){
    Onion.state.cleanup.push(fn);
  }
};

Onion.cleanupEvent = function(el,type,handler,opt){

  if(!el) return;

  el.addEventListener(type,handler,opt);

  Onion.onCleanup(()=>{
    try{el.removeEventListener(type,handler,opt);}catch{}
  });

};

Onion.runCleanup = function(){

  const list = Onion.state.cleanup;

  for(let i=list.length-1;i>=0;i--){
    try{ list[i](); }catch(e){ warn(e); }
  }

  Onion.state.cleanup = [];

  if(Onion.state.abortController){
    try{Onion.state.abortController.abort();}catch{}
    Onion.state.abortController = null;
  }

};

/* =========================================================
   FETCH (ANTI RACE + TIMEOUT)
========================================================= */

Onion.fetch = async function(url,opt={}){

  if(url.startsWith("/")){
    url = Onion.config.API + url;
  }

  const controller = new AbortController();
  Onion.state.abortController = controller;
  opt.signal = controller.signal;

  const timeout = setTimeout(()=>{
    controller.abort();
  }, Onion.config.TIMEOUT);

  try{

    const headers = opt.headers || {};
    const token = safeGet("onion_token");

    if(token){
      headers["Authorization"] = "Bearer "+token;
    }

    if(opt.body && typeof opt.body==="object"){
      headers["Content-Type"] = "application/json";
      opt.body = JSON.stringify(opt.body);
    }

    const res = await fetch(url,{
      ...opt,
      headers,
      credentials:"include"
    });

    const data = await res.json().catch(()=>null);

    if(!res.ok){
      throw new Error(data?.message || "HTTP "+res.status);
    }

    return data;

  }catch(e){

    if(e.name==="AbortError"){
      throw new Error("ABORTED");
    }

    throw e;

  }finally{
    clearTimeout(timeout);
  }

};

/* =========================================================
   AUTH (NO BLOQUEA)
========================================================= */

Onion.auth = {};

Onion.auth.tryLoadUser = async function(){

  try{
    const res = await Onion.fetch("/auth/me");
    const user = res?.user || res;
    if(user) Onion.setUser(user);
  }catch{
    warn("Auth fallback");
  }

};

/* =========================================================
   ROUTER
========================================================= */

Onion.routes = {
  "/": { page:"/app/views/index.html", title:"Dashboard" }
};

function normalize(p){
  return p.replace(/\/+/g,"/").replace(/\/$/,"") || "/";
}

Onion.router = {};

Onion.router.get = function(){

  let path = location.pathname;

  if(path.startsWith("/@")){
    const parts = path.split("/").slice(2);
    return "/" + (parts.join("/") || "");
  }

  return normalize(path);
};

Onion.router.resolve = function(){
  return Onion.routes[Onion.router.get()] || Onion.routes["/"];
};

Onion.router.navigate = function(path){

  if(typeof path !== "string") return;

  history.pushState({}, "", path);
  Onion.render();

};

window.addEventListener("popstate", Onion.render);

/* =========================================================
   🔌 BRIDGE
========================================================= */

Onion.register = function(type, name, fn){

  if(!Onion[type]) Onion[type] = Object.create(null);

  Onion[type][name] = fn;

  log(`📦 ${type}:${name}`);
};

/* =========================================================
   LOADER CONTROL (CRÍTICO)
========================================================= */

function hideLoader(){

  document.body.classList.remove("loading");

  const el = document.getElementById("app-loader");
  if(el){
    el.style.opacity = "0";
    setTimeout(()=> el.remove(), 200);
  }

}

/* =========================================================
   RENDER (ANTI-RACE + SAFE)
========================================================= */

Onion.render = async function(){

  const renderId = ++Onion.state.renderId;

  try{

    const container = document.getElementById("view-container");
    if(!container) return;

    const route = Onion.router.resolve();

    Onion.runCleanup();

    let html = "";

    try{
      html = await fetch(route.page).then(r=>r.text());
    }catch{
      html = "<div class='panel-content'>Error cargando vista</div>";
    }

    if(renderId !== Onion.state.renderId) return;

    container.innerHTML = html;

    const title = document.getElementById("topbar-title");
    if(title){
      title.textContent = route.title || "Panel";
    }

    if(route.feature && Onion.features?.[route.feature]){
      try{
        Onion.features[route.feature]();
      }catch(e){
        error("Feature crash", e);
      }
    }

  }catch(e){

    error("Render", e);

  }finally{

    hideLoader(); // 🔥 NUNCA PANTALLA NEGRA

  }

};

/* =========================================================
   SPA LINKS
========================================================= */

document.addEventListener("click",(e)=>{

  const link = e.target.closest("[data-spa]");
  if(!link) return;

  const href = link.getAttribute("href");
  if(!href || href.startsWith("http")) return;

  e.preventDefault();

  Onion.router.navigate(href);

});

/* =========================================================
   INIT
========================================================= */

Onion.init = async function(){

  if(Onion.state.ready) return;

  log("INIT...");

  await Onion.auth.tryLoadUser();

  /* =========================================================
     🔒 AUTH GUARD
  ========================================================= */

  if(!Onion.state.user){

    // permitir acceso a /auth
    if(!location.pathname.startsWith("/auth")){
      location.href = "/auth";
      return;
    }

  }

  /* =========================================================
     🔌 BRIDGE LOAD
  ========================================================= */

  const script = document.createElement("script");
  script.src = "/js/wwwroot/router/index.js";
  script.defer = true;

  script.onload = ()=>{
    log("🔌 Bridge cargado");
    Onion.state.ready = true;
    Onion.render();
  };

  script.onerror = ()=>{
    error("💥 Bridge no cargado");
    Onion.render(); // fallback
  };

  document.body.appendChild(script);

};

document.addEventListener("DOMContentLoaded", Onion.init);

/* =========================================================
   LOCK
========================================================= */

Object.freeze(Onion.config);
Object.freeze(Onion.router);

log("🚀 CORE READY");

})();

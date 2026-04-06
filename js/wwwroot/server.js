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
   STATE
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
const safeRemove = k=>{ try{localStorage.removeItem(k);}catch{} };

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

Onion.getUser = function(){

  if(Onion.state.user) return Onion.state.user;

  const username = safeGet("onion_user_slug");

  if(!username) return null;

  return {
    username,
    name: safeGet("onion_user_name"),
    avatar: safeGet("onion_user_avatar")
  };
};

/* =========================================================
   CLEANUP (VIEW SAFE)
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

  if(!Array.isArray(list)) return;

  for(let i=list.length-1;i>=0;i--){
    try{ list[i](); }
    catch(e){ warn("cleanup error", e); }
  }

  Onion.state.cleanup = [];

  if(Onion.state.abortController){
    try{Onion.state.abortController.abort();}catch{}
    Onion.state.abortController = null;
  }

};

/* =========================================================
   FETCH (ANTI RACE)
========================================================= */

Onion.fetch = async function(url,opt={}){

  if(url.startsWith("/")){
    url = Onion.config.API + url;
  }

  let controller = null;

  if(!opt.signal){

    if(Onion.state.abortController){
      try{Onion.state.abortController.abort();}catch{}
    }

    controller = new AbortController();
    Onion.state.abortController = controller;
    opt.signal = controller.signal;
  }

  const timeout = setTimeout(()=>{
    controller?.abort();
  },Onion.config.TIMEOUT);

  try{

    const headers = opt.headers || {};

    const token = localStorage.getItem("onion_token");

    if(token){
      headers["Authorization"] = "Bearer "+token;
    }

    if(opt.body && typeof opt.body==="object"){
      headers["Content-Type"]="application/json";
      opt.body = JSON.stringify(opt.body);
    }

    const res = await fetch(url,{
      ...opt,
      headers,
      credentials:"include"
    });

    let data = null;

    try{ data = await res.json(); }catch{}

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

Onion.auth.getToken = ()=> safeGet("onion_token");

Onion.auth.tryLoadUser = async function(){

  try{
    const res = await Onion.fetch("/auth/me");
    const user = res?.user || res;

    if(user){
      Onion.setUser(user);
    }

  }catch(e){
    warn("Auth fallback (no bloquea)");
  }

};

/* =========================================================
   ROUTER (CON @SLUG)
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

  const current = normalize(location.pathname);
  const next = normalize(path);

  if(current===next) return;

  Onion.state.renderId++;

  history.pushState({}, "", path);

  Onion.render();

};

window.addEventListener("popstate", ()=>{
  Onion.state.renderId++;
  Onion.render();
});

/* =========================================================
   LOADER
========================================================= */

function hideLoader(){

  document.body.classList.remove("loading");

  const el = document.getElementById("app-loader");
  if(el){
    el.style.opacity="0";
    setTimeout(()=> el.remove(),200);
  }

}

/* =========================================================
   FEATURES SAFE EXECUTION
========================================================= */

Onion.features = Object.create(null);

/* =========================================================
   RENDER (BLINDADO)
========================================================= */

Onion.render = async function(){

  if(Onion.state.rendering){
    Onion.state.renderId++;
  }

  const renderId = ++Onion.state.renderId;
  Onion.state.rendering = true;

  try{

    const container = document.getElementById("view-container");
    if(!container) throw new Error("No container");

    const route = Onion.router.resolve();

    if(!route || !route.page){
      throw new Error("Ruta inválida");
    }

    let html = "";

    try{
      html = await fetch(route.page).then(r=>r.text());
    }catch{
      html = "<div class='panel-content'>Error cargando vista</div>";
    }

    if(renderId !== Onion.state.renderId) return;

    Onion.runCleanup();

    container.innerHTML = html;

    requestAnimationFrame(()=>{
      container.classList.add("ready");
    });

    const titleEl = document.getElementById("topbar-title");
    if(titleEl){
      titleEl.textContent = route.title || "Panel";
    }

    /* 🔥 FEATURE SAFE */
    if(route.feature && Onion.features?.[route.feature]){
      try{
        Onion.features[route.feature]();
      }catch(e){
        console.error("💥 Feature crash:", e);
      }
    }

  }catch(e){

    error("Render", e);

  }finally{

    hideLoader();

    if(renderId===Onion.state.renderId){
      Onion.state.rendering=false;
    }

  }

};

/* =========================================================
   SPA LINKS
========================================================= */

document.addEventListener("click",(e)=>{

  const link = e.target.closest("[data-spa]");
  if(!link) return;

  const href = link.getAttribute("href");
  if(!href) return;

  if(href.startsWith("http")) return;

  e.preventDefault();

  Onion.router.navigate(href);

});

/* =========================================================
   INIT (LOCK)
========================================================= */

Onion._booted = false;

Onion.init = async function(){

  if(Onion._booted) return;
  Onion._booted = true;

  if(Onion.state.ready) return;

  log("INIT...");

  await Onion.auth.tryLoadUser();

  Onion.state.ready = true;

  Onion.render();

};

/* =========================================================
   BOOT
========================================================= */

document.addEventListener("DOMContentLoaded", ()=>{
  Onion.init();
});

/* =========================================================
   🔒 CORE FREEZE (INDESTRUCTIBLE)
========================================================= */

Object.freeze(Onion.config);
Object.freeze(Onion.state);
Object.freeze(Onion.auth);
Object.freeze(Onion.router);

/* =========================================================
   READY
========================================================= */

log("🚀 Onion SPA CORE");

})();

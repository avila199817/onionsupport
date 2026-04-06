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
   CLEANUP
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
   FETCH
========================================================= */

Onion.fetch = async function(url,opt={}){

  if(url.startsWith("/")){
    url = Onion.config.API + url;
  }

  const controller = new AbortController();
  Onion.state.abortController = controller;
  opt.signal = controller.signal;

  try{

    const headers = opt.headers || {};
    const token = localStorage.getItem("onion_token");

    if(token){
      headers["Authorization"] = "Bearer "+token;
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

  }

};

/* =========================================================
   AUTH
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
   🔌 BRIDGE (INDEX.JS AUTO)
========================================================= */

Onion.bridge = {
  ready: false,
  queue: []
};

Onion.register = function(type, name, fn){

  if(!Onion[type]) Onion[type] = Object.create(null);

  Onion[type][name] = fn;

  log(`📦 registrado -> ${type}:${name}`);
};

/* =========================================================
   RENDER
========================================================= */

Onion.render = async function(){

  const container = document.getElementById("view-container");
  if(!container) return;

  const route = Onion.router.resolve();

  Onion.runCleanup();

  const html = await fetch(route.page).then(r=>r.text()).catch(()=>"<div>Error</div>");

  container.innerHTML = html;

  document.getElementById("topbar-title").textContent =
    route.title || "Panel";

  /* 🔥 EJECUCIÓN FEATURE */

  if(route.feature && Onion.features?.[route.feature]){
    try{
      Onion.features[route.feature]();
    }catch(e){
      console.error("Feature crash", e);
    }
  }

};

/* =========================================================
   SPA LINKS
========================================================= */

document.addEventListener("click",(e)=>{

  const link = e.target.closest("[data-spa]");
  if(!link) return;

  e.preventDefault();
  Onion.router.navigate(link.getAttribute("href"));

});

/* =========================================================
   INIT
========================================================= */

Onion.init = async function(){

  await Onion.auth.tryLoadUser();

  /* 🔥 CARGAR INDEX.JS (PUENTE) */

  const script = document.createElement("script");
  script.src = "/js/wwwroot/router/index.js";
  script.defer = true;

  script.onload = ()=>{
    log("🔌 Bridge cargado");
    Onion.render();
  };

  document.body.appendChild(script);

};

document.addEventListener("DOMContentLoaded", Onion.init);

/* =========================================================
   LOCK
========================================================= */

Object.freeze(Onion.config);
Object.freeze(Onion.router);

log("🚀 CORE ready");

})();

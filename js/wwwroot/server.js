"use strict";

(function(){

/* =========================================================
   🧅 INIT GUARD
========================================================= */

if(window.Onion){
  console.warn("⚠️ Onion ya inicializado");
  return;
}

const Onion = {};
window.Onion = Onion;

/* =========================================================
   CONFIG
========================================================= */

Onion.config = Object.freeze({
  API: "https://api.onionit.net/api",
  TIMEOUT: 10000,
  DEBUG: true
});

/* =========================================================
   LOGGER
========================================================= */

const log = (...a)=> Onion.config.DEBUG && console.log("🧅", ...a);
const warn = (...a)=> Onion.config.DEBUG && console.warn("⚠️", ...a);
const error = (...a)=> console.error("💥", ...a);

Onion.log = log;
Onion.warn = warn;
Onion.error = error;

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

const safeGet = k => {
  try{ return localStorage.getItem(k); }catch{return null;}
};

const safeSet = (k,v)=>{
  try{ localStorage.setItem(k,v); }catch{}
};

const safeRemove = k=>{
  try{ localStorage.removeItem(k); }catch{}
};

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

Onion.clearUser = function(){

  Onion.state.user = null;

  safeRemove("onion_user_slug");
  safeRemove("onion_user_name");
  safeRemove("onion_user_avatar");

};

/* =========================================================
   CLEANUP (VIEW ONLY 🔥)
========================================================= */

Onion.onCleanup = fn => {
  if(typeof fn === "function"){
    Onion.state.cleanup.push(fn);
  }
};

Onion.cleanupEvent = function(el, type, handler, options){

  if(!el) return;

  el.addEventListener(type, handler, options);

  Onion.onCleanup(()=>{
    try{ el.removeEventListener(type, handler, options); }catch{}
  });

};

Onion.runCleanup = function(){

  const list = Onion.state.cleanup;

  for(let i = list.length - 1; i >= 0; i--){
    try{ list[i](); }catch(e){ warn("cleanup error", e); }
  }

  Onion.state.cleanup.length = 0;

  if(Onion.state.abortController){
    try{ Onion.state.abortController.abort(); }catch{}
    Onion.state.abortController = null;
  }

};

/* =========================================================
   FETCH (SAFE + ABORT)
========================================================= */

Onion.fetch = async function(url, options = {}){

  if(url.startsWith("/")){
    url = Onion.config.API + url;
  }

  let controller = null;

  if(!options.signal){
    if(Onion.state.abortController){
      try{ Onion.state.abortController.abort(); }catch{}
    }

    controller = new AbortController();
    Onion.state.abortController = controller;
    options.signal = controller.signal;
  }

  const timeout = setTimeout(()=>{
    controller?.abort();
  }, Onion.config.TIMEOUT);

  try{

    const headers = options.headers || {};

    const token = localStorage.getItem("onion_token");
    if(token){
      headers["Authorization"] = "Bearer " + token;
    }

    if(options.body && typeof options.body === "object"){
      headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(options.body);
    }

    const res = await fetch(url,{
      ...options,
      headers,
      credentials:"include"
    });

    if(res.status === 401){
      Onion.auth.redirectLogin();
      return null;
    }

    const data = await res.json().catch(()=>null);

    if(!res.ok){
      throw new Error(data?.message || "HTTP "+res.status);
    }

    return data;

  }catch(e){

    if(e.name === "AbortError"){
      throw new Error("ABORTED");
    }

    throw e;

  }finally{
    clearTimeout(timeout);
  }

};

/* =========================================================
   AUTH
========================================================= */

Onion.auth = {};

Onion.auth.getToken = ()=> safeGet("onion_token");

Onion.auth.redirectLogin = function(){
  Onion.clearUser();
  location.replace("/auth");
};

Onion.auth.require = function(){
  if(!Onion.auth.getToken()){
    Onion.auth.redirectLogin();
    return false;
  }
  return true;
};

/* =========================================================
   ROUTER
========================================================= */

Onion.routes = {
  "/": { page: "/app/views/index.html", title:"Dashboard" }
};

function normalize(path){
  return path.replace(/\/+/g,"/").replace(/\/$/,"") || "/";
}

Onion.router = {};

Onion.router.get = ()=> normalize(location.pathname);

Onion.router.resolve = function(){
  return Onion.routes[Onion.router.get()] || Onion.routes["/"];
};

Onion.router.navigate = function(path){

  const current = normalize(location.pathname);
  const next = normalize(path);

  if(current === next) return;

  Onion.state.renderId++;

  history.pushState({}, "", path);

  Onion.render();

};

window.addEventListener("popstate", ()=>{
  Onion.state.renderId++;
  Onion.render();
});

/* =========================================================
   RENDER ENGINE 🔥
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

    const html = await fetch(route.page).then(r=>r.text());

    if(renderId !== Onion.state.renderId) return;

    Onion.runCleanup();

    container.innerHTML = html;

    requestAnimationFrame(()=>{
      container.classList.add("ready");
    });

  }catch(e){

    error("Render error", e);

  }finally{

    if(renderId === Onion.state.renderId){
      Onion.state.rendering = false;
    }

  }

};

/* =========================================================
   INIT
========================================================= */

Onion.init = async function(){

  if(Onion.state.ready) return;

  if(!Onion.auth.require()) return;

  try{

    const res = await Onion.fetch("/auth/me");

    Onion.setUser(res?.user || res);

    Onion.state.ready = true;

    Onion.render();

  }catch(e){
    error("Init error", e);
  }

};

/* =========================================================
   BOOT
========================================================= */

document.addEventListener("DOMContentLoaded", ()=>{
  Onion.init();
});

log("🚀 Onion SPA GOD MODE READY");

})();

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
  slug: null,
  renderId: 0,
  cleanup: [],
  abortController: null,
  ready: false,
  bridgeLoading: false,
  htmlCache: new Map(),
  loadedScripts: new Set()
};

/* =========================================================
   SAFE STORAGE
========================================================= */

const safeGet = (k)=>{ try{ return localStorage.getItem(k); }catch{ return null; } };
const safeSet = (k,v)=>{ try{ localStorage.setItem(k,v); }catch{} };

Onion.state.slug = safeGet("onion_user_slug");

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

  if(u.username){
    Onion.state.slug = u.username;
    safeSet("onion_user_slug", u.username);
  }

  safeSet("onion_user_name", u.name);
  safeSet("onion_user_avatar", u.avatar || "");
};

/* =========================================================
   CLEANUP SAFE
========================================================= */

Onion.onCleanup = (fn)=>{
  if(typeof fn === "function") Onion.state.cleanup.push(fn);
};

Onion.cleanupEvent = function(el, type, handler, opt){

  if(!el || !type || !handler) return;

  el.addEventListener(type, handler, opt);

  Onion.onCleanup(()=>{
    try{ el.removeEventListener(type, handler, opt); }catch{}
  });
};

Onion.runCleanup = function(){

  const list = Onion.state.cleanup;

  for(let i = list.length - 1; i >= 0; i--){
    try{ list[i](); }catch(e){ warn(e); }
  }

  Onion.state.cleanup = [];

  if(Onion.state.abortController){
    try{ Onion.state.abortController.abort(); }catch{}
    Onion.state.abortController = null;
  }
};

/* =========================================================
   FETCH (ANTI-RACE + TIMEOUT)
========================================================= */

Onion.fetch = async function(url, opt = {}){

  if(typeof url !== "string" || !url){
    throw new Error("URL inválida");
  }

  if(url.startsWith("/")){
    url = Onion.config.API + url;
  }

  const controller = new AbortController();
  Onion.state.abortController = controller;

  const timeout = setTimeout(()=>{
    try{ controller.abort(); }catch{}
  }, Onion.config.TIMEOUT);

  try{

    const headers = { ...(opt.headers || {}) };
    const token = safeGet("onion_token");

    if(token){
      headers.Authorization = "Bearer " + token;
    }

    if(opt.body && typeof opt.body === "object" && !(opt.body instanceof FormData)){
      headers["Content-Type"] = "application/json";
      opt.body = JSON.stringify(opt.body);
    }

    const res = await fetch(url, {
      ...opt,
      headers,
      signal: controller.signal,
      credentials: "include"
    });

    const data = await res.json().catch(()=> null);

    if(!res.ok){
      throw new Error(data?.message || ("HTTP " + res.status));
    }

    return data;

  }catch(e){

    if(e?.name === "AbortError"){
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

Onion.auth = Onion.auth || {};

Onion.auth.tryLoadUser = async function(){

  try{
    const res = await Onion.fetch("/auth/me");
    const user = res?.user || res?.data || res;
    if(user) Onion.setUser(user);
  }catch{
    warn("Auth fallback");
  }
};

Onion.auth.redirectLogin = function(){
  location.href = "/auth";
};

/* =========================================================
   ROUTER CORE (SLUG MODE)
========================================================= */

Onion.routes = {
  "/": { page: "/app/views/index.html", title: "Dashboard" }
};

function normalize(path){

  if(!path || typeof path !== "string") return "/";

  path = path.split("?")[0].replace(/\/+/g, "/");

  if(path.length > 1 && path.endsWith("/")){
    path = path.slice(0, -1);
  }

  return path || "/";
}

Onion.router = {};

Onion.router.get = function(){

  const raw = normalize(window.location.pathname);

  if(raw.startsWith("/@")){
    const parts = raw.split("/").filter(Boolean);

    const slug = parts[0]?.replace("@", "");

    if(slug){
      Onion.state.slug = slug;
      safeSet("onion_user_slug", slug);
    }

    return "/" + (parts.slice(1).join("/") || "");
  }

  return raw;
};

Onion.router.resolve = function(){
  const path = Onion.router.get();
  return Onion.routes[path] || Onion.routes["/"];
};

Onion.router.buildUrl = function(href){

  if(!href || typeof href !== "string") return "/";

  if(href.startsWith("http")) return href;

  const slug = Onion.state.slug || safeGet("onion_user_slug");

  if(!slug) return href;

  if(href === "/") return "/@" + slug;
  if(href.startsWith("/@")) return href;

  return "/@" + slug + href;
};

Onion.router.navigate = function(href){

  if(!href || typeof href !== "string") return;

  if(href.startsWith("http")){
    window.location.href = href;
    return;
  }

  const finalHref = Onion.router.buildUrl(href);
  const current = normalize(window.location.pathname);
  const next = normalize(finalHref);

  if(current === next) return;

  history.pushState({}, "", finalHref);
  window.scrollTo(0, 0);

  Onion.render();
};

window.addEventListener("popstate", ()=> Onion.render());

/* =========================================================
   BRIDGE REGISTRY
========================================================= */

Onion.register = function(type, name, fn){

  if(!type || !name || typeof fn !== "function") return;

  if(!Onion[type]) Onion[type] = Object.create(null);

  Onion[type][name] = fn;

  log(`📦 ${type}:${name}`);
};

/* =========================================================
   VIEW HELPERS
========================================================= */

function hideLoader(){

  document.body.classList.remove("loading");

  const el = document.getElementById("app-loader");

  if(el){
    el.style.opacity = "0";
    setTimeout(()=>{
      try{ el.remove(); }catch{}
    }, 200);
  }
}

function normalizeAssetUrl(src){

  if(!src || typeof src !== "string") return null;

  if(src.startsWith("http")) return src;
  if(src.startsWith("/")) return window.location.origin + src;

  return window.location.origin + "/" + src.replace(/^\/+/, "");
}

async function fetchHTML(url){

  const finalUrl = normalizeAssetUrl(url);

  if(!finalUrl) throw new Error("Ruta de vista inválida");

  if(Onion.state.htmlCache.has(finalUrl)){
    return Onion.state.htmlCache.get(finalUrl);
  }

  const res = await fetch(finalUrl, { credentials: "include" });

  if(!res.ok){
    throw new Error("HTTP " + res.status);
  }

  const html = await res.text();

  Onion.state.htmlCache.set(finalUrl, html);

  return html;
}

function extractPanelContent(html){

  const wrapper = document.createElement("div");
  wrapper.innerHTML = String(html || "").trim();

  const content = wrapper.querySelector(".panel-content");

  if(content) return content;

  const fallback = document.createElement("div");
  fallback.className = "panel-content";
  fallback.innerHTML = wrapper.innerHTML;

  return fallback;
}

function applyPageStyles(styles){

  if(!styles) return;

  const list = Array.isArray(styles) ? styles : [styles];

  document.querySelectorAll("link[data-onion-page-style]").forEach((node)=>{
    try{ node.remove(); }catch{}
  });

  list.forEach((href)=>{
    const finalHref = normalizeAssetUrl(href);
    if(!finalHref) return;

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = finalHref;
    link.dataset.onionPageStyle = "true";

    document.head.appendChild(link);
  });
}

async function applyPageScripts(scripts){

  if(!scripts) return;

  const list = Array.isArray(scripts) ? scripts : [scripts];

  for(const src of list){

    const finalSrc = normalizeAssetUrl(src);
    if(!finalSrc) continue;

    if(Onion.state.loadedScripts.has(finalSrc)) continue;

    Onion.state.loadedScripts.add(finalSrc);

    await new Promise((resolve, reject)=>{
      const script = document.createElement("script");
      script.src = finalSrc;
      script.defer = true;
      script.dataset.onionPageScript = "true";
      script.onload = resolve;
      script.onerror = reject;
      document.body.appendChild(script);
    }).catch((e)=>{
      error("Script load error", finalSrc, e);
    });
  }
}

/* =========================================================
   RENDER (FULL SPA GOD MODE)
========================================================= */

Onion.render = async function(){

  const renderId = ++Onion.state.renderId;

  try{

    const container = document.getElementById("view-container");
    if(!container) throw new Error("view-container no encontrado");

    const route = Onion.router.resolve();

    if(!route?.page){
      throw new Error("Ruta inválida");
    }

    Onion.runCleanup();

    const html = await fetchHTML(route.page);

    if(renderId !== Onion.state.renderId) return;

    const content = extractPanelContent(html);

    container.replaceChildren(content);

    const title = document.getElementById("topbar-title");
    if(title){
      title.textContent = route.title || "Panel";
    }

    applyPageStyles(route.style);

    await applyPageScripts(route.script);

    if(route.feature && Onion.features?.[route.feature]){
      try{
        Onion.features[route.feature]();
      }catch(e){
        error("Feature crash", e);
      }
    }

  }catch(e){

    error("Render", e);

    const container = document.getElementById("view-container");

    if(container){
      container.innerHTML = `
        <div class="panel-content ready" style="padding:20px;">
          <h2>Error al cargar la vista</h2>
          <p>${e?.message || "Error inesperado"}</p>
        </div>
      `;
    }

  }finally{
    hideLoader();
  }
};

/* =========================================================
   SPA LINKS
========================================================= */

document.addEventListener("click", (e)=>{

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

  if(Onion.state.ready || Onion.state.bridgeLoading) return;

  Onion.state.bridgeLoading = true;

  log("INIT...");

  await Onion.auth.tryLoadUser();

  if(!Onion.state.user && !location.pathname.startsWith("/auth")){
    Onion.auth.redirectLogin();
    Onion.state.bridgeLoading = false;
    return;
  }

  const script = document.createElement("script");
  script.src = "/js/wwwroot/router/index.js";
  script.defer = true;

  script.onload = ()=>{
    log("🔌 Bridge cargado");
    Onion.state.ready = true;
    Onion.state.bridgeLoading = false;
    Onion.render();
  };

  script.onerror = ()=>{
    error("💥 Bridge no cargado");
    Onion.state.ready = true;
    Onion.state.bridgeLoading = false;
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

log("🚀 CORE READY (FULL SPA)");

})();

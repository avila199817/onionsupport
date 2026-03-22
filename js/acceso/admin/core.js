(function(){
"use strict";

/* =========================
   INIT GUARD
========================= */
if (window.__appInit) return;
window.__appInit = true;

/* =========================
   HELPERS
========================= */
const $ = (s,c=document)=>c.querySelector(s);
const $$ = (s,c=document)=>c.querySelectorAll(s);

/* =========================
   CORE APP (ONION)
========================= */
if(!window.Onion){

const Onion = {};
window.Onion = Onion;

/* CONFIG */
Onion.config = {
  API: "https://api.onionit.net/api",
  TIMEOUT: 10000
};

/* STATE */
Onion.state = {
  user: null,
  slug: localStorage.getItem("onion_slug") || null,
  rendering: false,
  currentScript: null,
  currentStyle: null,
  renderId: 0,
  abortController: null,
};

Onion.cache = { html:{} };

/* EVENTS */
Onion.events = {
  emit:(n,d={})=>window.dispatchEvent(new CustomEvent(n,{detail:d})),
  on:(n,h)=>window.addEventListener(n,h),
};

/* AUTH */
const getToken = ()=>{
  const t = localStorage.getItem("onion_token");
  if(!t) throw new Error("NO_TOKEN");
  return t;
};

const redirectLogin = ()=> location.href="/es/acceso/";

/* FETCH */
Onion.fetch = async (url)=>{
  const c = new AbortController();
  const id = setTimeout(()=>c.abort(),Onion.config.TIMEOUT);

  try{
    const r = await fetch(url,{
      headers:{Authorization:"Bearer "+getToken()},
      signal:c.signal
    });

    if(r.status===401) throw new Error("401");
    const j = await r.json();
    if(!r.ok) throw new Error("HTTP "+r.status);
    return j;

  }catch(e){
    if(e.name==="AbortError") throw new Error("TIMEOUT");
    throw e;
  }finally{ clearTimeout(id); }
};

/* FETCH HTML */
Onion.fetchHTML = async (url,useCache=true)=>{
  if(useCache && Onion.cache.html[url]) return Onion.cache.html[url];

  Onion.state.abortController?.abort();
  Onion.state.abortController = new AbortController();

  const r = await fetch(url,{signal:Onion.state.abortController.signal});
  if(!r.ok) throw new Error("PAGE "+r.status);

  const html = await r.text();
  if(useCache) Onion.cache.html[url]=html;
  return html;
};

/* LOADERS */
Onion.loadScript = (src)=>new Promise((res,rej)=>{
  const old = document.querySelector("[data-onion-page]");
  if(old) old.remove();

  const s = document.createElement("script");
  s.src = src+"?v="+Date.now();
  s.defer=true;
  s.setAttribute("data-onion-page","1");

  s.onload=res;
  s.onerror=()=>rej("Script fail");

  document.body.appendChild(s);
});

Onion.loadStyle = (href)=>new Promise(r=>{
  if(Onion.state.currentStyle===href) return r();

  document.querySelector("[data-onion-style]")?.remove();

  const l = document.createElement("link");
  l.rel="stylesheet";
  l.href=href+"?v="+Date.now();
  l.setAttribute("data-onion-style","1");

  l.onload=r;
  document.head.appendChild(l);
});

/* USER */
Onion.setUser = (u)=>{
  Onion.state.user = u;
  Onion.state.slug = u?.slug || null;

  if(u?.slug) localStorage.setItem("onion_slug",u.slug);
  else localStorage.removeItem("onion_slug");

  Onion.events.emit("user:changed");
};

/* ROUTES */
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

/* ROUTER */
Onion.router = {
  get(){
    let p = location.pathname || "/";
    if(p.startsWith("/@")) p = "/" + p.split("/").slice(2).join("/");
    return p.replace(/\/+$/,"") || "/";
  },
  resolve(){
    return Onion.routes[this.get()] || Onion.routes["/"];
  }
};

/* NAV */
Onion.go = (path)=>{
  if(!Onion.state.slug) return;

  Onion.events.emit("nav:search:close");
  Onion.cache.html={};

  history.pushState({}, "", "/@"+Onion.state.slug+(path||""));
  Onion.events.emit("nav:change");
};

/* LINKS */
document.addEventListener("click",(e)=>{
  let el=e.target;
  while(el && el!==document){
    if(el.tagName==="A" && el.dataset.link){
      e.preventDefault();
      Onion.go(el.getAttribute("href"));
      return;
    }
    el=el.parentNode;
  }
});

/* RENDER */
Onion.render = async ()=>{
  if(Onion.state.rendering) return;
  Onion.state.rendering=true;

  try{
    const app=$("#app-content");
    if(!app) return;

    app.innerHTML="Cargando...";

    const route = Onion.router.get();

    await Onion.loadStyle(Onion.styles[route] || "");
    const html = await Onion.fetchHTML(Onion.router.resolve(), route!=="/");

    const tmp = document.createElement("div");
    tmp.innerHTML=html;

    const content = tmp.querySelector(".panel-content");
    if(!content) throw "NO CONTENT";

    app.innerHTML="";
    app.appendChild(content);

    if(Onion.scripts[route]) await Onion.loadScript(Onion.scripts[route]);

    Onion.events.emit("nav:ready");

  }catch(e){
    $("#app-content").innerHTML="Error cargando";
  }finally{
    Onion.state.rendering=false;
  }
};

/* INIT */
Onion.init = async ()=>{
  try{
    const res = await Onion.fetch(Onion.config.API+"/auth/me");
    Onion.setUser(res.user||res);

    Onion.events.on("nav:change",Onion.render);
    window.addEventListener("popstate",Onion.render);

    await Onion.render();

  }catch(e){
    if(e.message==="401"||e.message==="NO_TOKEN") redirectLogin();
  }
};

Onion.init();
}

/* =========================
   UI LAYER
========================= */

function renderSidebar(){
  const u = Onion.state.user;
  if(!u) return;

  const name = u.name || u.username || u.email || "Usuario";

  $("#sidebar-name").textContent = name;

  const avatar = $("#sidebar-avatar");
  avatar.innerHTML="";

  if(u.avatar){
    const img = new Image();
    img.src=u.avatar;
    avatar.appendChild(img);
  }else{
    avatar.textContent = name.split(" ").map(x=>x[0]).join("").slice(0,2);
  }
}

function renderTopbar(){
  const titles={
    "/":"Onion Support",
    "/incidencias":"Incidencias",
    "/facturas":"Facturas",
    "/cuenta":"Cuenta"
  };
  $("#topbar-title").textContent = titles[Onion.router.get()] || "Panel";
}

function updateSidebarActive(){
  const r = Onion.router.get();
  $$(".sidebar a[data-link]").forEach(a=>{
    a.classList.toggle("active", a.getAttribute("href")===r);
  });
}

/* SEARCH (optimizado) */
function initSearch(){
  const i=$("#topbar-search");
  const c=$("#topbar-search-results");
  if(!i||!c||i.__init) return;

  i.__init=true;
  let t;

  const hide=()=>{c.classList.remove("active");c.innerHTML="";};

  const search = async q=>{
    try{
      return (await Onion.fetch(Onion.config.API+"/search?q="+encodeURIComponent(q))).results||[];
    }catch{return[];}
  };

  i.addEventListener("input",()=>{
    clearTimeout(t);
    const v=i.value.trim();
    if(!v) return hide();

    t=setTimeout(async()=>{
      const r=await search(v);
      c.innerHTML = r.length
        ? r.map(x=>`<div class="search-result">${x.title||""}</div>`).join("")
        : "<div>Sin resultados</div>";
      c.classList.add("active");
    },200);
  });

  document.addEventListener("click",e=>{
    if(!e.target.closest(".topbar-search-wrap")) hide();
  });
}

/* INIT UI */
function initUI(){
  renderSidebar();
  renderTopbar();
  updateSidebarActive();
  initSearch();
}

/* HOOKS */
Onion?.events?.on("user:changed",renderSidebar);
Onion?.events?.on("nav:ready",()=>{
  renderTopbar();
  updateSidebarActive();
});

/* START */
document.addEventListener("DOMContentLoaded", initUI, {once:true});

})();

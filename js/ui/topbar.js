"use strict";

/* =========================================================
   🧅 TOPBAR SEARCH — FULL PRO SAAS (FIXED · NO DUPES · NO LEAKS)
========================================================= */

(function(){

const Onion = window.Onion;

if(!Onion){
  console.error("💥 Onion no definido (topbar)");
  return;
}

/* =========================================================
   STATE GLOBAL
========================================================= */

let initialized = false;

/* =========================
   INIT
========================= */

function init(){

  const input = document.querySelector("#topbar-search");
  const container = document.querySelector("#topbar-search-results");

  if(!input || !container) return;

  if(!Onion.state?.user){
    return setTimeout(init, 100);
  }

  // 🔥 evitar rebind duplicado
  if(initialized) return;

  initialized = true;

  bind(input, container);

  Onion.onCleanup(()=>{
    initialized = false;
  });

}

init();

/* 🔥 SPA HOOKS (SIN DUPES) */
if(!window.__ONION_SEARCH_BOUND__){

  window.__ONION_SEARCH_BOUND__ = true;

  Onion.events?.on?.("app:ready", ()=> requestAnimationFrame(init));
  Onion.events?.on?.("route:end", ()=> requestAnimationFrame(init));

}

/* =========================================================
   CORE BIND
========================================================= */

function bind(input, container){

  if(input.__searchInit) return;
  input.__searchInit = true;

  let timer = null;
  let controller = null;
  let activeIndex = -1;
  let currentResults = [];

  /* =========================
     UI
  ========================= */

  function show(){
    container.hidden = false;
    container.classList.add("active");
  }

  function hide(){
    container.classList.remove("active");
    container.hidden = true;
    container.innerHTML = "";
    activeIndex = -1;
  }

  /* =========================
     UTILS
  ========================= */

  function highlight(text,q){
    if(!q) return text;

    const i = text.toLowerCase().indexOf(q.toLowerCase());
    if(i === -1) return text;

    return text.slice(0,i)
      + "<mark>"+text.slice(i,i+q.length)+"</mark>"
      + text.slice(i+q.length);
  }

  const icons = {
    cliente:"🏢",
    user:"👤",
    factura:"🧾",
    incidencia:"🎫",
    nav:"📂"
  };

  function group(results){
    const g={};
    results.forEach(r=>{
      (g[r.type] ||= []).push(r);
    });
    return g;
  }

  /* =========================
     RENDER
  ========================= */

  function render(results, q=""){

    container.innerHTML = "";
    currentResults = results;
    activeIndex = -1;

    if(!results.length){
      container.innerHTML = `<div class="search-empty">Sin resultados</div>`;
      return show();
    }

    const groups = group(results);

    Object.keys(groups).forEach(type=>{

      const header = document.createElement("div");
      header.className = "search-group";
      header.textContent = type;

      container.appendChild(header);

      groups[type].slice(0,6).forEach((r)=>{

        const el = document.createElement("div");
        el.className = "search-result";

        el.innerHTML = `
          <span class="search-icon">${icons[r.type] || "🔎"}</span>
          <div class="search-text">
            <div class="search-title">${highlight(r.title || "", q)}</div>
            ${r.subtitle ? `<div class="search-subtitle">${highlight(r.subtitle, q)}</div>`:""}
          </div>
        `;

        Onion.cleanupEvent(el, "click", ()=>{
          hide();
          if(r.url){
            Onion.router?.navigate?.(r.url);
          }
        });

        container.appendChild(el);

      });

    });

    show();

  }

  /* =========================
     API
  ========================= */

  async function searchAPI(q){

    try{

      if(controller){
        try{ controller.abort(); }catch{}
      }

      controller = new AbortController();

      const url = "/search?q=" + encodeURIComponent(q);

      const data = await Onion.fetch(url,{ signal:controller.signal });

      return data?.results || data || [];

    }catch(e){

      if(e.message === "ABORTED") return [];

      console.warn("Search API no disponible");
      return [];

    }

  }

  async function runSearch(q){
    const results = await searchAPI(q);
    render(results, q);
  }

  /* =========================
     INPUT
  ========================= */

  function onInput(){

    const value = input.value.trim();

    clearTimeout(timer);

    if(!value){
      hide();
      return;
    }

    timer = setTimeout(()=> runSearch(value), 200);

  }

  Onion.cleanupEvent(input, "input", onInput);

  /* =========================
     CLICK OUTSIDE
  ========================= */

  Onion.cleanupEvent(document, "click",(e)=>{
    if(!e.target.closest(".topbar-search-wrap")){
      hide();
    }
  });

  /* =========================
     KEYBOARD
  ========================= */

  Onion.cleanupEvent(document, "keydown",(e)=>{

    const items = container.querySelectorAll(".search-result");
    if(!items.length) return;

    if(e.key==="ArrowDown"){
      e.preventDefault();
      activeIndex = Math.min(activeIndex+1, items.length-1);
      updateActive(items);
    }

    if(e.key==="ArrowUp"){
      e.preventDefault();
      activeIndex = Math.max(activeIndex-1, 0);
      updateActive(items);
    }

    if(e.key==="Enter" && activeIndex>=0){
      items[activeIndex]?.click();
    }

    if(e.key==="Escape"){
      hide();
    }

  });

  function updateActive(items){

    items.forEach(el=>el.classList.remove("active"));

    if(items[activeIndex]){
      items[activeIndex].classList.add("active");
      items[activeIndex].scrollIntoView({block:"nearest"});
    }

  }

  /* =========================
     CLEANUP
  ========================= */

  Onion.onCleanup(()=>{

    clearTimeout(timer);

    if(controller){
      try{ controller.abort(); }catch{}
    }

    input.__searchInit = false;

  });

}

/* =========================
   DEBUG
========================= */

if(Onion.config?.DEBUG){
  Onion.log("🔍 Topbar Search PRO ready");
}

})();

"use strict";

(function(){

if(!window.Onion){
  console.error("💥 Onion no definido (render.js)");
  return;
}

const Onion = window.Onion;

/* =========================================================
   CACHE
========================================================= */

const viewCache = new Map();
const loadedScripts = new Set();

/* =========================================================
   UTILS
========================================================= */

function normalizeUrl(src){

  if(!src) return null;

  if(typeof src !== "string"){
    Onion.error?.("URL inválida:", src);
    return null;
  }

  if(src.startsWith("http")) return src;

  if(src.startsWith("/")){
    return window.location.origin + src;
  }

  return window.location.origin + "/" + src.replace(/^\/+/,"");

}

/* =========================================================
   SCRIPT LOADER
========================================================= */

function loadScriptSingle(src){
  return new Promise((resolve, reject)=>{

    const finalSrc = normalizeUrl(src);
    if(!finalSrc) return resolve();

    if(loadedScripts.has(finalSrc)){
      return resolve();
    }

    loadedScripts.add(finalSrc);

    const s = document.createElement("script");
    s.src = finalSrc;
    s.defer = true;
    s.async = false;
    s.dataset.onionPage = "true";

    s.onload = resolve;
    s.onerror = reject;

    document.body.appendChild(s);

  });
}

Onion.loadScript = function(scripts){

  if(!scripts) return;

  if(typeof scripts === "string"){
    scripts = [scripts];
  }

  if(!Array.isArray(scripts)) return;

  Promise.all(scripts.map(loadScriptSingle))
    .catch(e=> console.error("❌ Script error", e));

};

/* =========================================================
   STYLE LOADER
========================================================= */

Onion.loadStyle = function(styles){

  if(!styles) return;

  if(!Array.isArray(styles)){
    styles = [styles];
  }

  document
    .querySelectorAll('link[data-onion-page-style]')
    .forEach(l=>{
      try{ l.remove(); }catch{}
    });

  styles.forEach(href=>{

    const finalHref = normalizeUrl(href);
    if(!finalHref) return;

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = finalHref;
    link.dataset.onionPageStyle = "true";

    document.head.appendChild(link);

  });

};

/* =========================================================
   FETCH HTML
========================================================= */

Onion.fetchHTML = async function(url){

  const finalUrl = normalizeUrl(url);
  if(!finalUrl) throw new Error("URL inválida");

  if(viewCache.has(finalUrl)){
    return viewCache.get(finalUrl);
  }

  const res = await fetch(finalUrl, {
    credentials: "include"
  });

  if(!res.ok){
    throw new Error("HTTP " + res.status);
  }

  const text = await res.text();

  viewCache.set(finalUrl, text);

  return text;

};

/* =========================================================
   EXTRACT
========================================================= */

function extractContent(html){

  const wrapper = document.createElement("div");
  wrapper.innerHTML = html.trim();

  let content = wrapper.querySelector(".panel-content");

  if(!content){
    content = document.createElement("div");
    content.className = "panel-content";
    content.innerHTML = wrapper.innerHTML;
  }

  return content;

}

/* =========================================================
   CLEAR
========================================================= */

function clearView(){
  document.getElementById("topbarview-container")?.replaceChildren();
  document.getElementById("tablehead-container")?.replaceChildren();
}

/* =========================================================
   RENDER CORE
========================================================= */

async function render(){

  if(!Onion.state.appReady) return;

  const renderId = ++Onion.state.renderId;

  try{

    const container = document.getElementById("view-container");
    if(!container){
      throw new Error("view-container no encontrado");
    }

    const route = Onion.router.resolve();

    if(!route?.page){
      throw new Error("Ruta inválida");
    }

    /* 👉 LOADER ON (controlado por server mental) */
    Onion.ui?.showLoader?.();

    /* FETCH */
    const html = await Onion.fetchHTML(route.page);

    if(renderId !== Onion.state.renderId) return;

    const content = extractContent(html);
    content.classList.remove("ready");

    /* CLEANUP */
    Onion.runCleanup?.();

    clearView();

    /* SWAP */
    container.replaceChildren(content);

    /* READY */
    requestAnimationFrame(()=>{

      if(renderId !== Onion.state.renderId) return;

      const el = container.querySelector(".panel-content");
      if(el) el.classList.add("ready");

      /* 👉 LOADER OFF (SIN EVENTS) */
      Onion.ui?.hideLoader?.();

    });

    /* ASSETS */
    if(route.style) Onion.loadStyle(route.style);
    if(route.script) Onion.loadScript(route.script);

  }catch(e){

    console.error("💥 RENDER ERROR:", e);

    const container = document.getElementById("view-container");

    if(container){
      container.innerHTML = `
        <div class="panel-content ready" style="padding:20px;">
          <h2>Error al cargar la vista</h2>
          <p>${e.message}</p>
        </div>
      `;
    }

    Onion.ui?.hideLoader?.();

  }

}

/* =========================================================
   PUBLIC
========================================================= */

Onion.render = render;

})();

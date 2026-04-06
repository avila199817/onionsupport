"use strict";

(function(){

if(!window.Onion){
  console.error("💥 Onion no definido (render.js)");
  return;
}

const Onion = window.Onion;

/* =========================================================
   CACHE PRO
========================================================= */

const viewCache = new Map();
const loadedScripts = new Set();

/* =========================================================
   DEBUG
========================================================= */

function log(...args){
  if(Onion.config?.DEBUG){
    console.log("🧅 [RENDER]", ...args);
  }
}

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
   SCRIPT LOADER (CACHEADO)
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
    .then(()=> log("✅ Scripts OK"))
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
   FETCH HTML (CACHEADO)
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
   EXTRACT CONTENT
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
   SWAP VIEW (ATÓMICO)
========================================================= */

function swapView(container, node){
  container.replaceChildren(node);
}

/* =========================================================
   CLEAR VIEW
========================================================= */

function clearView(){
  document.getElementById("topbarview-container")?.replaceChildren();
  document.getElementById("tablehead-container")?.replaceChildren();
}

/* =========================================================
   CORE RENDER (PURO)
========================================================= */

const originalRender = async function(){

  if(!Onion.state.appReady) return;

  const renderId = ++Onion.state.renderId;
  Onion.state.rendering = true;

  try{

    const container = document.getElementById("view-container");
    if(!container){
      throw new Error("view-container no encontrado");
    }

    const route = Onion.router.resolve();
    if(!route?.page){
      throw new Error("Ruta inválida");
    }

    /* 🔥 FETCH */
    const html = await Onion.fetchHTML(route.page);

    /* 🔒 CANCELACIÓN POR RACE */
    if(renderId !== Onion.state.renderId) return;

    const content = extractContent(html);
    content.classList.remove("ready");

    /* 🔥 CLEANUP JUSTO ANTES DEL SWAP */
    Onion.runCleanup?.();

    /* 🔥 LIMPIEZA AUXILIAR */
    clearView();

    /* 🔥 SWAP ATÓMICO */
    swapView(container, content);

    /* 🔥 READY FRAME (SINCRONÍA REAL DOM) */
    requestAnimationFrame(()=>{
      if(renderId !== Onion.state.renderId) return;

      const el = container.querySelector(".panel-content");
      if(el) el.classList.add("ready");
    });

    /* 🔥 CARGA PASIVA (NO BLOQUEA RENDER) */
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

  }finally{

    if(renderId === Onion.state.renderId){
      Onion.state.rendering = false;
    }

  }

};

/* =========================================================
   PUBLIC
========================================================= */

Onion.render = function(){
  return originalRender.apply(this, arguments);
};

})();

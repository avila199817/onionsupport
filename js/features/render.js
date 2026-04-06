"use strict";

(function(){

if(!window.Onion){
  console.error("💥 Onion no definido (render.js)");
  return;
}

const Onion = window.Onion;
const MAX_CONTAINER_WAIT = 5000;

/* =========================================================
   DEBUG
========================================================= */

function log(...args){
  console.log("🧅 [RENDER]", ...args);
}

function time(label){
  console.time("🧅 " + label);
}

function timeEnd(label){
  console.timeEnd("🧅 " + label);
}

/* =========================================================
   DOM READY
========================================================= */

function waitForDOMReady(){
  if(document.readyState === "complete" || document.readyState === "interactive"){
    return Promise.resolve();
  }
  return new Promise(resolve=>{
    document.addEventListener("DOMContentLoaded", resolve, { once:true });
  });
}

/* =========================================================
   WAIT VIEW CONTAINER
========================================================= */

function waitForViewContainer(){
  return new Promise((resolve, reject)=>{
    const start = performance.now();

    const check = () => {
      const el = document.getElementById("view-container");

      if(el) return resolve(el);

      if(performance.now() - start > MAX_CONTAINER_WAIT){
        return reject(new Error("⏱️ view-container timeout"));
      }

      requestAnimationFrame(check);
    };

    check();
  });
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
   SCRIPT LOADER (NO BLOQUEANTE)
========================================================= */

function loadScriptSingle(src){
  return new Promise((resolve, reject)=>{

    const finalSrc = normalizeUrl(src);
    if(!finalSrc) return resolve();

    const existing = document.querySelector(`script[src="${finalSrc}"][data-onion-page]`);
    if(existing){
      return resolve();
    }

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

  document.querySelectorAll("script[data-onion-page]").forEach(s=>{
    try{ s.remove(); }catch{}
  });

  Promise.all(scripts.map(loadScriptSingle))
    .then(()=> log("✅ Scripts OK"))
    .catch(e=> console.error("❌ Script error", e));
};

/* =========================================================
   STYLE LOADER (NO BLOQUEANTE)
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

  const res = await fetch(finalUrl, {
    credentials: "include"
  });

  if(!res.ok){
    throw new Error("HTTP " + res.status);
  }

  return await res.text();

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
   SWAP VIEW
========================================================= */

function swapView(container, node){
  container.replaceChildren(node);
}

/* =========================================================
   TOPBAR
========================================================= */

function updateTopbar(route){
  const el = document.getElementById("topbar-title");
  if(!el) return;
  el.textContent = route?.title || "Panel";
}

/* =========================================================
   CLEAR VIEW
========================================================= */

function clearView(){
  document.getElementById("topbarview-container")?.replaceChildren();
  document.getElementById("tablehead-container")?.replaceChildren();
}

/* =========================================================
   CORE RENDER (ULTRA FAST)
========================================================= */

const originalRender = async function(){

  if(!Onion.state.appReady) return;

  if(Onion.state.rendering){
    Onion.state.renderId++;
  }

  const renderId = ++Onion.state.renderId;
  Onion.state.rendering = true;

  try{

    await waitForDOMReady();
    const container = await waitForViewContainer();

    const route = Onion.router.resolve();
    if(!route?.page){
      throw new Error("Ruta inválida");
    }

    updateTopbar(route);

    /* 🔥 FETCH */
    const html = await Onion.fetchHTML(route.page);

    if(renderId !== Onion.state.renderId) return;

    const content = extractContent(html);
    content.classList.remove("ready");

    Onion.runCleanup?.();

    /* 🔥 PINTA YA (loader visible inmediato) */
    clearView();
    swapView(container, content);

    /* 🔥 FRAME PARA QUE APAREZCA */
    await new Promise(r=>requestAnimationFrame(r));

    /* 🔥 READY (animación suave) */
    container.querySelector(".panel-content")?.classList.add("ready");

    /* 🔥 LOAD EN BACKGROUND */
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

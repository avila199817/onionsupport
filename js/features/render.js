"use strict";

/* =========================================================
   🧅 RENDER — GOD MODE FINAL (SPA ESTABLE · SIN RACES · CLEAN)
========================================================= */

(function(){

if(!window.Onion){
  console.error("💥 Onion no definido (render.js)");
  return;
}

const Onion = window.Onion;

/* =========================================================
   DOM READY (🔥 CLAVE)
========================================================= */

function waitForDOMReady(){

  if(document.readyState === "complete" || document.readyState === "interactive"){
    return Promise.resolve();
  }

  return new Promise(resolve=>{
    document.addEventListener("DOMContentLoaded", resolve, { once: true });
  });

}

/* =========================================================
   WAIT VIEW CONTAINER (SIN LOOPS LOCOS)
========================================================= */

function waitForViewContainer(){

  return new Promise(resolve=>{

    const check = () => {

      const el = document.getElementById("view-container");

      if(el){
        return resolve(el);
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
    Onion.error("URL inválida:", src);
    return null;
  }

  if(src.startsWith("/")){
    return window.location.origin + src;
  }

  if(src.startsWith("http")){
    return src;
  }

  return window.location.origin + "/" + src.replace(/^\/+/,"");

}

/* =========================================================
   LOAD SCRIPT
========================================================= */

function loadScriptSingle(src){

  return new Promise((resolve, reject)=>{

    const finalSrc = normalizeUrl(src);
    if(!finalSrc) return resolve();

    const s = document.createElement("script");

    s.src = finalSrc;
    s.defer = true;
    s.async = false;
    s.setAttribute("data-onion-page","true");

    s.onload = resolve;
    s.onerror = reject;

    document.body.appendChild(s);

  });

}

Onion.loadScript = async function(scripts){

  if(!scripts) return;

  if(typeof scripts === "string"){
    scripts = [scripts];
  }

  if(!Array.isArray(scripts)){
    Onion.error("Scripts inválidos:", scripts);
    return;
  }

  document.querySelectorAll("script[data-onion-page]").forEach(s=>{
    try{ s.remove(); }catch{}
  });

  for(const src of scripts){
    await loadScriptSingle(src);
  }

};

/* =========================================================
   LOAD STYLE
========================================================= */

Onion.loadStyle = function(styles){

  return new Promise((resolve)=>{

    if(!styles) return resolve();

    if(!Array.isArray(styles)){
      styles = [styles];
    }

    let loaded = 0;
    const newLinks = [];

    styles.forEach((href)=>{

      const finalHref = normalizeUrl(href);

      if(!finalHref){
        done();
        return;
      }

      const link = document.createElement("link");

      link.rel = "stylesheet";
      link.href = finalHref;
      link.setAttribute("data-onion-page-style","true");

      link.onload = done;
      link.onerror = done;

      document.head.appendChild(link);
      newLinks.push(link);

    });

    function done(){

      loaded++;

      if(loaded === styles.length){

        document
          .querySelectorAll('link[data-onion-page-style-old]')
          .forEach(l=>{
            try{ l.remove(); }catch{}
          });

        newLinks.forEach(l=>{
          l.setAttribute("data-onion-page-style-old","true");
        });

        resolve();
      }

    }

  });

};

/* =========================================================
   FETCH HTML
========================================================= */

Onion.fetchHTML = async function(url){

  const finalUrl = normalizeUrl(url);
  if(!finalUrl) return null;

  const res = await fetch(finalUrl, {
    credentials: "include"
  });

  if(!res.ok){
    throw new Error("HTTP " + res.status);
  }

  return await res.text();

};

/* =========================================================
   EXTRACT CONTENT (ROBUSTO)
========================================================= */

function extractContent(html){

  const wrapper = document.createElement("div");
  wrapper.innerHTML = html.trim();

  const content = wrapper.querySelector(".panel-content");

  if(content) return content;

  console.warn("⚠️ panel-content no encontrado → fallback");

  const fallback = document.createElement("div");
  fallback.className = "panel-content";
  fallback.innerHTML = html;

  return fallback;

}

/* =========================================================
   SWAP VIEW (SEGURO)
========================================================= */

function swapView(container, node){

  container.innerHTML = "";
  container.appendChild(node.cloneNode(true));

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
   CLEAR DYNAMIC
========================================================= */

function clearDynamic(){

  const topbar = document.getElementById("topbarview-container");
  const table  = document.getElementById("tablehead-container");

  if(topbar) topbar.innerHTML = "";
  if(table) table.innerHTML = "";

}

/* =========================================================
   CORE RENDER
========================================================= */

const originalRender = async function(){

  const renderId = ++Onion.state.renderId;
  Onion.state.rendering = true;

  try{

    /* 🔥 DOM READY */
    await waitForDOMReady();

    Onion.ui.showLoader?.();

    const route = Onion.router.resolve();

    /* TITLE */
    if(route.title){
      document.title = "Onion Support · " + route.title;
    }

    updateTopbar(route);

    /* FETCH */
    const html = await Onion.fetchHTML(route.page);

    if(renderId !== Onion.state.renderId) return;

    /* EXTRACT */
    const content = extractContent(html);

    content.classList.remove("ready");

    /* CLEANUP */
    Onion.runCleanup?.();

    /* STYLE */
    if(route.style){
      await Onion.loadStyle(route.style);
    }

    /* 🔥 ESPERA REAL AL CONTAINER */
    const container = await waitForViewContainer();

    /* CLEAR */
    clearDynamic();

    /* SWAP */
    swapView(container, content);

    /* SCRIPTS */
    if(route.script){
      await Onion.loadScript(route.script);
    }

    if(renderId !== Onion.state.renderId) return;

    /* FRAME SYNC */
    await new Promise(r => requestAnimationFrame(r));
    await new Promise(r => requestAnimationFrame(r));

    const newContent = container.querySelector(".panel-content");

    if(newContent){
      newContent.classList.add("ready");
    }

    Onion.ui.hideLoader?.();

  }catch(e){

    console.error("💥 RENDER ERROR:", e);
    Onion.ui.hideLoader?.();

  }finally{

    Onion.state.rendering = false;

  }

};

/* =========================================================
   PUBLIC
========================================================= */

Onion.render = async function(){
  return originalRender.apply(this, arguments);
};

/* =========================================================
   DEBUG
========================================================= */

if(Onion.config?.DEBUG){
  Onion.log("🔥 Render PRO ready");
}

})();

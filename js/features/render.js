"use strict";

/* =========================================================
   🧅 RENDER — GOD MODE (PRO SAAS · ANTI-RACE · LOADER SYNC)
========================================================= */

(function(){

if(!window.Onion){
  console.error("💥 Onion no definido (render.js)");
  return;
}

const Onion = window.Onion;

/* =========================================================
   CONFIG
========================================================= */

const MAX_CONTAINER_WAIT = 5000;

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
   WAIT VIEW CONTAINER (CON TIMEOUT)
========================================================= */

function waitForViewContainer(){

  return new Promise((resolve, reject)=>{

    const start = performance.now();

    const check = () => {

      const el = document.getElementById("view-container");

      if(el){
        return resolve(el);
      }

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
    Onion.error("URL inválida:", src);
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

    const existing = document.querySelector(`script[src="${finalSrc}"][data-onion-page]`);
    if(existing) return resolve();

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
   STYLE LOADER
========================================================= */

Onion.loadStyle = function(styles){

  return new Promise(resolve=>{

    if(!styles) return resolve();

    if(!Array.isArray(styles)){
      styles = [styles];
    }

    let loaded = 0;
    const newLinks = [];

    styles.forEach(href=>{

      const finalHref = normalizeUrl(href);

      if(!finalHref){
        done();
        return;
      }

      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = finalHref;
      link.dataset.onionPageStyle = "true";

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
          l.dataset.onionPageStyleOld = "true";
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
  if(!finalUrl) throw new Error("URL inválida");

  const res = await fetch(finalUrl, { credentials:"include" });

  if(!res.ok){
    throw new Error("HTTP " + res.status);
  }

  return res.text();

};

/* =========================================================
   EXTRACT CONTENT
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
   SWAP VIEW
========================================================= */

function swapView(container, node){
  container.replaceChildren(node.cloneNode(true));
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

  document.getElementById("topbarview-container")?.replaceChildren();
  document.getElementById("tablehead-container")?.replaceChildren();

}

/* =========================================================
   CORE RENDER
========================================================= */

const originalRender = async function(){

  const renderId = ++Onion.state.renderId;
  Onion.state.rendering = true;

  try{

    await waitForDOMReady();

    /* 🔥 LOADER SYNC */
    Onion.ui.showLoader?.(renderId);

    const route = Onion.router.resolve();

    if(!route?.page){
      throw new Error("Ruta inválida");
    }

    if(route.title){
      document.title = "Onion Support · " + route.title;
    }

    updateTopbar(route);

    const html = await Onion.fetchHTML(route.page);

    if(renderId !== Onion.state.renderId) return;

    const content = extractContent(html);
    content.classList.remove("ready");

    Onion.runCleanup?.();

    if(route.style){
      await Onion.loadStyle(route.style);
    }

    const container = await waitForViewContainer();

    clearDynamic();
    swapView(container, content);

    if(route.script){
      await Onion.loadScript(route.script);
    }

    if(renderId !== Onion.state.renderId) return;

    await new Promise(r=>requestAnimationFrame(r));
    await new Promise(r=>requestAnimationFrame(r));

    container.querySelector(".panel-content")?.classList.add("ready");

    /* 🔥 LOADER SYNC */
    Onion.ui.hideLoader?.(renderId);

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

    Onion.ui.hideLoader?.(renderId);

  }finally{

    Onion.state.rendering = false;

  }

};

/* =========================================================
   PUBLIC
========================================================= */

Onion.render = function(){
  return originalRender.apply(this, arguments);
};

/* =========================================================
   DEBUG
========================================================= */

if(Onion.config?.DEBUG){
  Onion.log("🔥 Render GOD MODE + Loader Sync listo");
}

})();

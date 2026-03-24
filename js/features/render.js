"use strict";

(function(){

  if(!window.Onion){
    console.error("💥 Onion no definido (render.js)");
    return;
  }

  const Onion = window.Onion;

  /* =========================
     NORMALIZE URL
  ========================= */

  function normalizeUrl(src){
    if(!src) return null;

    if(src.startsWith("/")){
      return window.location.origin + src;
    }

    if(src.startsWith("http")){
      return src;
    }

    return window.location.origin + "/" + src.replace(/^\/+/,"");
  }

  /* =========================
     LOAD SCRIPT
  ========================= */

  Onion.loadScript = function(src){
    return new Promise((resolve, reject)=>{

      const finalSrc = normalizeUrl(src);
      if(!finalSrc) return resolve();

      // 🔥 eliminar scripts anteriores
      document.querySelectorAll("script[data-onion-page]").forEach(s=>{
        try{ s.remove(); }catch{}
      });

      const s = document.createElement("script");
      s.src = finalSrc + "?v=" + Date.now();
      s.defer = true;
      s.async = false;
      s.setAttribute("data-onion-page","true");

      s.onload = resolve;
      s.onerror = reject;

      document.body.appendChild(s);

    });
  };

  /* =========================
     LOAD STYLE
  ========================= */

  Onion.loadStyle = function(href){
    return new Promise((resolve)=>{

      const finalHref = normalizeUrl(href);
      if(!finalHref) return resolve();

      // 🔥 limpiar CSS anterior
      document
        .querySelectorAll('link[data-onion-page-style]')
        .forEach(l=>{
          try{ l.remove(); }catch{}
        });

      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = finalHref + "?v=" + Date.now();
      link.setAttribute("data-onion-page-style", "true");

      link.onload = resolve;
      link.onerror = resolve;

      document.head.appendChild(link);

    });
  };

  /* =========================
     FETCH HTML
  ========================= */

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

  /* =========================
     EXTRACT CONTENT
  ========================= */

  function extractContent(html){

    const wrapper = document.createElement("div");
    wrapper.innerHTML = html;

    return (
      wrapper.querySelector(".panel-content") ||
      wrapper
    );
  }

  /* =========================
     SWAP CONTENT
  ========================= */

  Onion.swapContent = function(node){

    const app = document.getElementById("app-content");
    if(!app) return;

    app.innerHTML = "";
    app.appendChild(node);

  };

  /* =========================
     RENDER (🔥 FINAL PRO + DATA AWAIT)
  ========================= */

  Onion.render = async function(){

    const currentRenderId = ++Onion.state.renderId;

    try{

      // 🔥 LOADER ON
      Onion.ui.showLoader?.();

      const route = Onion.router.resolve();

      // 🔥 actualizar título
      document.title = route.title || "Onion";

      // CSS
      if(route.style){
        await Onion.loadStyle(route.style);
      }

      // HTML
      const html = await Onion.fetchHTML(route.page);

      if(currentRenderId !== Onion.state.renderId){
        return;
      }

      const content = extractContent(html);

      // 🔥 limpiar eventos + vista anterior
      Onion.events.clear?.();
      Onion.runCleanup?.();

      if(currentRenderId !== Onion.state.renderId){
        return;
      }

      // 🔥 pintar layout vacío (estructura)
      Onion.swapContent(content);

      // JS
      if(route.script){
        await Onion.loadScript(route.script);
      }

      if(currentRenderId !== Onion.state.renderId){
        return;
      }

      // 🔥 ESPERAR A LOS DATOS DE LA VISTA
      if(typeof Onion.page === "function"){
        try{
          await Onion.page();
        }catch(e){
          console.error("💥 PAGE ERROR:", e);
        }
      }

      if(currentRenderId !== Onion.state.renderId){
        return;
      }

      // evento global
      window.dispatchEvent(new CustomEvent("onion:route-change", {
        detail: location.pathname
      }));

      // UI
      Onion.ui.refresh();
      Onion.ui.initSearch?.();

    }catch(e){

      console.error("💥 RENDER ERROR:", e);

    }finally{

      // 🔥 LOADER OFF SIEMPRE
      Onion.ui.hideLoader?.();

    }

  };

})();

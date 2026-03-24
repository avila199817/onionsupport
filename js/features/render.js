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
     RENDER (🔥 PRO SIN GLITCH)
  ========================= */

  Onion.render = async function(){

    const currentRenderId = ++Onion.state.renderId;

    try{

      Onion.ui.showLoader?.();

      const route = Onion.router.resolve();

      // 🔥 title limpio
      if(route.title){
        document.title = "Onion Support · " + route.title;
      }

      // 🔥 HTML primero (pero oculto)
      const html = await Onion.fetchHTML(route.page);

      if(currentRenderId !== Onion.state.renderId) return;

      const content = extractContent(html);

      // 🔥 CLAVE: ocultar antes de pintar
      content.classList.remove("ready");

      // 🔥 limpiar antes de pintar
      Onion.events.clear?.();
      Onion.runCleanup?.();

      // 🔥 pintar pero oculto
      Onion.swapContent(content);

      // 🔥 CSS después
      if(route.style){
        await Onion.loadStyle(route.style);
      }

      // 🔥 JS después
      if(route.script){
        await Onion.loadScript(route.script);
      }

      if(currentRenderId !== Onion.state.renderId) return;

      // 🔥 ESPERAR UN FRAME → evita FOUC
      await new Promise(r => requestAnimationFrame(r));

      // 🔥 mostrar limpio
      content.classList.add("ready");

      // evento global
      window.dispatchEvent(new CustomEvent("onion:route-change", {
        detail: location.pathname
      }));

      Onion.ui.refresh();
      Onion.ui.initSearch?.();

    }catch(e){

      console.error("💥 RENDER ERROR:", e);

    }finally{

      Onion.ui.hideLoader?.();

    }

  };

})();

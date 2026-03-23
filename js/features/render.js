"use strict";

/* =========================
   RENDER (ONION PRO FIXED)
   - Aislado
   - Sin interferencias con UI/router
   - Sin leaks
========================= */

(function(){

  if(!window.Onion){
    console.error("💥 Onion no definido (render.js)");
    return;
  }

  const Onion = window.Onion;

  /* =========================
     HELPERS URL
  ========================= */

  function normalizeUrl(src){

    if(!src) return null;

    try{
      if(src.startsWith("/")){
        return window.location.origin + src;
      }
      if(src.startsWith("http")){
        return src;
      }
      return window.location.origin + "/" + src.replace(/^\/+/,"");
    }catch(e){
      Onion.error?.("URL error:", src);
      return null;
    }

  }

  /* =========================
     LOAD SCRIPT
  ========================= */

  Onion.loadScript = function(src){

    return new Promise((resolve, reject)=>{

      const finalSrc = normalizeUrl(src);
      if(!finalSrc) return resolve();

      if(Onion.state.currentScript === finalSrc){
        return resolve();
      }

      document.querySelectorAll("script[data-onion-page]").forEach(s=>{
        try{ s.remove(); }catch{}
      });

      const s = document.createElement("script");

      s.src = finalSrc + "?v=" + Date.now();
      s.defer = true;
      s.async = false;
      s.setAttribute("data-onion-page","true");

      const timeout = setTimeout(()=>{
        s.remove();
        reject(new Error("SCRIPT_TIMEOUT"));
      }, Onion.config.TIMEOUT);

      s.onload = ()=>{
        clearTimeout(timeout);
        Onion.state.currentScript = finalSrc;
        resolve();
      };

      s.onerror = ()=>{
        clearTimeout(timeout);
        s.remove();
        reject(new Error("SCRIPT_LOAD_FAIL"));
      };

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

      if(Onion.state.currentStyle === finalHref){
        return resolve();
      }

      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = finalHref + "?v=" + Date.now();
      link.setAttribute("data-onion-style","true");

      link.onload = ()=>{

        document.querySelectorAll("link[data-onion-style]").forEach(l=>{
          if(l !== link){
            try{ l.remove(); }catch{}
          }
        });

        Onion.state.currentStyle = finalHref;
        resolve();
      };

      link.onerror = ()=>{
        link.remove();
        resolve();
      };

      document.head.appendChild(link);

    });

  };

  /* =========================
     FETCH HTML
  ========================= */

  Onion.fetchHTML = async function(url){

    const finalUrl = normalizeUrl(url);
    if(!finalUrl) return null;

    if(Onion.state.abortController){
      try{ Onion.state.abortController.abort(); }catch{}
    }

    const controller = new AbortController();
    Onion.state.abortController = controller;

    try{

      const res = await fetch(finalUrl, {
        signal: controller.signal,
        headers: { "X-Requested-With": "XMLHttpRequest" },
        credentials: "include"
      });

      if(res.status === 401){
        Onion.clearUser?.();
        Onion.auth?.redirectLogin?.();
        return null;
      }

      if(!res.ok){
        throw new Error("HTTP " + res.status);
      }

      const html = await res.text();

      if(!html.trim()){
        throw new Error("EMPTY_HTML");
      }

      return html;

    }catch(e){

      if(e.name === "AbortError"){
        return null;
      }

      throw e;

    }

  };

  /* =========================
     EXTRACT CONTENT
  ========================= */

  function extractContent(html){

    const wrapper = document.createElement("div");
    wrapper.innerHTML = html;

    let node = wrapper.querySelector(".panel-content");

    if(!node && wrapper.querySelector("body")){
      node = wrapper.querySelector("body");
    }

    if(!node){
      node = wrapper;
    }

    // 🔥 CLONAR para evitar referencias raras
    return node.cloneNode(true);
  }

  /* =========================
     SWAP CONTENT
  ========================= */

  Onion.swapContent = function(node){

    const app = document.getElementById("app-content");
    if(!app) return;

    app.style.opacity = "0";

    requestAnimationFrame(()=>{

      try{
        app.innerHTML = "";
        app.appendChild(node);
      }catch(e){
        Onion.error("Swap error:", e);
        app.innerHTML = "<div style='padding:20px'>Error</div>";
      }

      requestAnimationFrame(()=>{
        app.style.opacity = "1";
      });

    });

  };

  /* =========================
     MAIN RENDER
  ========================= */

  Onion.render = async function(){

    const renderId = ++Onion.state.renderId;

    Onion.state.rendering = true;

    try{

      const route = Onion.router.resolve();

      Onion.runCleanup?.();

      if(route.style){
        await Onion.loadStyle(route.style);
      }

      const html = await Onion.fetchHTML(route.page);
      if(html === null) return;

      if(renderId !== Onion.state.renderId) return;

      const content = extractContent(html);

      Onion.swapContent(content);

      if(route.script){
        await Onion.loadScript(route.script);
      }

      if(renderId !== Onion.state.renderId) return;

      // 🔥 AQUÍ SOLO NOTIFICAMOS → UI reacciona
      Onion.events.emit?.("nav:ready");

    }catch(e){

      Onion.error?.("💥 RENDER:", e);

      const app = document.getElementById("app-content");

      if(app){
        app.innerHTML = `
          <div style="padding:20px">
            <h2>Error</h2>
            <p>${e.message}</p>
            <button onclick="Onion.render()">Reintentar</button>
          </div>
        `;
      }

    }finally{

      Onion.state.rendering = false;
      Onion.state.navigating = false;

      document.body.classList.remove("loading");

    }

  };

})();

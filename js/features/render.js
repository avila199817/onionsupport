"use strict";

/* =========================
   RENDER (ONION FULL PRO MAX)
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
      Onion.error("URL error:", src);
      return null;
    }

  }

  /* =========================
     LOAD SCRIPT (SAFE)
  ========================= */

  Onion.loadScript = function(src){

    return new Promise((resolve, reject)=>{

      const finalSrc = normalizeUrl(src);
      if(!finalSrc) return resolve();

      if(Onion.state.currentScript === finalSrc){
        Onion.log("⚡ Script cache:", finalSrc);
        return resolve();
      }

      // 🔥 cleanup antes de cargar nuevo script
      Onion.runCleanup?.();

      document.querySelectorAll("script[data-onion-page]").forEach(s=>{
        try{ s.remove(); }catch{}
      });

      const s = document.createElement("script");

      s.src = finalSrc + "?v=" + Date.now();
      s.defer = true;
      s.async = false;
      s.setAttribute("data-onion-page","true");

      const timeout = setTimeout(()=>{
        Onion.error("⏱️ Script timeout:", finalSrc);
        s.remove();
        reject(new Error("SCRIPT_TIMEOUT"));
      }, Onion.config.TIMEOUT);

      s.onload = ()=>{
        clearTimeout(timeout);
        Onion.state.currentScript = finalSrc;
        Onion.log("✅ Script cargado:", finalSrc);
        resolve();
      };

      s.onerror = ()=>{
        clearTimeout(timeout);
        Onion.error("💥 Script fail:", finalSrc);
        s.remove();
        reject(new Error("SCRIPT_LOAD_FAIL"));
      };

      document.body.appendChild(s);

    });

  };

  /* =========================
     LOAD STYLE (SMART)
  ========================= */

  Onion.loadStyle = function(href){

    return new Promise((resolve)=>{

      const finalHref = normalizeUrl(href);
      if(!finalHref) return resolve();

      if(Onion.state.currentStyle === finalHref){
        Onion.log("⚡ Style cache:", finalHref);
        return resolve();
      }

      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = finalHref + "?v=" + Date.now();
      link.setAttribute("data-onion-style","true");

      const timeout = setTimeout(()=>{
        Onion.warn("⏱️ Style timeout:", finalHref);
        resolve();
      }, Onion.config.TIMEOUT);

      link.onload = ()=>{
        clearTimeout(timeout);

        document.querySelectorAll("link[data-onion-style]").forEach(l=>{
          if(l !== link){
            try{ l.remove(); }catch{}
          }
        });

        Onion.state.currentStyle = finalHref;
        Onion.log("🎨 Style cargado:", finalHref);

        resolve();
      };

      link.onerror = ()=>{
        clearTimeout(timeout);
        Onion.error("💥 Style fail:", finalHref);
        link.remove();
        resolve();
      };

      document.head.appendChild(link);

    });

  };

  /* =========================
     FETCH HTML (ROBUSTO)
  ========================= */

  Onion.fetchHTML = async function(url, useCache = true){

    const finalUrl = normalizeUrl(url);
    if(!finalUrl) return null;

    if(useCache && Onion.cache.html[finalUrl]){
      Onion.log("⚡ HTML cache:", finalUrl);
      return Onion.cache.html[finalUrl];
    }

    if(Onion.state.abortController){
      try{ Onion.state.abortController.abort(); }catch{}
    }

    const controller = new AbortController();
    Onion.state.abortController = controller;

    const timeout = setTimeout(()=>{
      controller.abort();
    }, Onion.config.TIMEOUT);

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

      if(useCache){
        Onion.cache.html[finalUrl] = html;
      }

      Onion.log("📄 HTML OK:", finalUrl);

      return html;

    }catch(e){

      if(e.name === "AbortError"){
        Onion.log("⚡ Fetch abortado");
        return null;
      }

      Onion.error("💥 FETCH HTML:", finalUrl, e.message);
      throw e;

    }finally{
      clearTimeout(timeout);
    }

  };

  /* =========================
     SWAP CONTENT (SMOOTH)
  ========================= */

  Onion.swapContent = function(node){

    const app = document.getElementById("app-content");
    if(!app) return;

    if(app.__swapping) return;
    app.__swapping = true;

    app.style.opacity = "0";

    setTimeout(()=>{

      try{
        app.innerHTML = "";

        if(node){
          app.appendChild(node);
        }else{
          app.innerHTML = "<div style='padding:20px'>Vacío</div>";
        }

      }catch(e){
        Onion.error("💥 swap error:", e);
        app.innerHTML = "<div style='padding:20px'>Error</div>";
      }

      requestAnimationFrame(()=>{
        app.style.opacity = "1";
        app.__swapping = false;
      });

    }, 120);

  };

  /* =========================
     MAIN RENDER (ANTI-RACE)
  ========================= */

  Onion.render = async function(){

    const renderId = ++Onion.state.renderId;

    if(Onion.state.rendering){
      Onion.warn("⚠️ Render en curso, se encadena");
    }

    Onion.state.rendering = true;

    try{

      const route = Onion.router.resolve();

      Onion.log("🎯 Render:", route.page);

      // STYLE
      if(route.style){
        await Onion.loadStyle(route.style);
      }

      // HTML
      const html = await Onion.fetchHTML(route.page, true);

      if(html === null){
        return;
      }

      if(renderId !== Onion.state.renderId){
        Onion.warn("Render viejo ignorado");
        return;
      }

      const wrapper = document.createElement("div");
      wrapper.innerHTML = html;

      const content = wrapper.querySelector(".panel-content") || wrapper;

      Onion.swapContent(content);

      // SCRIPT
      if(route.script){
        await Onion.loadScript(route.script);
      }

      // READY
      Onion.events.emit?.("nav:ready");

    }catch(e){

      Onion.error("💥 RENDER:", e);

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

    }

  };

})();

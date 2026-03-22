"use strict";

/* =========================
   RENDER (PRO SaaS - ONION)
========================= */

(function(){

  if(!window.Onion){
    console.error("💥 Onion no está definido (render.js)");
    return;
  }

  const Onion = window.Onion;

  /* =========================
     LOAD SCRIPT
  ========================= */

  Onion.loadScript = function(src){

    return new Promise((resolve, reject)=>{

      if(!src){
        Onion.warn("loadScript sin src");
        return resolve();
      }

      let finalSrc;

      try{
        if(src.startsWith("/")){
          finalSrc = window.location.origin + src;
        }else if(src.startsWith("http")){
          finalSrc = src;
        }else{
          finalSrc = window.location.origin + "/" + src.replace(/^\/+/,"");
        }
      }catch(e){
        Onion.error("URL parse error:", src);
        return reject(e);
      }

      if(Onion.state.currentScript === finalSrc){
        Onion.log("⚡ Script ya cargado:", finalSrc);
        return resolve();
      }

      const old = document.querySelector("script[data-onion-page]");
      if(old){
        try{ old.remove(); }catch{}
      }

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
        Onion.error("💥 Script load fail:", finalSrc);
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

      if(!href){
        Onion.warn("loadStyle sin href");
        return resolve();
      }

      let finalHref;

      try{
        if(href.startsWith("/")){
          finalHref = window.location.origin + href;
        }else if(href.startsWith("http")){
          finalHref = href;
        }else{
          finalHref = window.location.origin + "/" + href.replace(/^\/+/,"");
        }
      }catch(e){
        Onion.error("Style URL error:", href);
        return resolve();
      }

      if(Onion.state.currentStyle === finalHref){
        Onion.log("⚡ Style ya cargado:", finalHref);
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

        const old = document.querySelector("link[data-onion-style]");
        if(old && old !== link){
          try{ old.remove(); }catch{}
        }

        Onion.state.currentStyle = finalHref;

        Onion.log("🎨 Style cargado:", finalHref);

        resolve();
      };

      link.onerror = ()=>{
        clearTimeout(timeout);
        Onion.error("💥 Style load fail:", finalHref);
        link.remove();
        resolve();
      };

      document.head.appendChild(link);

    });

  };

  /* =========================
     FETCH HTML
  ========================= */

  Onion.fetchHTML = async function(url, useCache = true){

    if(!url){
      Onion.warn("fetchHTML sin URL");
      return null;
    }

    let finalUrl;

    try{
      if(url.startsWith("/")){
        finalUrl = window.location.origin + url;
      }else if(url.startsWith("http")){
        finalUrl = url;
      }else{
        finalUrl = window.location.origin + "/" + url.replace(/^\/+/,"");
      }
    }catch(e){
      Onion.error("URL HTML inválida:", url);
      return null;
    }

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
        Onion.auth?.clearToken?.();
        Onion.auth?.redirectLogin?.();
        return null;
      }

      if(!res.ok){
        throw new Error("PAGE_LOAD_ERROR " + res.status);
      }

      const html = await res.text();

      if(!html || html.trim().length === 0){
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

      Onion.error("💥 FETCH HTML ERROR:", finalUrl, e.message);
      throw e;

    }finally{
      clearTimeout(timeout);
    }

  };

  /* =========================
     SWAP CONTENT
  ========================= */

  Onion.swapContent = function(newContent){

    const app = document.getElementById("app-content");
    if(!app) return;

    if(app.__swapping) return;
    app.__swapping = true;

    app.style.transition = "opacity 0.15s ease";
    app.style.opacity = "0";

    setTimeout(()=>{

      try{

        app.innerHTML = "";

        if(newContent){
          app.appendChild(newContent);
        }else{
          app.innerHTML = "<div style='padding:20px'>Contenido vacío</div>";
        }

      }catch(e){

        Onion.error("💥 swapContent error:", e);

        app.innerHTML = "<div style='padding:20px'>Error renderizando contenido</div>";

      }

      requestAnimationFrame(()=>{
        app.style.opacity = "1";
        app.__swapping = false;
      });

    }, 150);

  };

  /* =========================
     MAIN RENDER
  ========================= */

  Onion.render = async function(){

    const renderId = ++Onion.state.renderId;

    if(Onion.state.abortController){
      try{ Onion.state.abortController.abort(); }catch{}
    }

    Onion.state.rendering = true;

    try{

      const routeConfig = Onion.router.resolve();

      const { page, style, script } = routeConfig;

      Onion.log("🎯 Render:", page);

      // 🎨 STYLE
      if(style){
        try{ await Onion.loadStyle(style); }catch{}
      }

      // 📄 HTML
      const html = await Onion.fetchHTML(page, true);

      if(html === null){
        Onion.state.rendering = false;
        Onion.state.navigating = false;
        return;
      }

      if(renderId !== Onion.state.renderId){
        Onion.warn("Render obsoleto ignorado");
        return;
      }

      const container = document.createElement("div");
      container.innerHTML = html;

      let content = container.querySelector(".panel-content") || container;

      Onion.swapContent(content);

      // 📜 SCRIPT
      if(script){
        try{ await Onion.loadScript(script); }catch{}
      }

      // 📡 READY EVENT
      Onion.events.emit("nav:ready");

    }catch(e){

      Onion.error("💥 RENDER ERROR:", e);

      const app = document.getElementById("app-content");

      if(app){
        app.innerHTML = `
          <div style="padding:20px">
            <h2>Error cargando página</h2>
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

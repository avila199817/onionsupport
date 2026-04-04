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

    if(typeof src !== "string"){
      console.error("💥 URL inválida:", src);
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

  /* =========================
     LOAD SCRIPT (UNITARIO)
  ========================= */
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

  /* =========================
     LOAD SCRIPT (MULTI 🔥)
  ========================= */
  Onion.loadScript = async function(scripts){

    if(!scripts) return;

    // 🔥 soporta string o array
    if(typeof scripts === "string"){
      scripts = [scripts];
    }

    if(!Array.isArray(scripts)){
      console.error("💥 Scripts inválidos:", scripts);
      return;
    }

    // 🔥 limpiar scripts anteriores
    document.querySelectorAll("script[data-onion-page]").forEach(s=>{
      try{ s.remove(); }catch{}
    });

    // 🔥 carga secuencial (orden garantizado)
    for(const src of scripts){
      await loadScriptSingle(src);
    }

  };

  /* =========================
     LOAD STYLE
  ========================= */
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
     RENDER PRO 🔥
  ========================= */
  Onion.render = async function(){

    const currentRenderId = ++Onion.state.renderId;

    try{

      Onion.ui.showLoader?.();

      const route = Onion.router.resolve();

      if(route.title){
        document.title = "Onion Support · " + route.title;
      }

      const html = await Onion.fetchHTML(route.page);

      if(currentRenderId !== Onion.state.renderId) return;

      const content = extractContent(html);
      content.classList.remove("ready");

      Onion.runCleanup?.();

      /* 🔥 ESTILOS */
      if(route.style){
        await Onion.loadStyle(route.style);
      }

      /* 🔥 HTML */
      Onion.swapContent(content);

      /* 🔥 SCRIPTS (AHORA MULTI 🔥) */
      if(route.script){
        await Onion.loadScript(route.script);
      }

      if(currentRenderId !== Onion.state.renderId) return;

      /* 🔥 DOBLE FRAME */
      await new Promise(r => requestAnimationFrame(r));
      await new Promise(r => requestAnimationFrame(r));

      content.classList.add("ready");

      Onion.ui.hideLoader?.();

    }catch(e){

      console.error("💥 RENDER ERROR:", e);

      Onion.ui.hideLoader?.();

    }

  };

})();

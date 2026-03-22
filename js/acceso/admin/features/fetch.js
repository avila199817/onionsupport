"use strict";

/* =========================
   FETCH (PRO SaaS - ONION)
========================= */

(function(){

  if(!window.Onion){
    console.error("💥 Onion no está definido (fetch.js)");
    return;
  }

  const Onion = window.Onion;

  /* =========================
     FETCH JSON (CORE)
  ========================= */

  Onion.fetch = async function(url, options = {}){

    if(!url){
      Onion.warn("fetch sin URL");
      throw new Error("NO_URL");
    }

    const controller = new AbortController();

    const timeout = setTimeout(()=>{
      controller.abort();
    }, Onion.config.TIMEOUT);

    try{

      const headers = Object.assign({
        "Content-Type": "application/json"
      }, options.headers || {});

      // 🔐 AUTH automática
      try{
        const token = Onion.auth?.getToken?.();
        if(token){
          headers["Authorization"] = "Bearer " + token;
        }
      }catch{}

      const res = await fetch(url, {
        method: options.method || "GET",
        body: options.body ? JSON.stringify(options.body) : undefined,
        headers,
        signal: controller.signal,
        credentials: "include"
      });

      // 🔐 401 → logout automático
      if(res.status === 401){

        Onion.warn("🔐 401 no autorizado");

        Onion.auth?.clearToken?.();
        Onion.auth?.redirectLogin?.();

        throw new Error("401");
      }

      let data;

      try{
        data = await res.json();
      }catch{
        throw new Error("INVALID_JSON");
      }

      if(!res.ok){

        const msg = data?.message || ("HTTP " + res.status);

        throw new Error(msg);
      }

      Onion.log("🌐 FETCH OK:", url);

      return data;

    }catch(e){

      if(e.name === "AbortError"){
        Onion.error("⏱️ TIMEOUT:", url);
        throw new Error("TIMEOUT");
      }

      Onion.error("💥 FETCH ERROR:", url, e.message);

      throw e;

    }finally{
      clearTimeout(timeout);
    }

  };

  /* =========================
     FETCH HTML (SPA)
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

    // ⚡ CACHE
    if(useCache && Onion.cache.html[finalUrl]){
      Onion.log("⚡ HTML cache:", finalUrl);
      return Onion.cache.html[finalUrl];
    }

    // 🔥 cancelar request anterior
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
        headers: {
          "X-Requested-With": "XMLHttpRequest"
        },
        credentials: "include"
      });

      // 🔐 backend fuerza login
      if(res.status === 401){
        Onion.warn("🔐 HTML 401");
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

      // 💾 guardar en cache
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

})();

"use strict";

/* =========================
   FETCH (ONION PRO FINAL STABLE)
========================= */

(function(){

  if(!window.Onion){
    console.error("💥 Onion no está definido (fetch.js)");
    return;
  }

  const Onion = window.Onion;

  /* =========================
     NORMALIZE URL (🔥 FIX REAL)
  ========================= */

  function normalizeUrl(url){

    if(!url) return null;

    try{

      // FULL URL
      if(url.startsWith("http")){
        return url;
      }

      // 🔥 BASE API limpia (sin duplicar /api)
      const API = Onion.config.API.replace(/\/api$/, "");

      // /api/... → ya viene completa
      if(url.startsWith("/api/")){
        return API + url;
      }

      // /user/... → añadir /api
      if(url.startsWith("/")){
        return Onion.config.API + url;
      }

      return Onion.config.API + "/" + url;

    }catch(e){
      Onion.error("URL inválida:", url);
      return null;
    }

  }

  /* =========================
     FETCH
  ========================= */

  Onion.fetch = async function(url, options = {}){

    const finalUrl = normalizeUrl(url);

    if(!finalUrl){
      throw new Error("NO_URL");
    }

    const internalController = new AbortController();
    const signal = options.signal || internalController.signal;

    const timeout = setTimeout(()=>{
      if(!options.signal){
        internalController.abort();
      }
    }, Onion.config.TIMEOUT);

    try{

      const headers = {
        ...(options.headers || {})
      };

      /* =========================
         CONTENT TYPE AUTO
      ========================= */

      if(options.body && !headers["Content-Type"]){
        headers["Content-Type"] = "application/json";
      }

      /* =========================
         TOKEN (🔥 CLAVE)
      ========================= */

      try{
        const token = Onion.auth?.getToken?.();
        if(token){
          headers["Authorization"] = "Bearer " + token;
        }
      }catch{}

      /* =========================
         BODY NORMALIZATION
      ========================= */

      let body = options.body;

      if(body && headers["Content-Type"] === "application/json" && typeof body !== "string"){
        body = JSON.stringify(body);
      }

      const res = await fetch(finalUrl, {
        method: options.method || "GET",
        headers,
        body,
        signal,
        credentials: "include"
      });

      /* =========================
         AUTH CONTROL
      ========================= */

      if(res.status === 401){
        Onion.warn("🔐 401 no autorizado");
        throw new Error("401");
      }

      /* =========================
         PARSE RESPONSE
      ========================= */

      let data;
      const contentType = res.headers.get("content-type") || "";

      if(contentType.includes("application/json")){
        try{
          data = await res.json();
        }catch{
          throw new Error("INVALID_JSON");
        }
      }else{
        data = await res.text();
      }

      /* =========================
         ERROR CONTROL
      ========================= */

      if(!res.ok){

        const msg =
          (typeof data === "object" && data?.message)
          || ("HTTP " + res.status);

        throw new Error(msg);
      }

      return data;

    }catch(e){

      if(e.name === "AbortError"){
        throw new Error("TIMEOUT");
      }

      throw e;

    }finally{
      clearTimeout(timeout);
    }

  };

})();

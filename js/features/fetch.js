"use strict";

/* =========================
   FETCH (ONION PRO FIXED)
   - No navega
   - No invade router
========================= */

(function(){

  if(!window.Onion){
    console.error("💥 Onion no está definido (fetch.js)");
    return;
  }

  const Onion = window.Onion;

  /* =========================
     NORMALIZE URL
  ========================= */

  function normalizeUrl(url){

    if(!url) return null;

    try{
      if(url.startsWith("http")){
        return url;
      }
      if(url.startsWith("/")){
        return window.location.origin + url;
      }
      return window.location.origin + "/" + url.replace(/^\/+/,"");
    }catch(e){
      Onion.error("URL inválida:", url);
      return null;
    }

  }

  /* =========================
     FETCH JSON
  ========================= */

  Onion.fetch = async function(url, options = {}){

    const finalUrl = normalizeUrl(url);

    if(!finalUrl){
      throw new Error("NO_URL");
    }

    const controller = new AbortController();

    const timeout = setTimeout(()=>{
      controller.abort();
    }, Onion.config.TIMEOUT);

    try{

      const headers = {
        ...(options.headers || {})
      };

      if(options.body && !headers["Content-Type"]){
        headers["Content-Type"] = "application/json";
      }

      try{
        const token = Onion.auth?.getToken?.();
        if(token){
          headers["Authorization"] = "Bearer " + token;
        }
      }catch{}

      const res = await fetch(finalUrl, {
        method: options.method || "GET",
        body: options.body
          ? (headers["Content-Type"] === "application/json"
            ? JSON.stringify(options.body)
            : options.body)
          : undefined,
        headers,
        signal: controller.signal,
        credentials: "include"
      });

      /* =========================
         AUTH CONTROL
      ========================= */

      if(res.status === 401){
        Onion.warn("🔐 401 no autorizado");

        // 🔥 SOLO limpiamos estado
        Onion.clearUser?.();
        Onion.auth?.clearToken?.();

        throw new Error("401");
      }

      /* =========================
         PARSE
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

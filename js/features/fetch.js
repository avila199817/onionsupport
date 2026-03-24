"use strict";

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

      const API = Onion.config.API.replace(/\/api$/, "");

      if(url.startsWith("/api/")){
        return API + url;
      }

      if(url.startsWith("/")){
        return Onion.config.API + url;
      }

      return Onion.config.API + "/" + url;

    }catch(e){
      console.error("URL inválida:", url);
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

    const controller = new AbortController();
    const signal = options.signal || controller.signal;

    const timeout = setTimeout(()=>{
      if(!options.signal){
        controller.abort();
      }
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

      if(res.status === 401){
        throw new Error("401");
      }

      let data;
      const contentType = res.headers.get("content-type") || "";

      if(contentType.includes("application/json")){
        data = await res.json().catch(()=>{ throw new Error("INVALID_JSON"); });
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

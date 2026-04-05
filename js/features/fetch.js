"use strict";

/* =========================================================
   🧅 FETCH — FULL PRO (FIXED · SIN RACE · ABORT CONTROLADO)
========================================================= */

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
      Onion.error("URL inválida:", url);
      return null;
    }

  }

  /* =========================
     FETCH PRO
  ========================= */

  Onion.fetch = async function(url, options = {}){

    const finalUrl = normalizeUrl(url);

    if(!finalUrl){
      throw new Error("NO_URL");
    }

    /* =========================
       ABORT CONTROLADO (🔥 FIX)
    ========================= */

    let controller;
    let signal;

    if(options.signal){
      // usar señal externa → NO tocar global
      signal = options.signal;
    }else{
      // solo aquí usamos abort global
      if(Onion.state.abortController){
        try{ Onion.state.abortController.abort(); }catch{}
      }

      controller = new AbortController();
      Onion.state.abortController = controller;
      signal = controller.signal;
    }

    /* =========================
       TIMEOUT
    ========================= */

    const timeout = setTimeout(()=>{
      if(controller){
        controller.abort();
      }
    }, Onion.config.TIMEOUT || 10000);

    try{

      const headers = {
        ...(options.headers || {})
      };

      let body = options.body;

      /* =========================
         CONTENT TYPE AUTO
      ========================= */

      const isFormData = typeof FormData !== "undefined" && body instanceof FormData;

      if(body && !isFormData && !headers["Content-Type"]){
        headers["Content-Type"] = "application/json";
      }

      /* =========================
         AUTH TOKEN
      ========================= */

      try{
        const token = Onion.auth?.getToken?.();
        if(token){
          headers["Authorization"] = "Bearer " + token;
        }
      }catch{}

      /* =========================
         SERIALIZE BODY
      ========================= */

      if(
        body &&
        headers["Content-Type"] === "application/json" &&
        typeof body !== "string"
      ){
        body = JSON.stringify(body);
      }

      /* =========================
         REQUEST
      ========================= */

      const res = await fetch(finalUrl, {
        method: options.method || "GET",
        headers,
        body,
        signal,
        credentials: "include"
      });

      /* =========================
         AUTH ERROR
      ========================= */

      if(res.status === 401){
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
         ERROR HANDLING
      ========================= */

      if(!res.ok){

        const msg =
          (typeof data === "object" && data?.message)
          || (typeof data === "string" && data)
          || ("HTTP " + res.status);

        const error = new Error(msg);
        error.status = res.status;
        error.data = data;

        throw error;
      }

      return data;

    }catch(e){

      if(e.name === "AbortError"){
        throw new Error("ABORTED");
      }

      throw e;

    }finally{

      clearTimeout(timeout);

      // limpiar SOLO si es el controller global
      if(controller && Onion.state.abortController === controller){
        Onion.state.abortController = null;
      }

    }

  };

  /* =========================
     DEBUG
  ========================= */

  if(Onion.config?.DEBUG){
    Onion.log("🌐 Fetch system PRO ready");
  }

})();

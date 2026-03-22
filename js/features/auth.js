"use strict";

/* =========================
   AUTH (PRO SaaS - ONION)
========================= */

(function(){

  if(!window.Onion){
    console.error("💥 Onion no está definido (auth.js)");
    return;
  }

  const Onion = window.Onion;

  /* =========================
     STORAGE SAFE
  ========================= */

  function safeSet(key, value){
    try{
      localStorage.setItem(key, value);
    }catch(e){
      Onion.warn("⚠️ localStorage bloqueado (set)");
    }
  }

  function safeGet(key){
    try{
      return localStorage.getItem(key);
    }catch(e){
      Onion.warn("⚠️ localStorage bloqueado (get)");
      return null;
    }
  }

  function safeRemove(key){
    try{
      localStorage.removeItem(key);
    }catch(e){
      Onion.warn("⚠️ localStorage bloqueado (remove)");
    }
  }

  /* =========================
     TOKEN MANAGEMENT
  ========================= */

  Onion.auth.getToken = function(){

    const token = safeGet("onion_token");

    if(!token){
      throw new Error("NO_TOKEN");
    }

    return token;
  };

  Onion.auth.setToken = function(token){

    if(!token){
      Onion.warn("Intento de guardar token vacío");
      return;
    }

    safeSet("onion_token", token);

    Onion.log("🔐 Token guardado");
  };

  Onion.auth.clearToken = function(){

    safeRemove("onion_token");

    Onion.log("🧹 Token eliminado");
  };

  /* =========================
     SESSION RESET (FULL CLEAN)
  ========================= */

  Onion.auth.resetSession = function(){

    try{

      Onion.auth.clearToken();

      // 🔥 limpiar sessionStorage
      try{
        sessionStorage.clear();
      }catch{}

      // 🔥 limpiar cookies (best effort)
      try{
        document.cookie.split(";").forEach(c => {
          document.cookie = c
            .replace(/^ +/, "")
            .replace(/=.*/, "=;expires=" + new Date(0).toUTCString() + ";path=/");
        });
      }catch{}

      Onion.log("🧹 Sesión completamente limpiada");

    }catch(e){
      Onion.error("💥 resetSession error:", e);
    }

  };

  /* =========================
     REDIRECT LOGIN
  ========================= */

  Onion.auth.redirectLogin = function(){

    Onion.warn("🔐 Redirigiendo a login");

    // 🔥 evita loops si ya estás en login
    if(window.location.pathname.includes("/login") || window.location.pathname.includes("/acceso")){
      return;
    }

    window.location.replace("/login");

  };

  /* =========================
     REQUIRE AUTH (GUARD)
  ========================= */

  Onion.auth.require = function(){

    try{

      Onion.auth.getToken();

      return true;

    }catch(e){

      Onion.warn("🔐 Acceso bloqueado");

      Onion.auth.redirectLogin();

      return false;

    }

  };

  /* =========================
     OPTIONAL: SET USER
  ========================= */

  Onion.setUser = function(user){

    const prev = Onion.state.user || null;
    const next = user || null;

    const same = JSON.stringify(prev) === JSON.stringify(next);

    if(same){
      Onion.log("👤 User sin cambios");
      return;
    }

    Onion.state.user = next;

    // 🔗 gestionar slug
    const slug = next?.slug || null;
    Onion.state.slug = slug;

    try{
      if(slug){
        localStorage.setItem("onion_slug", slug);
      }else{
        localStorage.removeItem("onion_slug");
      }
    }catch(e){
      Onion.warn("Error guardando slug");
    }

    if(next){
      Onion.state.ready = true;
    }

    Onion.log("👤 User actualizado:", next);

    Onion.events?.emit?.("user:changed", {
      prev,
      current: next
    });

  };

})();

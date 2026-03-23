"use strict";

/* =========================
   AUTH (ONION PRO MAX)
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
    }catch{
      Onion.warn("⚠️ localStorage bloqueado (set)");
    }
  }

  function safeGet(key){
    try{
      return localStorage.getItem(key);
    }catch{
      Onion.warn("⚠️ localStorage bloqueado (get)");
      return null;
    }
  }

  function safeRemove(key){
    try{
      localStorage.removeItem(key);
    }catch{
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

      Onion.clearUser?.();

      // session
      try{ sessionStorage.clear(); }catch{}

      // cookies (best effort)
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

    const path = window.location.pathname;

    // evitar bucle
    if(path.startsWith("/auth")) return;

    Onion.auth.resetSession();

    // puedes cambiar esto a /login si quieres
    window.location.replace("/auth");

  };

  /* =========================
     REQUIRE AUTH (GUARD)
  ========================= */

  Onion.auth.require = function(){

    try{

      Onion.auth.getToken();
      return true;

    }catch{

      Onion.warn("🔐 Acceso bloqueado");

      Onion.auth.redirectLogin();
      return false;

    }

  };

})();

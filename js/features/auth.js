"use strict";

/* =========================
   AUTH (ONION PRO FIXED)
   - Sin excepciones innecesarias
   - Sin dobles redirects
========================= */

(function(){

  if(!window.Onion){
    console.error("💥 Onion no está definido (auth.js)");
    return;
  }

  const Onion = window.Onion;

  let redirecting = false;

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
     TOKEN
  ========================= */

  Onion.auth.getToken = function(){
    return safeGet("onion_token"); // 🔥 ya no lanza error
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
     RESET SESSION
  ========================= */

  Onion.auth.resetSession = function(){

    try{

      Onion.auth.clearToken();
      Onion.clearUser?.();

      try{ sessionStorage.clear(); }catch{}

      try{
        document.cookie.split(";").forEach(c => {
          document.cookie = c
            .replace(/^ +/, "")
            .replace(/=.*/, "=;expires=" + new Date(0).toUTCString() + ";path=/");
        });
      }catch{}

      Onion.log("🧹 Sesión limpiada");

    }catch(e){
      Onion.error("💥 resetSession error:", e);
    }

  };

  /* =========================
     REDIRECT LOGIN (SAFE)
  ========================= */

  Onion.auth.redirectLogin = function(){

    if(redirecting) return;
    redirecting = true;

    Onion.warn("🔐 Redirigiendo a login");

    const path = window.location.pathname;

    if(path.startsWith("/auth")) return;

    Onion.auth.resetSession();

    window.location.replace("/auth");

  };

  /* =========================
     REQUIRE AUTH
  ========================= */

  Onion.auth.require = function(){

    const token = Onion.auth.getToken();

    if(token) return true;

    Onion.warn("🔐 Acceso bloqueado");

    Onion.auth.redirectLogin();
    return false;

  };

})();

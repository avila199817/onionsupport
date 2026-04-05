"use strict";

/* =========================================================
   🧅 AUTH — FULL PRO (SIN DUPLICADOS, SOURCE OF TRUTH = CORE)
========================================================= */

(function(){

  if(!window.Onion){
    console.error("💥 Onion no está definido (auth.js)");
    return;
  }

  const Onion = window.Onion;

  let redirecting = false;

  /* =========================
     SAFE STORAGE
  ========================= */

  function safeSet(key, value){
    try{ localStorage.setItem(key, value); }catch{}
  }

  function safeGet(key){
    try{ return localStorage.getItem(key); }catch{ return null; }
  }

  function safeRemove(key){
    try{ localStorage.removeItem(key); }catch{}
  }

  /* =========================
     TOKEN
  ========================= */

  Onion.auth = Onion.auth || {};

  Onion.auth.getToken = function(){
    return safeGet("onion_token");
  };

  Onion.auth.setToken = function(token){
    if(!token) return;
    safeSet("onion_token", token);
  };

  Onion.auth.clearToken = function(){
    safeRemove("onion_token");
  };

  /* =========================
     PERMISSIONS (CORE USER)
  ========================= */

  Onion.can = function(permission){

    const user = Onion.getUser?.();

    if(!user || !Array.isArray(user.permissions)) return false;

    return user.permissions.includes(permission);
  };

  /* =========================
     RESET SESSION (HARD)
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

    }catch(e){
      console.error("💥 resetSession error:", e);
    }

  };

  /* =========================
     REDIRECT LOGIN
  ========================= */

  Onion.auth.redirectLogin = function(){

    if(redirecting) return;
    redirecting = true;

    const path = window.location.pathname;

    // evitar loop
    if(path.startsWith("/auth")){
      redirecting = false;
      return;
    }

    Onion.auth.resetSession();

    window.location.replace("/auth");

  };

  /* =========================
     REQUIRE AUTH (GUARD)
  ========================= */

  Onion.auth.require = function(){

    const token = Onion.auth.getToken();

    if(token) return true;

    Onion.auth.redirectLogin();
    return false;

  };

  /* =========================
     LOGOUT CENTRALIZADO 🔥
  ========================= */

  Onion.auth.logout = async function(){

    try{

      await fetch(Onion.config.API + "/auth/logout", {
        method: "POST",
        credentials: "include"
      });

    }catch(e){
      console.warn("⚠️ Logout request falló (continuamos cleanup)");
    }

    Onion.auth.resetSession();

    window.location.href = "/auth";

  };

  /* =========================
     DEBUG
  ========================= */

  if(Onion.config?.DEBUG){
    Onion.log("🔐 Auth system PRO ready");
  }

})();

"use strict";

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
    }catch{}
  }

  function safeGet(key){
    try{
      return localStorage.getItem(key);
    }catch{
      return null;
    }
  }

  function safeRemove(key){
    try{
      localStorage.removeItem(key);
    }catch{}
  }

  /* =========================
     TOKEN
  ========================= */

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

    Onion.auth.redirectLogin();
    return false;

  };

})();

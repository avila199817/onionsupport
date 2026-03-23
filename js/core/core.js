"use strict";

/* =========================
   INIT GUARD (ANTI DUPLICADO)
========================= */

if (window.Onion) {
  console.warn("⚠️ Onion ya inicializado");
} else {

  /* =========================
     CORE OBJECT (LOCKED)
  ========================= */

  const Onion = {};
  Object.defineProperty(window, "Onion", {
    value: Onion,
    writable: false,
    configurable: false
  });

  /* =========================
     VERSION
  ========================= */

  Onion.version = "1.0.0";

  /* =========================
     CONFIG (FREEZED)
  ========================= */

  Onion.config = Object.freeze({
    API: "https://api.onionit.net/api",
    TIMEOUT: 10000,
    DEBUG: true,
    ENV: "production"
  });

  /* =========================
     LOGGER (SAFE)
  ========================= */

  const format = (type, args) => [type, ...args];

  Onion.log = function (...args) {
    if (Onion.config.DEBUG) {
      console.log(...format("🧅", args));
    }
  };

  Onion.warn = function (...args) {
    if (Onion.config.DEBUG) {
      console.warn(...format("⚠️", args));
    }
  };

  Onion.error = function (...args) {
    console.error(...format("💥", args));
  };

  /* =========================
     SAFE STORAGE
  ========================= */

  function safeStorage(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      console.warn("⚠️ localStorage bloqueado");
      return null;
    }
  }

  /* =========================
     STATE (CENTRAL SOURCE)
  ========================= */

  Onion.state = {
    user: null,
    slug: safeStorage("onion_user_slug"),
    rendering: false,
    navigating: false,
    renderId: 0,
    currentScript: null,
    currentStyle: null,
    abortController: null,
    cleanup: [],
    ready: false
  };

  /* =========================
     CACHE
  ========================= */

  Onion.cache = {
    html: Object.create(null),
    data: Object.create(null)
  };

  /* =========================
     BASE NAMESPACES (SAFE)
  ========================= */

  Onion.events = Onion.events || {};
  Onion.ui = Onion.ui || {};
  Onion.auth = Onion.auth || {};
  Onion.router = Onion.router || {};

  /* =========================
     USER MANAGEMENT (CLAVE 🔥)
  ========================= */

  Onion.setUser = function(user){

    if(!user){
      Onion.warn("setUser sin datos");
      return;
    }

    Onion.state.user = user;

    try{
      localStorage.setItem("onion_user_slug", user.username || "");
      localStorage.setItem("onion_user_name", user.name || "");
      localStorage.setItem("onion_user_avatar", user.avatar || "");
    }catch(e){
      Onion.warn("No se pudo guardar user");
    }

    Onion.log("👤 User set:", user);

  };

  Onion.getUser = function(){

    if(Onion.state.user){
      return Onion.state.user;
    }

    const username = safeStorage("onion_user_slug");
    const name = safeStorage("onion_user_name");
    const avatar = safeStorage("onion_user_avatar");

    if(username || name || avatar){
      return {
        username,
        name,
        avatar
      };
    }

    return null;

  };

  Onion.clearUser = function(){

    Onion.state.user = null;

    try{
      localStorage.removeItem("onion_user_slug");
      localStorage.removeItem("onion_user_name");
      localStorage.removeItem("onion_user_avatar");
    }catch{}

  };

  /* =========================
     NAVIGATION (SPA CORE)
  ========================= */

  Onion.go = function(path){

    if(!path) return;

    if(Onion.state.navigating) return;
    Onion.state.navigating = true;

    history.pushState({}, "", path);

    Onion.render?.();

  };

  /* =========================
     CLEANUP SYSTEM
  ========================= */

  Onion.onCleanup = function(fn){

    if(typeof fn !== "function") return;

    Onion.state.cleanup.push(fn);

  };

  Onion.runCleanup = function(){

    Onion.state.cleanup.forEach(fn=>{
      try{ fn(); }catch(e){
        Onion.warn("Cleanup error:", e);
      }
    });

    Onion.state.cleanup = [];

  };

  /* =========================
     SIMPLE DATA CACHE (PRO)
  ========================= */

  Onion.setCache = function(key, value){
    if(!key) return;
    Onion.cache.data[key] = value;
  };

  Onion.getCache = function(key){
    return Onion.cache.data[key] || null;
  };

  Onion.clearCache = function(key){
    if(key){
      delete Onion.cache.data[key];
    }else{
      Onion.cache.data = Object.create(null);
    }
  };

}

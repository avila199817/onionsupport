"use strict";

/* =========================
   INIT GUARD (ANTI DUPLICADO)
========================= */

if (window.Onion) {
  console.warn("⚠️ Onion ya inicializado");
} else {

  const Onion = {};
  Object.defineProperty(window, "Onion", {
    value: Onion,
    writable: false,
    configurable: false
  });

  /* =========================
     VERSION
  ========================= */

  Onion.version = "1.1.1";

  /* =========================
     CONFIG
  ========================= */

  Onion.config = Object.freeze({
    API: "https://api.onionit.net/api",
    TIMEOUT: 10000,
    DEBUG: true,
    ENV: "production"
  });

  /* =========================
     LOGGER
  ========================= */

  function logWrap(icon, args){
    return [icon, ...args];
  }

  Onion.log = (...args)=>{
    if(Onion.config.DEBUG){
      console.log(...logWrap("🧅", args));
    }
  };

  Onion.warn = (...args)=>{
    if(Onion.config.DEBUG){
      console.warn(...logWrap("⚠️", args));
    }
  };

  Onion.error = (...args)=>{
    console.error(...logWrap("💥", args));
  };

  /* =========================
     SAFE STORAGE
  ========================= */

  function safeGet(key){
    try{
      return localStorage.getItem(key);
    }catch{
      return null;
    }
  }

  function safeSet(key, val){
    try{
      localStorage.setItem(key, val);
    }catch{}
  }

  function safeRemove(key){
    try{
      localStorage.removeItem(key);
    }catch{}
  }

  /* =========================
     STATE
  ========================= */

  Onion.state = {
    user: null,
    slug: safeGet("onion_user_slug"),

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
     NAMESPACES
  ========================= */

  Onion.events = {};
  Onion.ui = {};
  Onion.auth = {};
  Onion.router = {};

  /* =========================
     USER MANAGEMENT
  ========================= */

  Onion.setUser = function(user){

    if(!user || typeof user !== "object"){
      Onion.warn("⚠️ setUser inválido");
      return;
    }

    const cleanUser = {
      id: user.id || user.userId || null,
      username: user.username || "",
      name: user.name || user.username || user.email || "Usuario",
      email: user.email || "",
      avatar: user.avatar || null,
      hasAvatar: user.hasAvatar === true
    };

    Onion.state.user = cleanUser;

    safeSet("onion_user_slug", cleanUser.username);
    safeSet("onion_user_name", cleanUser.name);
    safeSet("onion_user_avatar", cleanUser.avatar || "");

    Onion.log("👤 User set:", cleanUser);

  };

  Onion.getUser = function(){

    if(Onion.state.user){
      return Onion.state.user;
    }

    const username = safeGet("onion_user_slug");
    const name = safeGet("onion_user_name");
    const avatar = safeGet("onion_user_avatar");

    if(username || name || avatar){
      return {
        username,
        name,
        avatar,
        hasAvatar: !!avatar
      };
    }

    return null;

  };

  Onion.clearUser = function(){

    Onion.state.user = null;

    safeRemove("onion_user_slug");
    safeRemove("onion_user_name");
    safeRemove("onion_user_avatar");

    Onion.log("🧹 User cleared");

  };

  /* =========================
     NAVIGATION (FIX)
  ========================= */

  Onion.go = function(path){

    if(!path) return;

    // 🔥 SIEMPRE usar router
    Onion.router?.navigate?.(path);

  };

  /* =========================
     CLEANUP SYSTEM
  ========================= */

  Onion.onCleanup = function(fn){

    if(typeof fn !== "function") return;

    if(!Array.isArray(Onion.state.cleanup)){
      Onion.state.cleanup = [];
    }

    if(Onion.state.cleanup.includes(fn)) return;

    Onion.state.cleanup.push(fn);

  };

  Onion.runCleanup = function(){

    const list = Onion.state.cleanup;

    if(!Array.isArray(list) || list.length === 0){
      return;
    }

    Onion.state.cleanup = [];

    for(let i = 0; i < list.length; i++){
      try{
        list[i]();
      }catch(e){
        Onion.error("Cleanup error:", e);
      }
    }

  };

  /* =========================
     CACHE HELPERS
  ========================= */

  Onion.setCache = function(key, value){
    if(!key) return;
    Onion.cache.data[key] = value;
  };

  Onion.getCache = function(key){
    return Onion.cache.data[key] ?? null;
  };

  Onion.clearCache = function(key){
    if(key){
      delete Onion.cache.data[key];
    }else{
      Onion.cache.data = Object.create(null);
    }
  };

}

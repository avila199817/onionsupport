"use strict";

/* =========================
   INIT GUARD
========================= */

if (window.Onion) {
  console.warn("⚠️ Onion ya inicializado");
} else {

  const Onion = {};
  window.Onion = Onion; // 🔥 FIX: sin defineProperty

  /* =========================
     VERSION
  ========================= */

  Onion.version = "2.0.0";

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

  function wrap(icon, args){
    return [icon, ...args];
  }

  Onion.log = (...args)=>{
    if(Onion.config.DEBUG){
      console.log(...wrap("🧅", args));
    }
  };

  Onion.warn = (...args)=>{
    if(Onion.config.DEBUG){
      console.warn(...wrap("⚠️", args));
    }
  };

  Onion.error = (...args)=>{
    console.error(...wrap("💥", args));
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

    cleanup: [], // 🔥 usado por cleanup.js

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
      Onion.warn("setUser inválido");
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
     NAVIGATION (SAFE)
  ========================= */

  Onion.go = function(path){

    if(!path) return;

    if(typeof Onion.router?.navigate !== "function"){
      Onion.warn("Router no disponible");
      return;
    }

    Onion.router.navigate(path);

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

  /* =========================
     READY FLAG
  ========================= */

  Onion.state.ready = true;

  Onion.log("🚀 Onion Core listo");

}

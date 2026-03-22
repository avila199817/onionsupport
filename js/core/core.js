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
    writable: false,     // 🔥 no se puede sobrescribir
    configurable: false  // 🔥 no se puede borrar
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
     STATE (CENTRAL SOURCE)
  ========================= */

  Onion.state = {
    user: null,
    slug: safeStorage("onion_slug"),
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
     CACHE (SAFE)
  ========================= */

  Onion.cache = {
    html: Object.create(null)
  };

  /* =========================
     BASE NAMESPACES
  ========================= */

  Onion.events = {};
  Onion.ui = {};
  Onion.auth = {};
  Onion.router = {};

  /* =========================
     SAFE STORAGE (ANTI CRASH)
  ========================= */

  function safeStorage(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      console.warn("⚠️ localStorage bloqueado");
      return null;
    }
  }

}

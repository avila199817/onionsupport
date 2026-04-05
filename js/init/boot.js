"use strict";

/* =========================================================
   🧅 BOOT — GOD MODE (SIDEBAR FIRST · APP CONTROL · ZERO DESYNC)
========================================================= */

(function(){

  if(!window.Onion){
    console.error("💥 Onion no existe (boot)");
    return;
  }

  const Onion = window.Onion;

  /* =========================================================
     STATE BASE
  ========================================================= */

  Onion.state = Onion.state || {};
  Onion.state.appReady = false;

  /* =========================
     THEME (ANTES DE TODO)
  ========================= */

  try{

    const config = JSON.parse(localStorage.getItem("onion_config") || "{}");

    let darkMode;

    if(typeof config.darkMode === "boolean"){
      darkMode = config.darkMode;
    }else{
      darkMode = window.matchMedia("(prefers-color-scheme: dark)").matches;
    }

    const theme = darkMode ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", theme);

  }catch{
    document.documentElement.setAttribute("data-theme", "dark");
  }

  /* =========================
     SAFE LOADER
  ========================= */

  function hideLoaderSafe(){

    document.body.classList.remove("loading");

    const loader = document.getElementById("app-loader");

    if(loader){
      loader.style.opacity = "0";

      setTimeout(()=>{
        try{ loader.remove(); }catch{}
      }, 200);
    }

  }

  /* =========================
     BOOT
  ========================= */

  document.addEventListener("DOMContentLoaded", async () => {

    let bootTimeout;

    try{

      /* 🔥 FAILSAFE GLOBAL */
      bootTimeout = setTimeout(()=>{
        Onion.warn("Loader timeout fallback");
        hideLoaderSafe();
      }, 4000);

      /* =========================
         USER CONFIG
      ========================= */

      Onion.userConfig?.apply?.();

      /* =========================
         LANG
      ========================= */

      const lang = Onion.userConfig?.get?.("lang") || "es";
      Onion.i18n?.setLang?.(lang);

      /* =========================
         AUTH PRECHECK
      ========================= */

      Onion.state.slug = localStorage.getItem("onion_user_slug");

      if(!Onion.state.slug){
        hideLoaderSafe();
        Onion.auth?.redirectLogin?.();
        return;
      }

      /* =========================
         INIT CORE
      ========================= */

      await Onion.init();

      /* =========================
         APP READY (SIDEBAR MANDA)
      ========================= */

      Onion.events?.on?.("app:ready", ()=>{

        if(Onion.state.appReady) return;

        Onion.state.appReady = true;

        Onion.ui?.init?.();
        Onion.i18n?.apply?.();

        // 🔥 PRIMER RENDER SOLO CUANDO TODO ESTÁ OK
        Onion.render();

      });

      /* =========================
         FINAL LOADER
      ========================= */

      clearTimeout(bootTimeout);

      if(document.body.classList.contains("loading")){
        hideLoaderSafe();
      }

    }catch(e){

      Onion.error("BOOT ERROR:", e);

      clearTimeout(bootTimeout);
      hideLoaderSafe();

    }

  });

  /* =========================
     DEBUG
  ========================= */

  if(Onion.config?.DEBUG){
    Onion.log("⚡ Boot GOD MODE ready");
  }

})();

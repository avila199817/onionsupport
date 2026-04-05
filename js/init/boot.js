"use strict";

(function(){

  if(!window.Onion){
    console.error("💥 Onion no existe (boot)");
    return;
  }

  const Onion = window.Onion;

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


  /* =========================================================
     🔥 SAFE LOADER
  ========================================================= */

  function hideLoaderSafe(){

    // quitar clase global
    document.body.classList.remove("loading");

    const loader = document.getElementById("app-loader");

    if(loader){
      loader.style.opacity = "0";

      setTimeout(()=>{
        try{ loader.remove(); }catch{}
      }, 200);
    }

  }


  /* =========================================================
     BOOT
  ========================================================= */

  document.addEventListener("DOMContentLoaded", async () => {

    let bootTimeout;

    try{

      /* 🔥 FALLBACK GLOBAL (ANTI-BLOQUEO) */
      bootTimeout = setTimeout(()=>{
        console.warn("⚠️ Loader timeout fallback");
        hideLoaderSafe();
      }, 4000);

      /* =========================
         CONFIG
      ========================= */

      Onion.userConfig?.apply?.();

      /* =========================
         IDIOMA
      ========================= */

      const lang = Onion.userConfig?.get?.("lang") || "es";
      Onion.i18n?.setLang?.(lang);

      /* =========================
         AUTH (PRE-CHECK)
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
         READY → UI (EVENTO GLOBAL)
      ========================= */

      Onion.events?.on?.("app:ready", ()=>{
        Onion.ui?.init?.();
        Onion.i18n?.apply?.();
      });

      /* =========================
         LOADER CONTROL FINAL
      ========================= */

      clearTimeout(bootTimeout);

      // 🔥 solo si aún sigue activo
      if(document.body.classList.contains("loading")){
        hideLoaderSafe();
      }

    }catch(e){

      console.error("💥 BOOT ERROR:", e);

      clearTimeout(bootTimeout);
      hideLoaderSafe();

    }

  });

})();

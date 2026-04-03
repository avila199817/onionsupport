/* =========================================================
   🔥 BOOT — SAFE LOADER CONTROL (SAAS PRO)
========================================================= */
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
     🔥 SAFE LOADER (CLAVE DE TODO)
  ========================================================= */

  function hideLoaderSafe(){

    document.body.classList.remove("loading");

    const loader = document.getElementById("app-loader");

    if(loader){
      loader.style.opacity = "0";

      setTimeout(()=>{
        loader.remove();
      }, 200);
    }

  }


  /* =========================================================
     BOOT
  ========================================================= */

  document.addEventListener("DOMContentLoaded", async () => {

    let bootTimeout;

    try{

      /* 🔥 FALLBACK: pase lo que pase, quita loader */
      bootTimeout = setTimeout(hideLoaderSafe, 4000);

      /* =========================
         CONFIG
      ========================= */

      Onion.userConfig?.apply();

      /* =========================
         IDIOMA
      ========================= */

      const lang = Onion.userConfig?.get("lang") || "es";
      Onion.i18n?.setLang?.(lang);

      /* =========================
         AUTH
      ========================= */

      Onion.state.slug = localStorage.getItem("onion_user_slug");

      if(!Onion.state.slug){
        hideLoaderSafe();
        Onion.auth.redirectLogin();
        return;
      }

      /* =========================
         INIT CORE
      ========================= */

      await Onion.init();

      /* =========================
         INIT UI
      ========================= */

      Onion.ui?.init?.();
      Onion.i18n?.apply?.();

      /* =========================
         READY
      ========================= */

      clearTimeout(bootTimeout);
      hideLoaderSafe();

    }catch(e){

      console.error("💥 BOOT ERROR:", e);

      /* 🔥 aunque pete TODO, quitamos loader */
      clearTimeout(bootTimeout);
      hideLoaderSafe();

    }

  });

})();

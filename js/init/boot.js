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
      // fallback → sistema operativo
      darkMode = window.matchMedia("(prefers-color-scheme: dark)").matches;
    }

    const theme = darkMode ? "dark" : "light";

    document.documentElement.setAttribute("data-theme", theme);

  }catch{
    // fallback seguro
    document.documentElement.setAttribute("data-theme", "dark");
  }

  document.addEventListener("DOMContentLoaded", async () => {

    try{

      /* =========================
         CONFIG GLOBAL
      ========================= */

      Onion.userConfig?.apply();

      /* =========================
         IDIOMA (🔥 NUEVO)
      ========================= */

      const lang = Onion.userConfig?.get("lang") || "es";
      Onion.i18n?.setLang?.(lang);

      /* =========================
         ESTADO BASE
      ========================= */

      Onion.state.slug = localStorage.getItem("onion_user_slug");

      if(!Onion.state.slug){
        Onion.auth.redirectLogin();
        return;
      }

      /* =========================
         INIT APP
      ========================= */

      await Onion.init();

      /* =========================
         INIT UI
      ========================= */

      Onion.ui?.init?.();
      Onion.i18n.apply();

      /* =========================
         READY
      ========================= */

      document.body.classList.remove("loading");
      document.getElementById("app-loader")?.remove();

    }catch(e){
      console.error("💥 BOOT ERROR:", e);
    }

  });

})();

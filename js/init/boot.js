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
    const dark = config.darkMode;

    if(dark === false){
      document.documentElement.setAttribute("data-theme","light");
    }else{
      document.documentElement.removeAttribute("data-theme");
    }
  }catch{}

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

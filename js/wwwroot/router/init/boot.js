"use strict";

(function(){

  if(!window.Onion){
    console.error("💥 Onion no existe (boot)");
    return;
  }

  const Onion = window.Onion;

  Onion.state = Onion.state || {};
  Onion.state.appReady = false;

  /* =========================
     THEME
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
     LOADER SAFE
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

      bootTimeout = setTimeout(()=>{
        Onion.warn("Loader timeout fallback");
        hideLoaderSafe();
      }, 4000);

      Onion.userConfig?.apply?.();

      const lang = Onion.userConfig?.get?.("lang") || "es";
      Onion.i18n?.setLang?.(lang);

      /* =========================
         🔥 MODO DEBUG SIN AUTH
      ========================= */

      Onion.state.slug = localStorage.getItem("onion_user_slug");

      if(!Onion.state.slug){
        console.warn("⚠️ Modo debug sin login");

        // 👉 usuario fake para que todo funcione
        Onion.setUser?.({
          username: "avila",
          name: "Ávila",
          role: "admin"
        });
      }

      /* =========================
         INIT (aunque falle auth)
      ========================= */

      try{
        await Onion.init?.();
      }catch(e){
        console.warn("⚠️ Init falló, seguimos en modo debug");
      }

      /* =========================
         🔥 FORZAR APP READY
      ========================= */

      if(!Onion.state.appReady){

        Onion.state.appReady = true;

        Onion.ui?.init?.();
        Onion.i18n?.apply?.();

        // 👉 render mínimo SI TODO FALLA
        try{
          Onion.render?.();
        }catch{
          document.getElementById("view-container").innerHTML =
            "<h1 style='padding:20px'>ONION VIVO 🔥</h1>";
        }

      }

      clearTimeout(bootTimeout);
      hideLoaderSafe();

    }catch(e){

      console.error("💥 BOOT ERROR:", e);

      clearTimeout(bootTimeout);
      hideLoaderSafe();

      document.getElementById("view-container").innerHTML =
        "<h1 style='padding:20px'>ERROR DE ARRANQUE</h1>";

    }

  });

})();

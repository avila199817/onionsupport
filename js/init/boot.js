"use strict";

(function(){

  if(!window.Onion){
    console.error("💥 Onion no existe (boot)");
    return;
  }

  const Onion = window.Onion;

  // THEME (antes de todo)
  const savedTheme = localStorage.getItem("theme");
  if(savedTheme === "light"){
    document.documentElement.setAttribute("data-theme", "light");
  }

  document.addEventListener("DOMContentLoaded", async () => {

    try{

      // Estado base
      Onion.state.slug = localStorage.getItem("onion_user_slug");

      if(!Onion.state.slug){
        Onion.auth.redirectLogin();
        return;
      }

      // INIT APP (lógica + render)
      await Onion.init();

      // INIT UI (sobre DOM final)
      Onion.ui?.init?.();

      // READY
      document.body.classList.remove("loading");
      document.getElementById("app-loader")?.remove();

    }catch(e){
      console.error("💥 BOOT ERROR:", e);
    }

  });

})();

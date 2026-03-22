"use strict";

(function(){

  if(!window.Onion){
    console.error("💥 Onion no existe (boot)");
    return;
  }

  const Onion = window.Onion;

  /* =========================
     BOOT APP
  ========================= */

  document.addEventListener("DOMContentLoaded", async () => {

    Onion.log("🚀 BOOT INIT");

    try{

      // 🔐 recuperar slug
      Onion.state.slug = localStorage.getItem("onion_user_slug");

      if(!Onion.state.slug){
        Onion.warn("No slug → redirect login");
        Onion.auth.redirectLogin();
        return;
      }

      // 🎯 render inicial
      await Onion.render();

      // 🔥 quitar loader
      document.body.classList.remove("loading");

      const loader = document.getElementById("app-loader");
      if(loader){
        loader.remove();
      }

      Onion.log("✅ APP READY");

    }catch(e){

      Onion.error("💥 BOOT ERROR:", e);

    }

  });

})();

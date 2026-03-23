"use strict";

(function(){

  if(!window.Onion){
    console.error("💥 Onion no existe (boot)");
    return;
  }

  const Onion = window.Onion;

  /* =========================
     🔥 THEME INIT (ANTES DE TODO)
  ========================= */

  const savedTheme = localStorage.getItem("theme");

  if(savedTheme === "light"){
    document.documentElement.setAttribute("data-theme", "light");
  }

  document.addEventListener("DOMContentLoaded", async () => {

    Onion.log("🚀 BOOT INIT");

    try{

      Onion.state.slug = localStorage.getItem("onion_user_slug");

      if(!Onion.state.slug){
        Onion.warn("No slug → redirect login");
        Onion.auth.redirectLogin();
        return;
      }

      /* =========================
         🔥 UI INIT (CLAVE)
      ========================= */

      Onion.ui?.init?.();

      /* =========================
         INIT APP
      ========================= */

      await Onion.init();

      /* =========================
         READY
      ========================= */

      document.body.classList.remove("loading");

      const loader = document.getElementById("app-loader");
      if(loader){
        loader.remove();
      }

      Onion.log("✅ APP READY");

    }catch(e){

      Onion.error("💥 BOOT ERROR:", e);

      const app = document.getElementById("app-content");

      if(app){
        app.innerHTML = `
          <div style="padding:20px">
            <h2>Error crítico</h2>
            <p>${e.message}</p>
            <button onclick="location.reload()">Reintentar</button>
          </div>
        `;
      }

      document.body.classList.remove("loading");

    }

  });

})();

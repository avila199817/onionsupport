"use strict";

/* =========================
   BOOT (ONION PRO STABLE)
   - Init seguro
   - Sin duplicados
   - Loader controlado por render
========================= */

(function(){

  if(!window.Onion){
    console.error("💥 Onion no existe (boot)");
    return;
  }

  const Onion = window.Onion;

  let booted = false;

  /* =========================
     BOOT APP
  ========================= */

  document.addEventListener("DOMContentLoaded", async () => {

    if(booted) return;
    booted = true;

    Onion.log?.("🚀 BOOT INIT");

    try{

      /* =========================
         STATE BASE (SEGURIDAD)
      ========================= */

      if(!Onion.state){
        Onion.state = {};
      }

      if(typeof Onion.state.renderId !== "number"){
        Onion.state.renderId = 0;
      }

      if(!Onion.state.cleanup){
        Onion.state.cleanup = new Set();
      }

      if(!Onion.cache){
        Onion.cache = { html: {} };
      }

      /* =========================
         USER / SLUG
      ========================= */

      const slug = localStorage.getItem("onion_user_slug");

      if(!slug){
        Onion.warn?.("⚠️ No slug → redirect login");
        Onion.auth?.redirectLogin?.();
        return;
      }

      Onion.state.slug = slug;

      /* =========================
         RENDER INICIAL
      ========================= */

      await Onion.render();

      // 🔥 IMPORTANTE: NO tocamos loader aquí
      // render.js ya lo gestiona

      Onion.log?.("✅ APP READY");

    }catch(e){

      Onion.error?.("💥 BOOT ERROR:", e);

      // fallback visual mínimo
      document.body.classList.remove("loading");

      const app = document.getElementById("app-content");
      if(app){
        app.innerHTML = `
          <div style="padding:20px">
            <h2>Error de inicio</h2>
            <p>${e.message}</p>
          </div>
        `;
      }

    }

  });

})();

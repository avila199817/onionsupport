"use strict";

/* =========================
   INIT (PRO SaaS - ONION)
========================= */

(function(){

  if(!window.Onion){
    console.error("💥 Onion no está definido (init.js)");
    return;
  }

  const Onion = window.Onion;

  /* =========================
     INIT CORE
  ========================= */

  Onion.init = async function(){

    try{

      Onion.log("🚀 INIT START");

      /* =========================
         AUTH / USER
      ========================= */

      let user = null;

      try{

        const res = await Onion.fetch?.(Onion.config.API + "/auth/me");

        user = res?.user || res || null;

        if(user){
          Onion.setUser?.(user);
        }

      }catch(e){

        if(e.message === "401" || e.message === "NO_TOKEN"){
          Onion.warn("No autenticado");
          Onion.auth?.redirectLogin?.();
          return;
        }

        Onion.error("Error obteniendo usuario:", e);
        throw e;

      }

      /* =========================
         SPA EVENTS (SAFE)
      ========================= */

      // 🔥 evitar duplicados
      Onion.events.off?.("nav:change", Onion.render);
      window.removeEventListener("popstate", Onion.render);

      Onion.events.on?.("nav:change", Onion.render);
      window.addEventListener("popstate", Onion.render);

      /* =========================
         FIRST RENDER
      ========================= */

      await Onion.render();

      /* =========================
         READY STATE
      ========================= */

      Onion.state.ready = true;

      Onion.events.emit("app:ready", {
        user: Onion.state.user
      });

      Onion.log("✅ INIT READY");

    }catch(e){

      Onion.error("💥 INIT ERROR:", e);

      const app = document.getElementById("app-content");

      if(app){
        app.innerHTML = `
          <div style="padding:20px">
            <h2>Error inicializando</h2>
            <p>${e.message}</p>
            <button onclick="location.reload()">Reintentar</button>
          </div>
        `;
      }

    }finally{

      // 🔥 estado SIEMPRE consistente
      Onion.state.navigating = false;
      Onion.state.rendering = false;

    }

  };

})();

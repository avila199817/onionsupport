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

    if(Onion.state.ready){
      Onion.warn("INIT ya ejecutado");
      return;
    }

    Onion.log("🚀 INIT START");

    try{

      /* =========================
         AUTH / USER (ROBUSTO)
      ========================= */

      let user = null;

      try{

        const res = await Onion.fetch?.(Onion.config.API + "/auth/me");

        user = res?.user || res || null;

        if(user){
          Onion.setUser(user);
        }else{
          throw new Error("NO_USER");
        }

      }catch(e){

        const msg = e?.message || "";

        if(
          msg.includes("401") ||
          msg.includes("NO_TOKEN") ||
          msg.includes("NO_USER")
        ){
          Onion.warn("🔐 No autenticado → redirect");

          Onion.clearUser?.();
          Onion.auth?.redirectLogin?.();

          return;
        }

        Onion.error("💥 AUTH ERROR:", e);
        throw e;

      }

      /* =========================
         SPA EVENTS (ANTI DUPLICADO)
      ========================= */

      // limpiar antes de volver a registrar
      Onion.events.off?.("nav:change", Onion.render);
      Onion.events.off?.("app:refresh", Onion.render);

      window.removeEventListener("popstate", Onion.render);

      // registrar limpio
      Onion.events.on?.("nav:change", Onion.render);
      Onion.events.on?.("app:refresh", Onion.render);

      window.addEventListener("popstate", Onion.render);

      /* =========================
         FIRST RENDER (SEGURO)
      ========================= */

      await Onion.render();

      /* =========================
         READY STATE
      ========================= */

      Onion.state.ready = true;

      Onion.events.emit?.("app:ready", {
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

      /* =========================
         STATE CLEANUP (CRÍTICO)
      ========================= */

      Onion.state.navigating = false;
      Onion.state.rendering = false;

    }

  };

})();

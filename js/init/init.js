"use strict";

/* =========================
   INIT (ONION PRO STABLE)
   - Sin duplicados
   - Sin conflictos con router
   - Auth robusta
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
      Onion.warn?.("⚠️ INIT ya ejecutado");
      return;
    }

    Onion.log?.("🚀 INIT START");

    try{

      /* =========================
         AUTH / USER
      ========================= */

      let user = null;

      try{

        const res = await Onion.fetch?.(Onion.config.API + "/auth/me");

        user = res?.user || res || null;

        if(!user){
          throw new Error("NO_USER");
        }

        Onion.setUser?.(user);

      }catch(e){

        const msg = e?.message || "";

        if(
          msg.includes("401") ||
          msg.includes("NO_TOKEN") ||
          msg.includes("NO_USER")
        ){
          Onion.warn?.("🔐 No autenticado → redirect");

          Onion.clearUser?.();
          Onion.auth?.redirectLogin?.();

          return;
        }

        throw e;

      }

      /* =========================
         IMPORTANTE
         NO registrar eventos aquí
         (router ya controla navegación)
      ========================= */

      /* =========================
         READY STATE
      ========================= */

      Onion.state.ready = true;

      Onion.events.emit?.("app:ready", {
        user: Onion.state.user
      });

      Onion.log?.("✅ INIT READY");

    }catch(e){

      Onion.error?.("💥 INIT ERROR:", e);

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
         STATE CLEANUP
      ========================= */

      Onion.state.navigating = false;
      Onion.state.rendering = false;

    }

  };

})();

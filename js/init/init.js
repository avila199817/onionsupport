"use strict";

/* =========================================================
   🧅 INIT — FULL PRO (BOOT LIMPIO, SOURCE OF TRUTH, SIN DUPES)
========================================================= */

(function(){

  const Onion = window.Onion;

  if(!Onion){
    console.error("💥 Onion no disponible (init)");
    return;
  }

  /* =========================
     INIT
  ========================= */

  Onion.init = async function(){

    // 🔒 LOCK DURO
    if(Onion.state._initializing) return;
    if(Onion.state.ready) return;

    Onion.state._initializing = true;

    try{

      /* =========================
         AUTH (ME)
      ========================= */

      let user = null;

      try{

        const res = await Onion.fetch(Onion.config.API + "/auth/me");

        user = res?.user || res || null;

        if(!user){
          throw new Error("NO_USER");
        }

        // 🔥 SINGLE SOURCE (CORE)
        Onion.setUser(user);

        /* =========================
           THEME SYNC (BD → UI)
        ========================= */

        try{

          const dbConfig = user?.config || {};

          if(dbConfig){

            localStorage.setItem("onion_config", JSON.stringify(dbConfig));

            let darkMode;

            if(typeof dbConfig.darkMode === "boolean"){
              darkMode = dbConfig.darkMode;
            }else{
              darkMode = window.matchMedia("(prefers-color-scheme: dark)").matches;
            }

            const theme = darkMode ? "dark" : "light";

            document.documentElement.setAttribute("data-theme", theme);

          }

        }catch(e){
          Onion.warn("Theme sync error:", e);
        }

      }catch(e){

        const msg = e?.message || "";

        if(
          msg.includes("401") ||
          msg.includes("NO_TOKEN") ||
          msg.includes("NO_USER")
        ){
          Onion.clearUser?.();
          Onion.auth?.redirectLogin?.();
          return;
        }

        throw e;

      }

      /* =========================
         FIRST RENDER
      ========================= */

      await Onion.render();

      /* =========================
         FRAME SYNC
      ========================= */

      await new Promise(r => requestAnimationFrame(r));
      await new Promise(r => requestAnimationFrame(r));

      /* =========================
         READY
      ========================= */

      Onion.state.ready = true;

      Onion.events.emit?.("app:ready", {
        user: Onion.getUser?.()
      });

    }catch(e){

      Onion.error("INIT ERROR:", e);

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

      Onion.state._initializing = false;
      Onion.state.navigating = false;
      Onion.state.rendering = false;

    }

  };

  /* =========================
     DEBUG
  ========================= */

  if(Onion.config?.DEBUG){
    Onion.log("🚀 Init system PRO ready");
  }

})();

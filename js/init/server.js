"use strict";

/* =========================================================
   🧅 ONION SERVER (FRONTEND CONTROLLER)
   - Flujo tipo backend
   - Control total del ciclo SPA
========================================================= */

(function(){

  if(!window.Onion){
    console.error("💥 Onion no existe (server.js)");
    return;
  }

  const Onion = window.Onion;

  /* =========================================================
     STATE BASE
  ========================================================= */

  Onion.state = Onion.state || {};
  Onion.state.appReady = false;
  Onion.state.booting = false;

  /* =========================================================
     SERVER FLOW
  ========================================================= */

  Onion.server = {

    /* =========================
       INIT (ENTRY POINT)
    ========================= */

    async start(){

      if(Onion.state.booting) return;
      Onion.state.booting = true;

      try{

        this.applyTheme();

        await this.preAuthCheck();

        await this.initCore();

        this.appReady();

        this.handleRouting();

      }catch(e){

        console.error("💥 SERVER ERROR:", e);
        this.failSafe();

      }

    },

    /* =========================
       THEME
    ========================= */

    applyTheme(){

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

    },

    /* =========================
       AUTH CHECK
    ========================= */

    async preAuthCheck(){

      Onion.state.slug = localStorage.getItem("onion_user_slug");

      if(!Onion.state.slug){

        this.failSafe();

        Onion.auth?.redirectLogin?.();

        throw new Error("No auth");

      }

    },

    /* =========================
       INIT CORE
    ========================= */

    async initCore(){

      await Onion.init?.();

    },

    /* =========================
       APP READY
    ========================= */

    appReady(){

      if(Onion.state.appReady) return;

      Onion.state.appReady = true;

      Onion.ui?.init?.();
      Onion.i18n?.apply?.();

    },

    /* =========================
       ROUTING CONTROL
    ========================= */

    handleRouting(){

      // 🔥 Primera carga
      Onion.render();

      // 🔥 Navegación SPA
      document.addEventListener("click", (e)=>{

        const link = e.target.closest("[data-spa]");
        if(!link) return;

        e.preventDefault();

        const href = link.getAttribute("href");
        if(!href) return;

        if(href === window.location.pathname) return;

        Onion.ui?.showLoader?.();

        Onion.router.navigate(href);

      });

      // 🔥 Back / forward
      window.addEventListener("popstate", ()=>{
        Onion.render();
      });

      // 🔥 Fin render → apagar loader
      Onion.events?.on?.("render:end", ()=>{
        Onion.ui?.hideLoader?.();
      });

    },

    /* =========================
       FAILSAFE
    ========================= */

    failSafe(){

      document.body.classList.remove("loading");

      const loader = document.getElementById("app-loader");

      if(loader){
        loader.style.opacity = "0";
        setTimeout(()=>{
          try{ loader.remove(); }catch{}
        }, 200);
      }

    }

  };

  /* =========================================================
     START
  ========================================================= */

  document.addEventListener("DOMContentLoaded", ()=>{
    Onion.server.start();
  });

  /* =========================================================
     DEBUG
  ========================================================= */

  if(Onion.config?.DEBUG){
    Onion.log("🧅 Server mode ACTIVE");
  }

})();

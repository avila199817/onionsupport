"use strict";

/* =========================================================
   🧅 INIT — CORE PREPARATION (NO RENDER · NO NAV)
   - Carga sesión
   - Setea usuario
   - Prepara estado base
========================================================= */

(function(){

  if(!window.Onion){
    console.error("💥 Onion no existe (init.js)");
    return;
  }

  const Onion = window.Onion;

  /* =========================================================
     INIT
  ========================================================= */

  Onion.init = async function(){

    if(Onion.state?.initialized) return;

    try{

      /* =========================
         BASE STATE
      ========================= */

      Onion.state = Onion.state || {};
      Onion.state.initializing = true;

      /* =========================
         TOKEN / AUTH
      ========================= */

      const token = Onion.auth?.getToken?.();

      if(!token){
        throw new Error("Token no disponible");
      }

      /* =========================
         USER (SESSION)
      ========================= */

      let user = null;

      try{

        const res = await Onion.fetch?.("/auth/me");

        if(res && (res.user || res.data)){
          user = res.user || res.data;
        }

      }catch(e){
        console.warn("⚠️ Error obteniendo usuario:", e);
      }

      if(!user){
        throw new Error("Usuario no válido");
      }

      /* =========================
         SET USER
      ========================= */

      Onion.setUser?.(user);

      /* =========================
         FLAGS
      ========================= */

      Onion.state.initialized = true;
      Onion.state.initializing = false;

      if(Onion.config?.DEBUG){
        Onion.log("✅ INIT OK");
      }

    }catch(e){

      console.error("💥 INIT ERROR:", e);

      Onion.state.initialized = false;
      Onion.state.initializing = false;

      /* 🔥 RESET SESIÓN */
      Onion.auth?.resetSession?.();

      /* 🔥 REDIRECT */
      Onion.auth?.redirectLogin?.();

      throw e;

    }

  };

})();

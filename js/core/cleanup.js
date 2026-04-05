"use strict";

/* =========================================================
   🧅 CLEANUP — FULL PRO (SIN DUPLICADOS, SIN CONFLICTOS)
========================================================= */

(function(){

  if(!window.Onion){
    console.error("💥 Onion no está definido (cleanup.js)");
    return;
  }

  const Onion = window.Onion;

  /* =========================================================
     🔥 NOTA CRÍTICA
     - El CORE ya define TODO el sistema de cleanup
     - Aquí NO redefinimos nada
     - Solo aseguramos consistencia
  ========================================================= */

  /* =========================
     VALIDACIÓN DE ESTADO
  ========================= */

  if(!Onion.state){
    Onion.error("State no existe en cleanup");
    return;
  }

  if(!Array.isArray(Onion.state.cleanup)){
    Onion.state.cleanup = [];
  }

  if(!Array.isArray(Onion.state.globalEvents)){
    Onion.state.globalEvents = [];
  }

  /* =========================
     ALIAS SEGUROS (OPCIONAL)
  ========================= */

  // mantener compatibilidad sin duplicar lógica
  Onion.cleanupAll = function(){
    return Onion.runCleanup();
  };

  /* =========================
     DEBUG (opcional)
  ========================= */

  if(Onion.config?.DEBUG){
    Onion.log("🧹 Cleanup module ready");
  }

})();

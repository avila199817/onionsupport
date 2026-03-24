"use strict";

/* =========================
   SIDEBAR (ONION PRO)
========================= */

(function(){

  if(!window.Onion){
    console.error("💥 Onion no está definido (sidebar.js)");
    return;
  }

  const Onion = window.Onion;

  Onion.ui = Onion.ui || {};
  Onion.ui.sidebar = Onion.ui.sidebar || {};

  /* =========================
     INIT
  ========================= */

  Onion.ui.sidebar.init = function(){

    const sidebar = document.querySelector(".sidebar");
    const toggle = document.getElementById("toggleSidebar");

    if(!sidebar || !toggle) return;

    // 🔥 evita doble binding
    if(toggle.__bound) return;
    toggle.__bound = true;

    /* =========================
       RESTORE STATE
    ========================= */

    const saved = localStorage.getItem("sidebar-collapsed");

    if(saved === "true"){
      sidebar.classList.add("collapsed");
    }else{
      sidebar.classList.remove("collapsed");
    }

    /* =========================
       TOGGLE
    ========================= */

    Onion.cleanupEvent(toggle, "click", ()=>{

      const collapsed = sidebar.classList.contains("collapsed");

      sidebar.classList.toggle("collapsed");

      localStorage.setItem(
        "sidebar-collapsed",
        String(!collapsed)
      );

      // 🔥 opcional: cerrar dropdown si existe
      document
        .getElementById("userDropdown")
        ?.classList.remove("active");

    });

    /* =========================
       CLEANUP
    ========================= */

    Onion.onCleanup(()=>{
      toggle.__bound = false;
    });

  };

})();

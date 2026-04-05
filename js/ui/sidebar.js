"use strict";

/* =========================================================
   🧅 SIDEBAR — STABLE SPA (FIABLE · SIMPLE · FUNCIONA SIEMPRE)
========================================================= */

(function(){

  if(!window.Onion){
    console.error("💥 Onion no está definido (sidebar.js)");
    return;
  }

  const Onion = window.Onion;

  Onion.ui = Onion.ui || {};
  Onion.ui.sidebar = Onion.ui.sidebar || {};

  Onion.ui.sidebar.init = function(){

    const sidebar  = document.querySelector(".sidebar");
    const toggle   = document.getElementById("toggleSidebar");
    const user     = document.getElementById("userToggle");
    const dropdown = document.getElementById("userDropdown");

    if(!sidebar || !toggle){
      return;
    }

    /* =========================
       RESTORE STATE
    ========================= */

    const saved = localStorage.getItem("sidebar-collapsed");
    sidebar.classList.toggle("collapsed", saved === "true");

    updateTooltip();

    /* =========================
       TOGGLE SIDEBAR
    ========================= */

    Onion.cleanupEvent(toggle, "click", (e)=>{
      e.stopPropagation();

      const isCollapsed = sidebar.classList.contains("collapsed");

      sidebar.classList.toggle("collapsed");

      localStorage.setItem("sidebar-collapsed", String(!isCollapsed));

      dropdown?.classList.remove("active");

      requestAnimationFrame(updateTooltip);
    });

    /* =========================
       USER DROPDOWN
    ========================= */

    if(user && dropdown){

      Onion.cleanupEvent(user, "click", (e)=>{
        e.stopPropagation();

        const collapsed = sidebar.classList.contains("collapsed");

        if(collapsed){
          sidebar.classList.remove("collapsed");
          localStorage.setItem("sidebar-collapsed", "false");

          requestAnimationFrame(updateTooltip);

          setTimeout(()=>{
            dropdown.classList.add("active");
          }, 200);

        }else{
          dropdown.classList.toggle("active");
        }
      });

    }

    /* =========================
       CLICK FUERA
    ========================= */

    Onion.cleanupEvent(document, "click", (e)=>{

      if(
        e.target.closest("#userToggle") ||
        e.target.closest("#userDropdown")
      ){
        return;
      }

      dropdown?.classList.remove("active");
    });

    /* =========================
       ESC
    ========================= */

    Onion.cleanupEvent(document, "keydown", (e)=>{
      if(e.key === "Escape"){
        dropdown?.classList.remove("active");
      }
    });

  };

  /* =========================
     TOOLTIP
  ========================= */

  function updateTooltip(){

    const sidebar = document.querySelector(".sidebar");
    const toggle = document.getElementById("toggleSidebar");

    if(!sidebar || !toggle) return;

    const collapsed = sidebar.classList.contains("collapsed");

    toggle.setAttribute(
      "data-tooltip",
      collapsed
        ? "Abrir barra lateral"
        : "Cerrar barra lateral"
    );

  }

  /* =========================
     DEBUG
  ========================= */

  if(Onion.config?.DEBUG){
    Onion.log?.("📚 Sidebar PRO ready");
  }

})();

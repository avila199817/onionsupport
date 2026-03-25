"use strict";

/* =========================
   SIDEBAR (ONION PRO FINAL)
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

    const sidebar  = document.querySelector(".sidebar");
    const toggle   = document.getElementById("toggleSidebar");
    const user     = document.getElementById("userToggle");
    const dropdown = document.getElementById("userDropdown");

    if(!sidebar || !toggle) return;

    /* =========================
       RESTORE STATE
    ========================= */

    const saved = localStorage.getItem("sidebar-collapsed");

    if(saved === "true"){
      sidebar.classList.add("collapsed");
    } else {
      sidebar.classList.remove("collapsed");
    }

    updateTooltip();

    /* =========================
       SIDEBAR TOGGLE
    ========================= */

    Onion.cleanupEvent(toggle, "click", (e)=>{
      e.stopPropagation();

      const isCollapsed = sidebar.classList.contains("collapsed");

      sidebar.classList.toggle("collapsed");

      localStorage.setItem(
        "sidebar-collapsed",
        String(!isCollapsed)
      );

      dropdown?.classList.remove("active");

      // 🔥 actualizar tooltip dinámico
      requestAnimationFrame(updateTooltip);
    });


    /* =========================
       USER DROPDOWN TOGGLE
    ========================= */

    if(user && dropdown){

      Onion.cleanupEvent(user, "click", (e)=>{
        e.stopPropagation();
        dropdown.classList.toggle("active");
      });

    }


    /* =========================
       CLICK FUERA (CLOSE)
    ========================= */

    Onion.cleanupEvent(document, "click", (e)=>{

      if(!dropdown) return;

      if(
        !dropdown.contains(e.target) &&
        !user?.contains(e.target)
      ){
        dropdown.classList.remove("active");
      }

    });


    /* =========================
       DROPDOWN ACTIONS (DELEGATION)
    ========================= */

    if(dropdown){

      Onion.cleanupEvent(dropdown, "click", (e)=>{

        e.stopPropagation();

        const item = e.target.closest(".dropdown-item");
        if(!item) return;

        // 🔥 SOPORTE DOBLE: dataset o id (tu caso logout)
        const action =
          item.dataset.action ||
          (item.id === "logoutBtn" ? "logout" : null);

        if(action){
          Onion.emit?.("dropdown:" + action);
        }

        dropdown.classList.remove("active");

      });

    }


    /* =========================
       TOOLTIP DINÁMICO
    ========================= */

    function updateTooltip(){

      const collapsed = sidebar.classList.contains("collapsed");

      toggle.setAttribute(
        "data-tooltip",
        collapsed
          ? "Abrir barra lateral"
          : "Cerrar barra lateral"
      );

    }


    /* =========================
       CLEANUP SPA SAFE
    ========================= */

    Onion.onCleanup(()=>{

      // no necesitamos __bound hacks
      // Onion.cleanupEvent ya limpia todo

    });

  };

})();

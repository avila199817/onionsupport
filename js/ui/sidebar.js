"use strict";

/* =========================
   SIDEBAR (ONION PRO FINAL++)
========================= */

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

      requestAnimationFrame(updateTooltip);
    });


    /* =========================
       USER CLICK (SMART)
    ========================= */

    if(user && dropdown){

      Onion.cleanupEvent(user, "click", (e)=>{
        e.stopPropagation();

        const collapsed = sidebar.classList.contains("collapsed");

        if(collapsed){
          // 🔥 abre sidebar primero
          sidebar.classList.remove("collapsed");
          localStorage.setItem("sidebar-collapsed", "false");

          requestAnimationFrame(updateTooltip);

          // 🔥 espera animación antes de dropdown
          setTimeout(()=>{
            dropdown.classList.add("active");
          }, 220);

        }else{
          dropdown.classList.toggle("active");
        }
      });

    }


    /* =========================
       CLICK FUERA
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
       ESCAPE KEY
    ========================= */

    Onion.cleanupEvent(document, "keydown", (e)=>{
      if(e.key === "Escape"){
        dropdown?.classList.remove("active");
      }
    });


    /* =========================
       DROPDOWN ACTIONS
    ========================= */

    if(dropdown){

      Onion.cleanupEvent(dropdown, "click", (e)=>{

        e.stopPropagation();

        const item = e.target.closest(".dropdown-item");
        if(!item) return;

        const action =
          item.dataset.action ||
          (item.id === "logoutBtn" ? "logout" : null);

        if(action){

          // 🔥 caso especial logout
          if(action === "logout"){
            Onion.emit?.("auth:logout");
          }else{
            Onion.emit?.("dropdown:" + action);
          }

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
       CLEANUP (SPA SAFE)
    ========================= */

    Onion.onCleanup(()=>{
      // Onion.cleanupEvent ya limpia todo
    });

  };

})();

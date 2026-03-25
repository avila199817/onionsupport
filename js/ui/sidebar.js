"use strict";

/* =========================
   SIDEBAR (ONION PRO FIX)
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

    const user = document.querySelector(".user");
    const dropdown = document.getElementById("userDropdown");

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
       SIDEBAR TOGGLE
    ========================= */

    Onion.cleanupEvent(toggle, "click", (e)=>{
      e.stopPropagation();

      const collapsed = sidebar.classList.contains("collapsed");

      sidebar.classList.toggle("collapsed");

      localStorage.setItem(
        "sidebar-collapsed",
        String(!collapsed)
      );

      // cerrar dropdown siempre
      dropdown?.classList.remove("active");
    });


    /* =========================
       DROPDOWN TOGGLE
    ========================= */

    if(user && dropdown && !user.__bound){

      user.__bound = true;

      Onion.cleanupEvent(user, "click", (e)=>{
        e.stopPropagation();

        dropdown.classList.toggle("active");
      });
    }


    /* =========================
       CLICK FUERA (CERRAR)
    ========================= */

    const closeDropdown = (e)=>{
      if(!dropdown) return;

      if(
        !dropdown.contains(e.target) &&
        !user?.contains(e.target)
      ){
        dropdown.classList.remove("active");
      }
    };

    Onion.cleanupEvent(document, "click", closeDropdown);


    /* =========================
       FIX: ITEMS DROPDOWN
       (🔥 clave para logout)
    ========================= */

    if(dropdown && !dropdown.__bound){

      dropdown.__bound = true;

      Onion.cleanupEvent(dropdown, "click", (e)=>{
        // 🔥 evita que se cierre antes de ejecutar acción
        e.stopPropagation();

        const item = e.target.closest(".dropdown-item");
        if(!item) return;

        const action = item.dataset.action;

        if(action){
          Onion.emit?.("dropdown:" + action);
        }

        // cerrar después de click
        dropdown.classList.remove("active");
      });
    }


    /* =========================
       CLEANUP
    ========================= */

    Onion.onCleanup(()=>{
      toggle.__bound = false;
      if(user) user.__bound = false;
      if(dropdown) dropdown.__bound = false;
    });

  };

})();

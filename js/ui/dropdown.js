"use strict";

/* =========================
   DROPDOWN (ONION PRO)
========================= */

(function(){

  if(!window.Onion){
    console.error("💥 Onion no está definido (dropdown.js)");
    return;
  }

  const Onion = window.Onion;

  Onion.ui = Onion.ui || {};
  Onion.ui.dropdown = Onion.ui.dropdown || {};

  /* =========================
     INIT
  ========================= */

  Onion.ui.dropdown.init = function(){

    const toggle = document.getElementById("userToggle");
    const dropdown = document.getElementById("userDropdown");
    const sidebar = document.querySelector(".sidebar");

    if(!toggle || !dropdown || !sidebar) return;

    // 🔥 evita duplicados
    if(toggle.__bound) return;
    toggle.__bound = true;

    /* =========================
       TOGGLE CLICK
    ========================= */

    Onion.cleanupEvent(toggle, "click", (e)=>{

      e.stopPropagation(); // 🔥 CLAVE

      const collapsed = sidebar.classList.contains("collapsed");

      if(collapsed){
        sidebar.classList.remove("collapsed");
        localStorage.setItem("sidebar-collapsed", "false");

        setTimeout(()=>{
          dropdown.classList.add("active");
        }, 120);
      }else{
        dropdown.classList.toggle("active");
      }

    });

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

      dropdown.classList.remove("active");

    });

    /* =========================
       ESC KEY (PRO)
    ========================= */

    Onion.cleanupEvent(document, "keydown", (e)=>{
      if(e.key === "Escape"){
        dropdown.classList.remove("active");
      }
    });

    /* =========================
       CLEANUP
    ========================= */

    Onion.onCleanup(()=>{
      toggle.__bound = false;
    });

  };

})();

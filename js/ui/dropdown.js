"use strict";

/* =========================
   DROPDOWN GENERIC (SAFE)
========================= */

(function(){

  if(!window.Onion) return;

  const Onion = window.Onion;

  Onion.ui = Onion.ui || {};
  Onion.ui.dropdown = Onion.ui.dropdown || {};

  Onion.ui.dropdown.init = function(){

    const dropdowns = document.querySelectorAll("[data-dropdown]");

    dropdowns.forEach((wrapper)=>{

      const toggle = wrapper.querySelector("[data-dropdown-toggle]");
      const menu   = wrapper.querySelector("[data-dropdown-menu]");

      if(!toggle || !menu) return;

      Onion.cleanupEvent(toggle, "click", (e)=>{
        e.stopPropagation();
        menu.classList.toggle("active");
      });

      Onion.cleanupEvent(document, "click", (e)=>{
        if(!wrapper.contains(e.target)){
          menu.classList.remove("active");
        }
      });

    });

  };

})();

"use strict";

/* =========================================================
   🧅 SIDEBAR — GOD MODE FINAL (SPA SAFE · SIN RACES · LIMPIO)
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

    if(!sidebar || !toggle) return;

    /* =========================
       RESTORE STATE
    ========================= */

    const saved = localStorage.getItem("sidebar-collapsed");

    sidebar.classList.toggle("collapsed", saved === "true");

    updateTooltip();

    /* =========================
       USER RENDER (SIN BLOQUEOS)
    ========================= */

    renderUser();

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

    /* =========================
       DROPDOWN ACTIONS
    ========================= */

    if(dropdown){

      Onion.cleanupEvent(dropdown, "click", (e)=>{

        const item = e.target.closest(".dropdown-item");
        if(!item) return;

        const action =
          item.dataset.action ||
          (item.id === "logoutBtn" ? "logout" : null);

        if(action === "logout"){
          Onion.ui?.showLoader?.();
          Onion.auth.logout?.();
        }

        dropdown.classList.remove("active");

      });

    }

  };

  /* =========================
     USER RENDER
  ========================= */

  function renderUser(){

    const user = Onion.getUser?.() || Onion.state?.user;
    if(!user) return;

    const nameEl = document.getElementById("sidebar-name");
    const avatarEl = document.getElementById("sidebar-avatar");

    const name =
      user.name ||
      user.username ||
      user.email ||
      "Usuario";

    if(nameEl) nameEl.textContent = name;

    if(avatarEl){

      if(user.avatar){
        avatarEl.innerHTML = `
          <img src="${user.avatar}"
          style="width:100%;height:100%;border-radius:50%;object-fit:cover;">
        `;
      }else{
        avatarEl.textContent = name.slice(0,2).toUpperCase();
      }

    }

  }

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

  if(Onion.config?.DEBUG){
    Onion.log?.("📚 Sidebar PRO ready");
  }

})();

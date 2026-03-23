"use strict";

/* =========================
   UI (GLOBAL LAYER - ONION)
========================= */

(function(){

  if(!window.Onion){
    console.error("💥 Onion no está definido (ui.js)");
    return;
  }

  const Onion = window.Onion;

  /* =========================
     UI INIT
  ========================= */

  Onion.ui.init = function(){

    Onion.ui.renderSidebar();
    Onion.ui.renderTopbar();
    Onion.ui.updateSidebarActive();

    Onion.ui.initSidebar();
    Onion.ui.initUserDropdown();
    Onion.ui.initLogout();

  };

  /* =========================
     SIDEBAR RENDER (FIXED)
  ========================= */

  Onion.ui.renderSidebar = function(){

    const nameEl = document.querySelector("#sidebar-name");
    const avatarEl = document.querySelector("#sidebar-avatar");

    if(!nameEl || !avatarEl){
      Onion.warn("Sidebar elementos no encontrados");
      return;
    }

    // 🔥 coger user SIEMPRE
    const user =
      Onion.state.user ||
      {
        username: localStorage.getItem("onion_user_slug"),
        name: localStorage.getItem("onion_user_name")
      };

    if(!user){
      Onion.warn("No user disponible");
      return;
    }

    const name =
      user.name ||
      user.username ||
      user.email ||
      "Usuario";

    nameEl.textContent = name;

    avatarEl.innerHTML = "";

    if(user.avatar){

      const img = document.createElement("img");

      img.src = user.avatar;
      img.alt = "avatar";

      Object.assign(img.style, {
        width: "100%",
        height: "100%",
        borderRadius: "50%",
        objectFit: "cover"
      });

      avatarEl.appendChild(img);

    }else{

      const initials = name
        .split(" ")
        .map(n => n[0])
        .join("")
        .substring(0,2)
        .toUpperCase();

      avatarEl.textContent = initials;

    }

  };

  /* =========================
     TOPBAR
  ========================= */

  Onion.ui.renderTopbar = function(){

    const route = Onion.router.get();
    const titleEl = document.querySelector("#topbar-title");

    if(!titleEl) return;

    const titles = {
      "/": "Panel",
      "/incidencias": "Incidencias",
      "/facturas": "Facturas",
      "/cuenta": "Cuenta"
    };

    titleEl.textContent = titles[route] || "Panel";

  };

  /* =========================
     ACTIVE LINK (FIXED)
  ========================= */

  Onion.ui.updateSidebarActive = function(){

    const route = Onion.router.get();

    document.querySelectorAll(".sidebar a[data-link]").forEach(a => {

      const href = a.getAttribute("href");

      // 🔥 quitar /@usuario del href si existe
      let cleanHref = href;

      if(href.startsWith("/@")){
        const parts = href.split("/").slice(2);
        cleanHref = "/" + (parts.join("/") || "");
      }

      a.classList.toggle("active", cleanHref === route);

    });

  };

  /* =========================
     SIDEBAR TOGGLE
  ========================= */

  Onion.ui.initSidebar = function(){

    const sidebar = document.querySelector(".sidebar");
    const toggleBtn = document.querySelector("#toggleSidebar");

    if(!sidebar) return;

    const saved = localStorage.getItem("sidebar-collapsed");

    if(saved === "true"){
      sidebar.classList.add("collapsed");
    }

    if(toggleBtn){

      toggleBtn.onclick = () => {

        const collapsed = sidebar.classList.contains("collapsed");

        sidebar.classList.toggle("collapsed");
        localStorage.setItem("sidebar-collapsed", !collapsed);

        document.querySelector("#userDropdown")?.classList.remove("active");

      };

    }

  };

  /* =========================
     USER DROPDOWN
  ========================= */

  Onion.ui.initUserDropdown = function(){

    const toggle = document.querySelector("#userToggle");
    const dropdown = document.querySelector("#userDropdown");
    const sidebar = document.querySelector(".sidebar");

    if(!toggle || !dropdown || !sidebar) return;

    toggle.onclick = (e)=>{

      e.stopPropagation();

      const collapsed = sidebar.classList.contains("collapsed");

      if(collapsed){

        sidebar.classList.remove("collapsed");
        localStorage.setItem("sidebar-collapsed", false);

        setTimeout(()=> dropdown.classList.add("active"), 150);

      }else{
        dropdown.classList.toggle("active");
      }

    };

    dropdown.onclick = e => e.stopPropagation();

    document.addEventListener("click", ()=>{
      dropdown.classList.remove("active");
    });

  };

  /* =========================
     LOGOUT
  ========================= */

  Onion.ui.initLogout = function(){

    const btn = document.querySelector("#logoutBtn");
    if(!btn) return;

    btn.onclick = async (e)=>{

      e.preventDefault();

      try{

        Onion.auth?.clearToken?.();
        sessionStorage.clear();

        document.cookie.split(";").forEach(c => {
          document.cookie = c
            .replace(/^ +/, "")
            .replace(/=.*/, "=;expires=" + new Date(0).toUTCString() + ";path=/");
        });

        try{
          await fetch("/api/logout", {
            method: "POST",
            credentials: "include"
          });
        }catch{}

      }finally{
        window.location.replace("/login");
      }

    };

  };

  /* =========================
     AUTO INIT UI
  ========================= */

  Onion.events.on("nav:ready", ()=>{
    Onion.ui.init();
  });

})();

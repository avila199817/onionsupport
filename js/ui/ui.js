"use strict";

/* =========================
   UI (GLOBAL LAYER - ONION)
   - Robusto contra timing SPA
   - Avatar + nombre SIEMPRE
   - Logout limpio → "/"
========================= */

(function(){

  if(!window.Onion){
    console.error("💥 Onion no está definido (ui.js)");
    return;
  }

  const Onion = window.Onion;

  /* =========================
     HELPERS
  ========================= */

  function getUserSafe(){
    // 1) estado
    let user = Onion.state.user;

    // 2) fallback localStorage
    if(!user || !Object.keys(user).length){
      const username = localStorage.getItem("onion_user_slug");
      const name = localStorage.getItem("onion_user_name");
      const avatar = localStorage.getItem("onion_user_avatar"); // opcional

      if(username || name || avatar){
        user = {
          username: username || "",
          name: name || "",
          avatar: avatar || ""
        };
      }
    }

    return user || null;
  }

  function getDisplayName(user){
    // prioridad: nombre completo → username → email → fallback
    return (
      user?.name ||
      user?.fullName ||
      user?.username ||
      user?.email ||
      "Usuario"
    );
  }

  function setText(el, txt){
    if(el && typeof txt === "string"){
      el.textContent = txt;
    }
  }

  function setAvatar(el, user, name){
    if(!el) return;

    el.innerHTML = "";

    if(user?.avatar){
      const img = document.createElement("img");
      img.src = user.avatar;
      img.alt = "avatar";
      img.referrerPolicy = "no-referrer";
      Object.assign(img.style, {
        width: "100%",
        height: "100%",
        borderRadius: "50%",
        objectFit: "cover"
      });
      el.appendChild(img);
      return;
    }

    // fallback iniciales
    const initials = (name || "U")
      .split(" ")
      .filter(Boolean)
      .map(n => n[0])
      .join("")
      .substring(0,2)
      .toUpperCase();

    el.textContent = initials;
  }

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
     SIDEBAR RENDER (ROBUSTO)
  ========================= */

  Onion.ui.renderSidebar = function(){

    const nameEl = document.querySelector("#sidebar-name");
    const avatarEl = document.querySelector("#sidebar-avatar");

    if(!nameEl || !avatarEl){
      Onion.warn("Sidebar elementos no encontrados");
      return;
    }

    const user = getUserSafe();

    if(!user){
      Onion.warn("No user disponible para sidebar");
      setText(nameEl, "Usuario");
      setAvatar(avatarEl, null, "Usuario");
      return;
    }

    // mantener sincronía de estado (por si vino de localStorage)
    if(!Onion.state.user){
      Onion.state.user = user;
    }

    const name = getDisplayName(user);

    setText(nameEl, name);
    setAvatar(avatarEl, user, name);

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
     ACTIVE LINK (SOPORTA /@user)
  ========================= */

  Onion.ui.updateSidebarActive = function(){

    const route = Onion.router.get();

    document.querySelectorAll(".sidebar a[data-link]").forEach(a => {

      const href = a.getAttribute("href") || "";

      let cleanHref = href;

      // si alguien mete /@user/... lo limpiamos
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
        localStorage.setItem("sidebar-collapsed", String(!collapsed));

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
        localStorage.setItem("sidebar-collapsed", "false");

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
     LOGOUT (PERFECTO → "/")
  ========================= */

  Onion.ui.initLogout = function(){

    const btn = document.querySelector("#logoutBtn");
    if(!btn) return;

    btn.onclick = async (e)=>{

      e.preventDefault();

      try{

        // 🔥 limpiar tokens y estado
        Onion.auth?.clearToken?.();

        localStorage.removeItem("onion_token");
        localStorage.removeItem("onion_user_slug");
        localStorage.removeItem("onion_user_name");
        localStorage.removeItem("onion_user_avatar");

        sessionStorage.clear();

        // 🔥 limpiar cookies
        document.cookie.split(";").forEach(c => {
          document.cookie = c
            .replace(/^ +/, "")
            .replace(/=.*/, "=;expires=" + new Date(0).toUTCString() + ";path=/");
        });

        // 🔥 backend logout (opcional)
        try{
          await fetch(Onion.config.API + "/auth/logout", {
            method: "POST",
            credentials: "include"
          });
        }catch{}

      }finally{

        // 🔥 salir del SPA → raíz (index.html)
        window.location.replace("/");

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

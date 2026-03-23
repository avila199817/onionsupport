"use strict";

/* =========================
   UI (ONION FINAL CLEAN)
   - INIT una sola vez
   - REFRESH estable
   - Avatar + nombre OK
   - Logout centralizado (auth.js)
========================= */

(function(){

  if(!window.Onion){
    console.error("💥 Onion no está definido (ui.js)");
    return;
  }

  const Onion = window.Onion;

  let initialized = false;

  /* =========================
     HELPERS
  ========================= */

  function getUserSafe(){

    let user = Onion.state.user;

    if(!user || !Object.keys(user).length){

      const username = localStorage.getItem("onion_user_slug");
      const name = localStorage.getItem("onion_user_name");
      const avatar = localStorage.getItem("onion_user_avatar");

      if(username || name || avatar){
        user = {
          username,
          name,
          avatar,
          hasAvatar: !!avatar
        };
      }

    }

    return user || null;
  }

  function getDisplayName(user){
    return (
      user?.name ||
      user?.username ||
      user?.email ||
      "Usuario"
    );
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
     RENDER
  ========================= */

  Onion.ui.renderSidebar = function(){

    const tryRender = () => {

      const nameEl = document.querySelector("#sidebar-name");
      const avatarEl = document.querySelector("#sidebar-avatar");

      if(!nameEl || !avatarEl){
        return false;
      }

      const user = getUserSafe();
      const name = getDisplayName(user);

      nameEl.textContent = name;
      setAvatar(avatarEl, user, name);

      return true;
    };

    if(tryRender()) return;

    requestAnimationFrame(()=> tryRender());

  };

  Onion.ui.renderTopbar = function(){

    const route = Onion.router.get();
    const el = document.querySelector("#topbar-title");

    if(!el) return;

    const titles = {
      "/": "Panel",
      "/incidencias": "Incidencias",
      "/facturas": "Facturas",
      "/cuenta": "Cuenta"
    };

    el.textContent = titles[route] || "Panel";

  };

  Onion.ui.updateSidebarActive = function(){

    const route = Onion.router.get();

    document.querySelectorAll(".sidebar a[data-spa]").forEach(a=>{

      let href = a.getAttribute("href") || "";

      if(href.startsWith("/@")){
        const parts = href.split("/").slice(2);
        href = "/" + (parts.join("/") || "");
      }

      a.classList.toggle("active", href === route);

    });

  };

  /* =========================
     SIDEBAR STATE
  ========================= */

  function initSidebarState(){

    const sidebar = document.querySelector(".sidebar");
    if(!sidebar) return;

    const saved = localStorage.getItem("sidebar-collapsed");

    if(saved === "true"){
      sidebar.classList.add("collapsed");
    }

  }

  /* =========================
     EVENTS
  ========================= */

  function bindGlobalEvents(){

    document.addEventListener("click", async (e)=>{

      const sidebar = document.querySelector(".sidebar");
      const dropdown = document.querySelector("#userDropdown");

      /* TOGGLE SIDEBAR */

      const toggleBtn = e.target.closest("#toggleSidebar");

      if(toggleBtn && sidebar){

        const collapsed = sidebar.classList.contains("collapsed");

        sidebar.classList.toggle("collapsed");
        localStorage.setItem("sidebar-collapsed", String(!collapsed));

        dropdown?.classList.remove("active");
        return;
      }

      /* USER DROPDOWN */

      const userToggle = e.target.closest("#userToggle");

      if(userToggle && sidebar && dropdown){

        const collapsed = sidebar.classList.contains("collapsed");

        if(collapsed){

          sidebar.classList.remove("collapsed");
          localStorage.setItem("sidebar-collapsed", "false");

          setTimeout(()=> dropdown.classList.add("active"), 120);

        }else{
          dropdown.classList.toggle("active");
        }

        return;
      }

      /* CLICK DENTRO DROPDOWN */

      if(e.target.closest("#userDropdown")){
        return;
      }

      /* LOGOUT (🔥 LIMPIO) */

      const logout = e.target.closest("#logoutBtn");

      if(logout){

        e.preventDefault();

        try{
          await fetch(Onion.config.API + "/auth/logout", {
            method: "POST",
            credentials: "include"
          });
        }catch{}

        Onion.auth.resetSession();
        Onion.auth.redirectLogin();

        return;
      }

      /* CLOSE DROPDOWN */

      dropdown?.classList.remove("active");

    });

  }

  /* =========================
     INIT
  ========================= */

  Onion.ui.init = function(){

    if(initialized) return;

    initSidebarState();
    bindGlobalEvents();

    initialized = true;
  };

  /* =========================
     REFRESH
  ========================= */

  Onion.ui.refresh = function(){

    requestAnimationFrame(()=>{
      Onion.ui.renderSidebar();
      Onion.ui.renderTopbar();
      Onion.ui.updateSidebarActive();
    });

  };

  /* =========================
     HOOKS
  ========================= */

  Onion.events.on("nav:ready", ()=>{
    Onion.ui.refresh();
  });

})();

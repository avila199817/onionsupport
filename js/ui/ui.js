"use strict";

/* =========================================================
   🧅 UI — FULL PRO (SIN DUPES, SIN RACE, TODO CENTRALIZADO)
========================================================= */

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

    let user = Onion.getUser?.();

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
    return user?.name || user?.username || user?.email || "Usuario";
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

  function exists(selector){
    return document.querySelector(selector);
  }

  /* =========================
     RENDER
  ========================= */

  Onion.ui.renderSidebar = function(){

    const nameEl = exists("#sidebar-name");
    const avatarEl = exists("#sidebar-avatar");

    if(!nameEl || !avatarEl) return;

    const user = getUserSafe();
    const name = getDisplayName(user);

    nameEl.textContent = name;
    setAvatar(avatarEl, user, name);

  };

  Onion.ui.renderTopbar = function(){

    const el = exists("#topbar-title");
    if(!el) return;

    const route = Onion.router.get();
    const config = Onion.routes[route];

    el.textContent = config?.title || "Panel";

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
     GLOBAL EVENTS
  ========================= */

  function bindGlobalEvents(){

    if(bindGlobalEvents._bound) return;
    bindGlobalEvents._bound = true;

    Onion.cleanupEvent(document, "click", async (e)=>{

      const logout = e.target.closest("#logoutBtn");

      if(!logout) return;

      e.preventDefault();

      Onion.ui?.showLoader?.();

      try{
        await Onion.auth.logout();
      }catch(e){
        Onion.error("Logout error:", e);
      }

    });

  }

  /* =========================
     WAIT DOM (ANTI RACE)
  ========================= */

  function waitDOMAndRender(retries = 10){

    if(
      exists("#sidebar-name") &&
      exists("#topbar-title")
    ){
      Onion.ui.renderSidebar();
      Onion.ui.renderTopbar();
      Onion.ui.updateSidebarActive();
      return;
    }

    if(retries <= 0) return;

    requestAnimationFrame(()=>{
      waitDOMAndRender(retries - 1);
    });

  }

  /* =========================
     INIT
  ========================= */

  Onion.ui.init = function(){

    if(!initialized){

      bindGlobalEvents();

      initialized = true;
    }

    Onion.ui.refresh();

  };

  /* =========================
     REFRESH
  ========================= */

  Onion.ui.refresh = function(){

    waitDOMAndRender();

  };

  /* =========================
     HOOK SPA
  ========================= */

  Onion.events?.on?.("route:end", ()=>{
    Onion.ui.refresh();
  });

  Onion.events?.on?.("app:ready", ()=>{
    Onion.ui.init();
  });

  /* =========================
     DEBUG
  ========================= */

  if(Onion.config?.DEBUG){
    Onion.log("🎨 UI system PRO ready");
  }

})();

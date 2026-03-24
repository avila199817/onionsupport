"use strict";

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

  /* =========================
     RENDER
  ========================= */

  Onion.ui.renderSidebar = function(){

    const nameEl = document.querySelector("#sidebar-name");
    const avatarEl = document.querySelector("#sidebar-avatar");

    if(!nameEl || !avatarEl) return;

    const user = getUserSafe();
    const name = getDisplayName(user);

    nameEl.textContent = name;
    setAvatar(avatarEl, user, name);

  };

  Onion.ui.renderTopbar = function(){

    const route = Onion.router.get();
    const config = Onion.routes[route];

    const el = document.querySelector("#topbar-title");
    if(!el) return;

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
     EVENTOS GLOBALES (SOLO LOGOUT)
  ========================= */

  function bindGlobalEvents(){

    if(initialized) return;

    Onion.cleanupEvent(document, "click", async (e)=>{

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
      }

    });

  }

  /* =========================
     INIT
  ========================= */

  Onion.ui.init = function(){

    bindGlobalEvents();

    // 🔥 módulos separados (CLAVE)
    Onion.ui.sidebar?.init?.();
    Onion.ui.dropdown?.init?.();
    Onion.ui.search?.init?.();

    Onion.ui.refresh();

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

})();

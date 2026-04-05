"use strict";

/* =========================================================
   🧅 UI — FULL PRO FIX (SYNC REAL · SIN RACE · SIN ROTURAS)
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

    let user = Onion.getUser?.() || Onion.state.user;

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

  Onion.ui.renderAll = function(){

    const nameEl = exists("#sidebar-name");
    const avatarEl = exists("#sidebar-avatar");
    const topbarEl = exists("#topbar-title");

    if(nameEl && avatarEl){

      const user = getUserSafe();
      const name = getDisplayName(user);

      nameEl.textContent = name;
      setAvatar(avatarEl, user, name);

    }

    if(topbarEl){

      const route = Onion.router.get();
      const config = Onion.routes[route];

      topbarEl.textContent = config?.title || "Panel";

    }

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
        Onion.error?.("Logout error:", e);
      }

    });

  }

  /* =========================
     INIT
  ========================= */

  Onion.ui.init = function(){

    if(!initialized){

      bindGlobalEvents();

      // 🔥 VOLVEMOS A ACTIVAR MÓDULOS (CLAVE)
      Onion.ui.sidebar?.init?.();
      Onion.ui.dropdown?.init?.();
      Onion.ui.search?.init?.();

      initialized = true;
    }

    Onion.ui.refresh();

  };

  /* =========================
     REFRESH (SYNC REAL)
  ========================= */

  Onion.ui.refresh = function(){

    // 🔥 esperamos a que el render haya pintado + estilos aplicados
    requestAnimationFrame(()=>{
      requestAnimationFrame(()=>{
        Onion.ui.renderAll();
      });
    });

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
    Onion.log?.("🎨 UI PRO ready");
  }

})();

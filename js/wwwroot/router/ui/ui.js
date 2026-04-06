"use strict";

/* =========================================================
   🧅 UI — FINAL PRO (SPA SAFE · CORE COMPATIBLE)
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

function exists(selector){
  return document.querySelector(selector);
}

function getUserSafe(){

  let user = Onion.state?.user;

  if(!user){

    const username = localStorage.getItem("onion_user_slug");
    const name = localStorage.getItem("onion_user_name");
    const avatar = localStorage.getItem("onion_user_avatar");

    if(username || name || avatar){
      user = {
        username,
        name,
        avatar
      };
    }

  }

  return user || null;
}

function getDisplayName(user){
  return user?.name || user?.username || "Usuario";
}

function setAvatar(el, user, name){

  if(!el) return;

  el.innerHTML = "";

  if(user?.avatar){

    const img = document.createElement("img");
    img.src = user.avatar;
    img.alt = "avatar";

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
   SIDEBAR
========================= */

function renderSidebar(){

  const nameEl = exists("#sidebar-name");
  const avatarEl = exists("#sidebar-avatar");

  if(!nameEl || !avatarEl) return;

  const user = getUserSafe();
  const name = getDisplayName(user);

  nameEl.textContent = name;
  setAvatar(avatarEl, user, name);
}

/* =========================
   TOPBAR
========================= */

function renderTopbar(){

  const el = exists("#topbar-title");
  if(!el) return;

  const route = Onion.router.get();
  const config = Onion.routes?.[route];

  el.textContent = config?.title || "Panel";
}

/* =========================
   SIDEBAR ACTIVE
========================= */

function updateSidebarActive(){

  const route = Onion.router.get();

  document.querySelectorAll(".sidebar a[data-spa]").forEach(a=>{

    let href = a.getAttribute("href") || "";

    // limpiar slug
    if(href.startsWith("/@")){
      const parts = href.split("/").slice(2);
      href = "/" + (parts.join("/") || "");
    }

    a.classList.toggle("active", href === route);

  });
}

/* =========================
   LOGOUT EVENT (SAFE)
========================= */

function bindLogout(){

  if(bindLogout._bound) return;
  bindLogout._bound = true;

  document.addEventListener("click", async (e)=>{

    const logout = e.target.closest("#logoutBtn");
    if(!logout) return;

    e.preventDefault();

    try{
      await Onion.fetch("/auth/logout", { method:"POST" });
    }catch{}

    localStorage.removeItem("onion_token");
    localStorage.removeItem("onion_user_slug");
    localStorage.removeItem("onion_user_name");
    localStorage.removeItem("onion_user_avatar");

    Onion.state.user = null;

    location.href = "/";

  });

}

/* =========================
   REFRESH UI
========================= */

function refreshUI(){

  renderSidebar();
  renderTopbar();
  updateSidebarActive();

}

/* =========================
   INIT
========================= */

function init(){

  if(!initialized){
    bindLogout();
    initialized = true;
  }

  refreshUI();
}

/* =========================
   🔥 HOOK RENDER (CLAVE)
========================= */

if(!Onion.__uiHooked){

  const originalRender = Onion.render;

  Onion.render = async function(){

    await originalRender.apply(this, arguments);

    // 🔥 UI SIEMPRE después del render
    requestAnimationFrame(()=>{
      init();
    });

  };

  Onion.__uiHooked = true;
}

/* =========================
   DEBUG
========================= */

if(Onion.config?.DEBUG){
  console.log("🎨 UI FINAL PRO READY");
}

})();

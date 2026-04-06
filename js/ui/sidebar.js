"use strict";

(function(){

const Onion = window.Onion;

if(!Onion){
  console.error("💥 Onion no disponible (sidebar)");
  return;
}

/* =========================================================
   STATE
========================================================= */

let initialized = false;
let sidebarEl = null;
let dropdownEl = null;
let observer = null;

/* 🔥 CONTROL REAL */
let activeRenderId = 0;
let loaderActive = false;

/* =========================================================
   LOADER (SINCRONIZADO AL RENDER)
========================================================= */

function startLoader(){

  const currentId = Onion.state.renderId + 1;

  activeRenderId = currentId;
  loaderActive = true;

  document.body.classList.add("loading");

  clearTimeout(window.__onionLoaderTimeout);

  /* 🔥 FAILSAFE DURO */
  window.__onionLoaderTimeout = setTimeout(()=>{
    console.warn("⚠️ Loader forced reset");
    stopLoader(true);
  }, 6000);

}

function stopLoader(force = false){

  if(!loaderActive && !force) return;

  loaderActive = false;

  document.body.classList.remove("loading");
  clearTimeout(window.__onionLoaderTimeout);

}

/* =========================================================
   🔥 DETECTOR REAL (ALINEADO CON RENDER)
========================================================= */

function observeView(){

  const container = document.getElementById("view-container");
  if(!container) return;

  if(observer){
    observer.disconnect();
  }

  observer = new MutationObserver(()=>{

    /* 🔒 SOLO cerrar si coincide render */
    if(activeRenderId !== Onion.state.renderId) return;

    /* 🔥 ESPERAR FRAME REAL (DOM estable) */
    requestAnimationFrame(()=>{
      requestAnimationFrame(()=>{
        stopLoader();
      });
    });

  });

  observer.observe(container, {
    childList: true
  });

}

/* =========================================================
   INIT
========================================================= */

function init(){

  if(initialized) return;

  sidebarEl = document.querySelector(".sidebar");
  if(!sidebarEl) return;

  if(!Onion.state?.user){
    return setTimeout(init, 50);
  }

  dropdownEl = document.getElementById("userDropdown");

  renderUser();
  restoreState();
  applyRoleVisibility();

  observeView();

  initialized = true;

  /* 🔥 APP READY REAL */
  if(!Onion.state.appReady){

    Onion.state.appReady = true;

    console.log("🧅 App READY");

    requestAnimationFrame(()=> Onion.render?.());

  }

}

init();

/* =========================================================
   GLOBAL EVENTS
========================================================= */

document.addEventListener("click", (e)=>{

  /* 🔥 SPA NAV */
  const link = e.target.closest("[data-spa]");
  if(link){

    const href = link.getAttribute("href");

    if(href && href !== window.location.pathname){
      startLoader();
    }

    return;
  }

  /* TOGGLE SIDEBAR */
  const toggle = e.target.closest("#toggleSidebar");
  if(toggle){

    e.stopPropagation();

    const isCollapsed = sidebarEl.classList.contains("collapsed");

    sidebarEl.classList.toggle("collapsed");

    localStorage.setItem("sidebar-collapsed", String(!isCollapsed));

    dropdownEl?.classList.remove("active");

    restoreState();
    return;
  }

  /* USER MENU */
  const user = e.target.closest("#userToggle");
  if(user){

    e.stopPropagation();
    dropdownEl?.classList.toggle("active");
    return;
  }

  /* CLOSE DROPDOWN */
  if(!e.target.closest("#userDropdown")){
    dropdownEl?.classList.remove("active");
  }

  /* LOGOUT */
  const logout = e.target.closest("#logoutBtn");
  if(logout){

    e.stopPropagation();

    startLoader();

    Onion.auth.logout().catch(()=>{
      stopLoader(true);
    });

  }

});

/* =========================================================
   STATE
========================================================= */

function restoreState(){

  const saved = localStorage.getItem("sidebar-collapsed");

  sidebarEl.classList.toggle("collapsed", saved === "true");

}

/* =========================================================
   USER
========================================================= */

function renderUser(){

  const user = Onion.getUser?.();
  if(!user) return;

  const nameEl = document.getElementById("sidebar-name");
  const avatarEl = document.getElementById("sidebar-avatar");

  const name = user.name || user.email || "Usuario";

  if(nameEl) nameEl.textContent = name;

  if(avatarEl){
    avatarEl.innerHTML = `<div>${name[0]}</div>`;
  }

}

/* =========================================================
   ROLES
========================================================= */

function applyRoleVisibility(){

  const user = Onion.getUser?.();
  if(!user) return;

  const isAdmin = (user.role || "").toLowerCase() === "admin";

  document.querySelectorAll('[data-role="admin"]').forEach(el=>{
    el.style.display = isAdmin ? "" : "none";
  });

}

/* =========================================================
   DEBUG
========================================================= */

if(Onion.config?.DEBUG){
  Onion.log("📦 Sidebar FULL PRO synced with render");
}

})();

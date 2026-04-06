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

/* =========================================================
   LOADER (CONTROL REAL POR EVENTOS)
========================================================= */

function startLoader(){

  document.body.classList.add("loading");

  clearTimeout(window.__onionLoaderTimeout);

  /* 🔥 FAILSAFE */
  window.__onionLoaderTimeout = setTimeout(()=>{
    console.warn("⚠️ Loader forced reset");
    stopLoader(true);
  }, 6000);

}

function stopLoader(force = false){

  document.body.classList.remove("loading");
  clearTimeout(window.__onionLoaderTimeout);

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

  bindRenderEvents();

  initialized = true;

  /* 🔥 APP READY */
  if(!Onion.state.appReady){

    Onion.state.appReady = true;

    console.log("🧅 App READY");

    requestAnimationFrame(()=> Onion.render?.());

  }

}

init();

/* =========================================================
   🔥 RENDER SYNC (CLAVE TOTAL)
========================================================= */

function bindRenderEvents(){

  /* 👉 cuando termina render → ocultar loader */
  Onion.events.on("render:end", ()=>{
    stopLoader();
  });

}

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
  Onion.log("📦 Sidebar EVENT-DRIVEN synced with render");
}

})();

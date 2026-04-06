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
let lastRenderTime = 0;

/* =========================================================
   LOADER CORE (INDESTRUCTIBLE)
========================================================= */

function startLoader(){

  document.body.classList.add("loading");

  lastRenderTime = performance.now();

  clearTimeout(window.__onionLoaderTimeout);

  /* 🔥 FALLBACK DURO */
  window.__onionLoaderTimeout = setTimeout(()=>{
    console.warn("⚠️ Loader forced reset");
    stopLoader();
  }, 4000);

}

function stopLoader(){

  if(!document.body.classList.contains("loading")) return;

  document.body.classList.remove("loading");
  clearTimeout(window.__onionLoaderTimeout);

}

/* =========================================================
   🔥 DETECTOR REAL (NO CONFÍA EN NADIE)
========================================================= */

function observeView(){

  const container = document.getElementById("view-container");
  if(!container) return;

  if(observer){
    observer.disconnect();
  }

  observer = new MutationObserver(()=>{

    const now = performance.now();

    /* 🔥 SOLO SI HA PASADO UN POCO DE TIEMPO */
    if(now - lastRenderTime > 50){
      stopLoader();
    }

  });

  observer.observe(container, {
    childList: true
  });

}

/* =========================================================
   INIT (UNA VEZ Y LISTO)
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

  observeView(); /* 🔥 CLAVE TOTAL */

  initialized = true;

  if(!Onion.state.appReady){
    Onion.state.appReady = true;

    console.log("🧅 App READY");

    requestAnimationFrame(()=> Onion.render?.());
  }

}

init();

/* =========================================================
   GLOBAL EVENTS (ULTRA LIMPIO)
========================================================= */

document.addEventListener("click", (e)=>{

  /* 🔥 SPA NAV */
  const link = e.target.closest("[data-spa]");
  if(link && link.href !== window.location.href){
    startLoader();
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
      stopLoader();
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

})();

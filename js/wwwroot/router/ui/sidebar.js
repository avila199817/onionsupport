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

let sidebar = null;
let dropdown = null;

/* =========================================================
   INIT SAFE (REINTENTO SPA)
========================================================= */

function init(){

  sidebar = document.querySelector(".sidebar");
  if(!sidebar){
    // 🔥 SPA: reintenta hasta que exista
    return setTimeout(init, 50);
  }

  dropdown = document.getElementById("userDropdown");

  renderUser();
  restoreState();
  applyRole();

}

if(document.readyState === "loading"){
  document.addEventListener("DOMContentLoaded", init);
}else{
  init();
}

/* =========================================================
   LOADER HOOK (GLOBAL)
========================================================= */

function startLoader(){
  document.body.classList.add("loading");
}

function stopLoader(){
  document.body.classList.remove("loading");
}

/* 🔥 enganchar al render SIN romperlo */
if(!Onion.__sidebarHooked){

  const originalRender = Onion.render;

  Onion.render = async function(){
    try{
      startLoader();
      await originalRender.apply(this, arguments);
    }finally{
      stopLoader();
      init(); // 🔥 re-sync DOM tras render
    }
  };

  Onion.__sidebarHooked = true;
}

/* =========================================================
   EVENTS SAFE
========================================================= */

document.addEventListener("click",(e)=>{

  /* SPA NAV */
  const link = e.target.closest("[data-spa]");
  if(link){
    const href = link.getAttribute("href");
    if(href && href !== location.pathname){
      startLoader();
    }
    return;
  }

  /* TOGGLE SIDEBAR */
  if(e.target.closest("#toggleSidebar")){

    if(!sidebar) return;

    const collapsed = sidebar.classList.toggle("collapsed");
    localStorage.setItem("sidebar-collapsed", collapsed);

    dropdown?.classList.remove("active");
    return;
  }

  /* USER MENU */
  if(e.target.closest("#userToggle")){
    if(!dropdown) return;
    dropdown.classList.toggle("active");
    return;
  }

  /* CLOSE DROPDOWN */
  if(!e.target.closest("#userDropdown")){
    dropdown?.classList.remove("active");
  }

});

/* =========================================================
   STATE
========================================================= */

function restoreState(){

  if(!sidebar) return;

  const saved = localStorage.getItem("sidebar-collapsed");
  sidebar.classList.toggle("collapsed", saved === "true");

}

/* =========================================================
   USER
========================================================= */

function renderUser(){

  const user = Onion.state.user;
  if(!user) return;

  const nameEl = document.getElementById("sidebar-name");
  const avatarEl = document.getElementById("sidebar-avatar");

  const name = user.name || user.username || "Usuario";

  if(nameEl) nameEl.textContent = name;

  if(avatarEl){
    avatarEl.textContent = name[0]?.toUpperCase() || "U";
  }

}

/* =========================================================
   ROLES
========================================================= */

function applyRole(){

  const user = Onion.state.user;
  if(!user) return;

  const isAdmin = (user.role || "").toLowerCase() === "admin";

  document.querySelectorAll('[data-role="admin"]').forEach(el=>{
    el.style.display = isAdmin ? "" : "none";
  });

}

})();

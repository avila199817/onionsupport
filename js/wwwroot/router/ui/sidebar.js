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

let sidebar, dropdown;

/* =========================================================
   INIT
========================================================= */

function init(){

  sidebar = document.querySelector(".sidebar");
  if(!sidebar) return;

  dropdown = document.getElementById("userDropdown");

  renderUser();
  restoreState();
  applyRole();

}

document.addEventListener("DOMContentLoaded", init);

/* =========================================================
   LOADER HOOK
========================================================= */

function startLoader(){
  document.body.classList.add("loading");
}

function stopLoader(){
  document.body.classList.remove("loading");
}

/* 👉 enganchar al render global */
const originalRender = Onion.render;
Onion.render = async function(){
  try{
    startLoader();
    await originalRender.apply(this, arguments);
  }finally{
    stopLoader();
  }
};

/* =========================================================
   EVENTS
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
    const collapsed = sidebar.classList.toggle("collapsed");
    localStorage.setItem("sidebar-collapsed", collapsed);
    dropdown?.classList.remove("active");
    return;
  }

  /* USER MENU */
  if(e.target.closest("#userToggle")){
    dropdown?.classList.toggle("active");
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

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
let toggleBtn = null;

/* =========================================================
   INIT SAFE
========================================================= */

function init(){

  sidebar = document.querySelector(".sidebar");
  if(!sidebar){
    return setTimeout(init, 50);
  }

  dropdown = document.getElementById("userDropdown");
  toggleBtn = document.getElementById("toggleSidebar");

  renderUser();
  restoreState();
  applyRole();
  updateToggleLabel(); // 🔥 clave

}

if(document.readyState === "loading"){
  document.addEventListener("DOMContentLoaded", init);
}else{
  init();
}

/* =========================================================
   LOADER HOOK
========================================================= */

function startLoader(){
  document.body.classList.add("loading");
}

function stopLoader(){
  document.body.classList.remove("loading");
}

if(!Onion.__sidebarHooked){

  const originalRender = Onion.render;

  Onion.render = async function(){
    try{
      startLoader();
      await originalRender.apply(this, arguments);
    }finally{
      stopLoader();
      init();
    }
  };

  Onion.__sidebarHooked = true;
}

/* =========================================================
   EVENTS
========================================================= */

document.addEventListener("click", async (e)=>{

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

    updateToggleLabel(); // 🔥 actualizar texto

    dropdown?.classList.remove("active");
    return;
  }

  /* USER MENU */
  if(e.target.closest("#userToggle")){
    if(!dropdown) return;

    // 🔥 abrir sidebar si está cerrado
    if(sidebar?.classList.contains("collapsed")){
      sidebar.classList.remove("collapsed");
      localStorage.setItem("sidebar-collapsed", "false");
      updateToggleLabel();
    }

    dropdown.classList.toggle("active");
    return;
  }

  /* CLOSE DROPDOWN */
  if(!e.target.closest("#userDropdown")){
    dropdown?.classList.remove("active");
  }

  /* LOGOUT */
  if(e.target.closest("#logoutBtn")){

    e.preventDefault();
    startLoader();

    try{
      await Onion.fetch("/auth/logout", { method: "POST" });
    }catch(e){
      console.warn("Logout error (ignorado)");
    }

    localStorage.removeItem("onion_token");
    localStorage.removeItem("onion_user_slug");
    localStorage.removeItem("onion_user_name");
    localStorage.removeItem("onion_user_avatar");

    Onion.state.user = null;

    location.href = "/";
  }

});

/* =========================================================
   STATE
========================================================= */

function restoreState(){

  if(!sidebar) return;

  const saved = localStorage.getItem("sidebar-collapsed");
  const isCollapsed = saved === "true";

  sidebar.classList.toggle("collapsed", isCollapsed);

}

/* =========================================================
   🔥 TOGGLE LABEL FIX
========================================================= */

function updateToggleLabel(){
  if(!toggleBtn || !sidebar) return;

  const isCollapsed = sidebar.classList.contains("collapsed");

  const text = isCollapsed
    ? "Abrir barra lateral"
    : "Cerrar barra lateral";

  toggleBtn.dataset.tooltip = text;
  toggleBtn.removeAttribute("title");
  toggleBtn.setAttribute("aria-label", text);
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
  const avatar = user.avatar;

  if(nameEl) nameEl.textContent = name;

  if(!avatarEl) return;

  if(avatar){
    avatarEl.innerHTML = `
      <img 
        src="${avatar}" 
        alt="avatar"
        style="width:100%;height:100%;object-fit:cover;border-radius:50%;"
      />
    `;
  }else{
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

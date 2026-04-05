"use strict";

(function(){

const Onion = window.Onion;

if(!Onion){
  console.error("💥 Onion no disponible (sidebar)");
  return;
}

/* =========================
   STATE
========================= */

let initialized = false;


/* =========================
   ROOT
========================= */

function getRoot(){
  return document.querySelector(".sidebar");
}

function $(selector){
  const root = getRoot();
  return root ? root.querySelector(selector) : null;
}


/* =========================
   INIT
========================= */

function init(){

  const root = getRoot();
  if(!root || initialized) return;

  if(!Onion.user){
    return setTimeout(init, 100);
  }

  initialized = true;

  renderUser();
  bindEvents();
  renderRecientes();

  Onion.onCleanup(()=>{
    initialized = false;
  });

}

init();


/* =========================
   USER RENDER (FIX AVATAR)
========================= */

function renderUser(){

  const user = Onion.user;
  if(!user) return;

  const nameEl = $("#sidebar-name");
  const avatarEl = $("#sidebar-avatar");

  const name =
    user.name ||
    user.nombre ||
    user.email ||
    "Usuario";

  if(nameEl){
    nameEl.textContent = name;
  }

  // 🔥 AVATAR REAL (si existe imagen)
  if(avatarEl){

    if(user.avatar || user.image){

      const src = user.avatar || user.image;

      avatarEl.innerHTML = `
        <img src="${src}" 
             alt="${name}" 
             style="width:100%;height:100%;border-radius:50%;object-fit:cover;">
      `;

    }else{

      avatarEl.innerHTML = renderAvatarFallback(name);

    }

  }

}

function renderAvatarFallback(name){

  const initials = getInitials(name);
  const color = getAvatarColor(name);

  return `
    <div style="
      width:100%;
      height:100%;
      border-radius:50%;
      display:flex;
      align-items:center;
      justify-content:center;
      background:${color};
      color:#fff;
      font-weight:600;
      font-size:12px;
    ">
      ${initials}
    </div>
  `;
}


/* =========================
   EVENTS (FIX TODO)
========================= */

function bindEvents(){

  const root = getRoot();
  if(!root) return;

  const toggleSidebarBtn = document.getElementById("toggleSidebar");
  const userToggle = $("#userToggle");
  const dropdown = $("#userDropdown");
  const logout = $("#logoutBtn");

  /* 🔥 SIDEBAR TOGGLE */
  if(toggleSidebarBtn){

    toggleSidebarBtn.addEventListener("click", (e)=>{
      e.stopPropagation();
      document.body.classList.toggle("sidebar-collapsed");

      // opcional si usas clase directa
      root.classList.toggle("collapsed");
    });

  }

  /* 🔥 DROPDOWN FIX */
  if(userToggle && dropdown){

    userToggle.addEventListener("click", (e)=>{
      e.stopPropagation();
      dropdown.classList.toggle("open");
    });

    // 🔥 cerrar al hacer click fuera
    document.addEventListener("click", (e)=>{
      if(!userToggle.contains(e.target) && !dropdown.contains(e.target)){
        dropdown.classList.remove("open");
      }
    });

  }

  /* 🔥 LOGOUT */
  if(logout){
    logout.addEventListener("click", ()=>{
      handleLogout();
    });
  }

}


/* =========================
   LOGOUT
========================= */

function handleLogout(){

  try{
    Onion.auth?.logout?.();
  }catch(e){
    console.error("💥 logout error", e);
  }

  window.location.href = "/login";
}


/* =========================
   RECIENTES (PRO LIMPIO)
========================= */

function renderRecientes(){

  const section = document.querySelector(".sidebar-section");
  if(!section) return;

  // 🔥 loader
  section.innerHTML = `
    <span class="section-title">Recientes</span>
    <div class="recientes-loader">
      <div class="mini-spinner"></div>
      <span>Cargando...</span>
    </div>
  `;

  setTimeout(()=>{

    const items = []; // 🔥 vacío por ahora

    if(!items.length){
      section.innerHTML = `
        <span class="section-title">Recientes</span>
        <div class="recientes-empty">No hay recientes</div>
      `;
      return;
    }

  }, 800);

}


/* =========================
   HELPERS
========================= */

function hashString(str){
  let hash = 0;
  for(let i = 0; i < str.length; i++){
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return hash;
}

function getAvatarColor(name){
  const colors = ["#6366f1","#22c55e","#eab308","#ef4444","#06b6d4","#a855f7","#f97316"];
  return colors[Math.abs(hashString(name)) % colors.length];
}

function getInitials(name){
  if(!name) return "?";
  return name.split(" ").map(n=>n[0]).join("").slice(0,2).toUpperCase();
}

})();

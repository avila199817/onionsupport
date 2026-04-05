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

  // 🔥 USAR MISMO SISTEMA QUE INCIDENCIAS
  if(!Onion.state?.user){
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
   USER RENDER (MISMO SISTEMA)
========================= */

function renderUser(){

  const user = Onion.state?.user;
  if(!user) return;

  const nameEl = $("#sidebar-name");
  const avatarEl = $("#sidebar-avatar");

  const name =
    user.nombre ||
    user.name ||
    user.email ||
    "Usuario";

  if(nameEl){
    nameEl.textContent = name;
  }

  // 🔥 EXACTAMENTE IGUAL QUE INCIDENCIAS
  if(avatarEl){

    if(user.avatar){

      avatarEl.innerHTML = `
        <img src="${user.avatar}" 
             alt="${escapeHTML(name)}"
             style="width:100%;height:100%;border-radius:50%;object-fit:cover;">
      `;

    }else{

      avatarEl.innerHTML = renderAvatarFallback(name);

    }

  }

}


/* =========================
   AVATAR FALLBACK
========================= */

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
   EVENTS — FIX REAL DROPDOWN
========================= */

function bindEvents(){

  const toggleSidebarBtn = document.getElementById("toggleSidebar");
  const userToggle = $("#userToggle");
  const dropdown = $("#userDropdown");
  const logout = $("#logoutBtn");

  /* 🔥 SIDEBAR TOGGLE */
  if(toggleSidebarBtn){
    toggleSidebarBtn.addEventListener("click", (e)=>{
      e.stopPropagation();
      document.body.classList.toggle("sidebar-collapsed");
    });
  }

  /* 🔥 DROPDOWN (FIX REAL) */
  if(userToggle && dropdown){

    userToggle.addEventListener("click", (e)=>{
      e.stopPropagation();

      const isOpen = dropdown.classList.contains("open");

      // 🔥 cerrar todo primero
      closeAllDropdowns();

      // 🔥 abrir si estaba cerrado
      if(!isOpen){
        dropdown.classList.add("open");
      }
    });

  }

  /* 🔥 CLICK GLOBAL (NO ROMPE) */
  document.addEventListener("click", ()=>{
    closeAllDropdowns();
  });

  /* 🔥 LOGOUT */
  if(logout){
    logout.addEventListener("click", (e)=>{
      e.stopPropagation();
      handleLogout();
    });
  }

}


/* =========================
   CLOSE DROPDOWNS
========================= */

function closeAllDropdowns(){
  const dropdown = $("#userDropdown");
  if(dropdown){
    dropdown.classList.remove("open");
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
   RECIENTES (LOADER PRO)
========================= */

function renderRecientes(){

  const section = document.querySelector(".sidebar-section");
  if(!section) return;

  section.innerHTML = `
    <span class="section-title">Recientes</span>

    <div style="
      display:flex;
      align-items:center;
      gap:10px;
      padding:10px;
      opacity:.7;
      font-size:12px;
    ">
      <div style="
        width:14px;
        height:14px;
        border:2px solid rgba(255,255,255,0.1);
        border-top-color:var(--accent);
        border-radius:50%;
        animation:spin .6s linear infinite;
      "></div>

      <span>Cargando...</span>
    </div>
  `;

  setTimeout(()=>{

    section.innerHTML = `
      <span class="section-title">Recientes</span>
      <div style="padding:10px;font-size:12px;opacity:.6;">
        No hay recientes
      </div>
    `;

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

function escapeHTML(str){
  return String(str)
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;");
}

})();

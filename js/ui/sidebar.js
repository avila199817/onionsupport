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
   USER RENDER
========================= */

function renderUser(){

  const user = Onion.user;
  if(!user) return;

  const nameEl = $("#sidebar-name");
  const avatarEl = $("#sidebar-avatar");

  const name = user.name || user.nombre || user.email || "Usuario";

  if(nameEl){
    nameEl.textContent = name;
  }

  if(avatarEl){
    avatarEl.innerHTML = renderAvatar(name);
  }

}

function renderAvatar(name){

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
   EVENTS
========================= */

function bindEvents(){

  const toggle = $("#userToggle");
  const dropdown = $("#userDropdown");
  const logout = $("#logoutBtn");

  if(toggle && dropdown){

    toggle.addEventListener("click", ()=>{
      dropdown.classList.toggle("open");
    });

    document.addEventListener("click", (e)=>{
      if(!toggle.contains(e.target)){
        dropdown.classList.remove("open");
      }
    });

  }

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
   RECIENTES (PRO)
========================= */

function renderRecientes(){

  const section = document.querySelector(".sidebar-section");
  if(!section) return;

  // 🔥 Loader inicial
  section.innerHTML = `
    <span class="section-title">Recientes</span>
    <div class="recientes-loader">
      <div class="mini-spinner"></div>
      <span>Cargando...</span>
    </div>
  `;

  // 🔥 Simulación carga (luego aquí metes API real)
  setTimeout(()=>{

    const items = []; // 👉 de momento vacío

    if(!items.length){
      section.innerHTML = `
        <span class="section-title">Recientes</span>
        <div class="recientes-empty">
          No hay recientes
        </div>
      `;
      return;
    }

    // 🔥 futuro render dinámico
    const html = items.map(i=>`
      <a href="${i.url}" data-spa class="chat-item">
        ${i.label}
      </a>
    `).join("");

    section.innerHTML = `
      <span class="section-title">Recientes</span>
      ${html}
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

})();

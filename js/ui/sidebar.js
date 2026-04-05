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
let loading = false;
let currentRequestId = 0;


/* =========================
   INIT
========================= */

function init(){

  const sidebar = document.querySelector(".sidebar");
  const toggle  = document.getElementById("toggleSidebar");

  if(!sidebar || !toggle || initialized) return;

  if(!Onion.state?.user){
    return setTimeout(init, 100);
  }

  initialized = true;

  renderUser();
  restoreState();
  bindEvents();
  loadRecientes();

  Onion.onCleanup(()=>{
    initialized = false;
  });

}

init();

/* 🔥 RE-MONTAR TRAS CADA RENDER */
Onion.events?.on?.("route:end", ()=>{
  requestAnimationFrame(init);
});


/* =========================
   STATE
========================= */

function restoreState(){

  const sidebar = document.querySelector(".sidebar");
  if(!sidebar) return;

  const saved = localStorage.getItem("sidebar-collapsed");

  sidebar.classList.toggle("collapsed", saved === "true");

  updateTooltip();
}


/* =========================
   EVENTS
========================= */

function bindEvents(){

  const sidebar  = document.querySelector(".sidebar");
  const toggle   = document.getElementById("toggleSidebar");
  const user     = document.getElementById("userToggle");
  const dropdown = document.getElementById("userDropdown");
  const logout   = document.getElementById("logoutBtn");

  Onion.cleanupEvent(toggle, "click", (e)=>{
    e.stopPropagation();

    const isCollapsed = sidebar.classList.contains("collapsed");

    sidebar.classList.toggle("collapsed");

    localStorage.setItem("sidebar-collapsed", String(!isCollapsed));

    dropdown?.classList.remove("active");

    updateTooltip();
  });

  if(user && dropdown){

    Onion.cleanupEvent(user, "click", (e)=>{
      e.stopPropagation();

      const isCollapsed = sidebar.classList.contains("collapsed");

      if(isCollapsed){
        sidebar.classList.remove("collapsed");
        localStorage.setItem("sidebar-collapsed", "false");

        setTimeout(()=>{
          dropdown.classList.add("active");
        }, 180);

        return;
      }

      dropdown.classList.toggle("active");
    });

  }

  Onion.cleanupEvent(document, "click", (e)=>{

    if(
      e.target.closest("#userToggle") ||
      e.target.closest("#userDropdown")
    ){
      return;
    }

    dropdown?.classList.remove("active");
  });

  Onion.cleanupEvent(document, "keydown", (e)=>{
    if(e.key === "Escape"){
      dropdown?.classList.remove("active");
    }
  });

  if(logout){
    Onion.cleanupEvent(logout, "click", ()=>{
      Onion.auth?.logout?.();
      window.location.href = "/login";
    });
  }

}


/* =========================
   USER
========================= */

function renderUser(){

  const user = Onion.state?.user;
  if(!user) return;

  const nameEl = document.getElementById("sidebar-name");
  const avatarEl = document.getElementById("sidebar-avatar");

  const name =
    user.nombre ||
    user.name ||
    user.email ||
    "Usuario";

  if(nameEl) nameEl.textContent = name;

  if(avatarEl){

    if(user.avatar){
      avatarEl.innerHTML = `
        <img src="${user.avatar}"
        style="width:100%;height:100%;border-radius:50%;object-fit:cover;">
      `;
    }else{
      avatarEl.innerHTML = renderAvatarFallback(name);
    }

  }

}


/* =========================
   🔥 LOADER RECIENTES (PRO)
========================= */

function showRecientesLoader(){

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
}

function setRecientesEmpty(){

  const section = document.querySelector(".sidebar-section");
  if(!section) return;

  section.innerHTML = `
    <span class="section-title">Recientes</span>
    <div style="padding:10px;font-size:12px;opacity:.6;">
      No hay recientes
    </div>
  `;
}

function setRecientesError(){

  const section = document.querySelector(".sidebar-section");
  if(!section) return;

  section.innerHTML = `
    <span class="section-title">Recientes</span>
    <div style="padding:10px;font-size:12px;color:#ef4444;">
      Error cargando recientes
    </div>
  `;
}


/* =========================
   LOAD RECIENTES (MISMO FLOW FACTURAS)
========================= */

async function loadRecientes(){

  if(loading) return;
  loading = true;

  const requestId = ++currentRequestId;

  showRecientesLoader();

  try{

    await new Promise(r => requestAnimationFrame(r));
    await new Promise(r => requestAnimationFrame(r));

    // 🔥 CAMBIA ESTE ENDPOINT SI QUIERES
    const res = await Onion.fetch(Onion.config.API + "/recientes");
    const items = normalize(res);

    if(requestId !== currentRequestId) return;

    if(!items.length){
      setRecientesEmpty();
      return;
    }

    renderRecientes(items);

  }catch(e){

    console.error("💥 ERROR RECIENTES:", e);

    if(requestId === currentRequestId){
      setRecientesError();
    }

  }finally{
    loading = false;
  }

}


/* =========================
   NORMALIZE
========================= */

function normalize(res){

  if(!res) return [];

  if(Array.isArray(res)) return res;
  if(Array.isArray(res.data)) return res.data;
  if(Array.isArray(res.items)) return res.items;

  return [];
}


/* =========================
   RENDER RECIENTES
========================= */

function renderRecientes(items){

  const section = document.querySelector(".sidebar-section");
  if(!section) return;

  const html = items.map(i => {

    return `
      <a href="${i.href || '#'}" data-spa class="chat-item">
        ${escapeHTML(i.label || "Item")}
      </a>
    `;

  }).join("");

  section.innerHTML = `
    <span class="section-title">Recientes</span>
    ${html}
  `;
}


/* =========================
   HELPERS
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

function updateTooltip(){

  const sidebar = document.querySelector(".sidebar");
  const toggle = document.getElementById("toggleSidebar");

  if(!sidebar || !toggle) return;

  const collapsed = sidebar.classList.contains("collapsed");

  toggle.setAttribute(
    "data-tooltip",
    collapsed
      ? "Abrir barra lateral"
      : "Cerrar barra lateral"
  );
}

})();

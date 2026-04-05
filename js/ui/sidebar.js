"use strict";

/* =========================
   SIDEBAR FINAL 10/10 (SPA SAFE)
========================= */

(function(){

const Onion = window.Onion;

if(!Onion){
  console.error("💥 Onion no disponible (sidebar)");
  return;
}

/* =========================
   INIT (RE-MONTABLE)
========================= */

function init(){

  const sidebar  = document.querySelector(".sidebar");
  const toggle   = document.getElementById("toggleSidebar");
  const user     = document.getElementById("userToggle");
  const dropdown = document.getElementById("userDropdown");

  if(!sidebar || !toggle) return;

  if(!Onion.state?.user){
    return setTimeout(init, 100);
  }

  renderUser();
  restoreState();
  bindEvents();
  renderRecientes();
}

init();

/* 🔥 RE-INIT TRAS CADA RENDER */
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
   EVENTS (USANDO CLEANUP)
========================= */

function bindEvents(){

  const sidebar  = document.querySelector(".sidebar");
  const toggle   = document.getElementById("toggleSidebar");
  const user     = document.getElementById("userToggle");
  const dropdown = document.getElementById("userDropdown");
  const logout   = document.getElementById("logoutBtn");

  if(toggle){

    Onion.cleanupEvent(toggle, "click", (e)=>{
      e.stopPropagation();

      const isCollapsed = sidebar.classList.contains("collapsed");

      sidebar.classList.toggle("collapsed");

      localStorage.setItem(
        "sidebar-collapsed",
        String(!isCollapsed)
      );

      dropdown?.classList.remove("active");

      updateTooltip();
    });

  }

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

  if(dropdown){

    Onion.cleanupEvent(dropdown, "click", (e)=>{

      e.stopPropagation();

      const item = e.target.closest(".dropdown-item");
      if(!item) return;

      const action =
        item.dataset.action ||
        (item.id === "logoutBtn" ? "logout" : null);

      if(action){

        if(action === "logout"){
          Onion.auth?.logout?.();
          window.location.href = "/login";
          return;
        }

        Onion.emit?.("dropdown:" + action);
      }

      dropdown.classList.remove("active");

    });

  }

  if(logout){

    Onion.cleanupEvent(logout, "click", (e)=>{
      e.stopPropagation();
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

  if(nameEl){
    nameEl.textContent = name;
  }

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
   RECIENTES (LOADER PRO)
========================= */

function renderRecientes(){

  const section = document.querySelector(".sidebar-section");
  if(!section) return;

  // 🔥 LOADER
  section.innerHTML = `
    <span class="section-title">Recientes</span>

    <div class="sidebar-recientes-loading">
      <div class="spinner"></div>
      <span>Cargando...</span>
    </div>
  `;

  // 🔥 SIMULACIÓN (puedes conectar API aquí)
  setTimeout(()=>{

    const recientes = getRecientesMock();

    if(!recientes.length){

      section.innerHTML = `
        <span class="section-title">Recientes</span>
        <div class="sidebar-empty">
          No hay actividad reciente
        </div>
      `;
      return;
    }

    section.innerHTML = `
      <span class="section-title">Recientes</span>
      ${recientes.map(r => `
        <a href="${r.href}" data-spa class="chat-item">
          ${escapeHTML(r.label)}
        </a>
      `).join("")}
    `;

  }, 600);

}


/* =========================
   MOCK (puedes cambiar por API)
========================= */

function getRecientesMock(){
  return [
    { label: "Incidencia servidor", href: "/incidencias" },
    { label: "Factura cliente", href: "/facturas" },
    { label: "Usuario nuevo", href: "/usuarios" }
  ];
}


/* =========================
   TOOLTIP
========================= */

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

})();

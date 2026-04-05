"use strict";

(function(){

const Onion = window.Onion;

if(!Onion){
  console.error("💥 Onion no disponible (sidebar)");
  return;
}

/* =========================
   INIT (SPA SAFE)
========================= */

function init(){

  const sidebar  = document.querySelector(".sidebar");
  const toggle   = document.getElementById("toggleSidebar");
  const user     = document.getElementById("userToggle");
  const dropdown = document.getElementById("userDropdown");

  // 👉 SI NO EXISTE, REINTENTA
  if(!sidebar || !toggle){
    return;
  }

  if(!Onion.state?.user){
    return setTimeout(init, 100);
  }

  // 🔥 IMPORTANTE: limpiar antes de re-bind
  Onion.cleanup?.();

  renderUser();
  restoreState();
  bindEvents();

}

init();


/* =========================
   RE-INIT AUTOMÁTICO
========================= */

// 🔥 cada navegación SPA vuelve a montar
Onion.on?.("route:change", ()=>{
  requestAnimationFrame(init);
});


/* =========================
   RESTORE STATE
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

  /* 🔥 SIDEBAR TOGGLE */
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

  /* 🔥 USER */
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

  /* 🔥 CLICK FUERA */
  Onion.cleanupEvent(document, "click", (e)=>{

    if(
      e.target.closest("#userToggle") ||
      e.target.closest("#userDropdown")
    ){
      return;
    }

    dropdown?.classList.remove("active");

  });

  /* 🔥 ESC */
  Onion.cleanupEvent(document, "keydown", (e)=>{
    if(e.key === "Escape"){
      dropdown?.classList.remove("active");
    }
  });

  /* 🔥 DROPDOWN */
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

  /* 🔥 LOGOUT */
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
   AVATAR
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

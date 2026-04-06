"use strict";

/* =========================================================
   🧅 SIDEBAR — CORE DEFINITIVO (SYNC + ROLES)
========================================================= */

(function(){

const Onion = window.Onion;

if(!Onion){
  console.error("💥 Onion no disponible (sidebar)");
  return;
}

/* =========================================================
   INIT
========================================================= */

function init(){

  const sidebar = document.querySelector(".sidebar");
  if(!sidebar) return;

  if(!Onion.state?.user){
    return setTimeout(init, 50);
  }

  renderUser();
  restoreState();
  applyRoleVisibility();
  setRecientesError();

  /* 🔥 BOOT LIMPIO */
  if(!Onion.state.appReady && Onion.state.user){
    Onion.state.appReady = true;

    console.log("🧅 App READY → first render");

    requestAnimationFrame(()=>{
      Onion.render?.();
    });
  }

}

init();

/* =========================================================
   HOOKS CORE
========================================================= */

if(!window.__ONION_SIDEBAR_CORE__){

  window.__ONION_SIDEBAR_CORE__ = true;

  Onion.events?.onCore?.("app:ready", ()=>{
    requestAnimationFrame(init);
  });

  Onion.events?.onCore?.("route:end", ()=>{

    requestAnimationFrame(()=>{
      renderUser();
      restoreState();
      applyRoleVisibility();
    });

  });

  bindGlobalEvents();

}

/* =========================================================
   STATE
========================================================= */

function restoreState(){

  const sidebar = document.querySelector(".sidebar");
  const toggle  = document.getElementById("toggleSidebar");

  if(!sidebar || !toggle) return;

  const saved = localStorage.getItem("sidebar-collapsed");

  sidebar.classList.toggle("collapsed", saved === "true");

  toggle.setAttribute(
    "data-tooltip",
    sidebar.classList.contains("collapsed")
      ? "Abrir barra lateral"
      : "Cerrar barra lateral"
  );

}

/* =========================================================
   ROLES (ADMIN CONTROL)
========================================================= */

function applyRoleVisibility(){

  const user = Onion.getUser?.();
  if(!user) return;

  const role = (user.role || "").toLowerCase();

  const isAdmin = role === "admin";

  const adminItems = document.querySelectorAll(
    '[data-role="admin"]'
  );

  adminItems.forEach(el=>{
    el.style.display = isAdmin ? "" : "none";
  });

}

/* =========================================================
   GLOBAL EVENTS
========================================================= */

function bindGlobalEvents(){

  /* =========================
     TOGGLE SIDEBAR
  ========================= */

  Onion.onGlobalEvent?.(document, "click", (e)=>{

    const toggle = e.target.closest("#toggleSidebar");
    if(toggle){

      e.stopPropagation();

      const sidebar = document.querySelector(".sidebar");
      const dropdown = document.getElementById("userDropdown");

      if(!sidebar) return;

      const isCollapsed = sidebar.classList.contains("collapsed");

      sidebar.classList.toggle("collapsed");

      localStorage.setItem("sidebar-collapsed", String(!isCollapsed));

      dropdown?.classList.remove("active");

      restoreState();
      return;
    }

  });

  /* =========================
     USER DROPDOWN
  ========================= */

  Onion.onGlobalEvent?.(document, "click", (e)=>{

    const user = e.target.closest("#userToggle");
    if(!user) return;

    e.stopPropagation();

    const sidebar = document.querySelector(".sidebar");
    const dropdown = document.getElementById("userDropdown");

    if(!sidebar || !dropdown) return;

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

  /* =========================
     CLOSE DROPDOWN
  ========================= */

  Onion.onGlobalEvent?.(document, "click", (e)=>{

    if(
      e.target.closest("#userToggle") ||
      e.target.closest("#userDropdown")
    ){
      return;
    }

    document.getElementById("userDropdown")?.classList.remove("active");

  });

  /* =========================
     ESC CLOSE
  ========================= */

  Onion.onGlobalEvent?.(document, "keydown", (e)=>{
    if(e.key === "Escape"){
      document.getElementById("userDropdown")?.classList.remove("active");
    }
  });

  /* =========================
     LOGOUT
  ========================= */

  Onion.onGlobalEvent?.(document, "click", async (e)=>{

    const logout = e.target.closest("#logoutBtn");
    if(!logout) return;

    e.stopPropagation();

    Onion.ui?.showLoader?.();

    try{
      await Onion.auth.logout();
    }catch(err){
      Onion.error("LOGOUT ERROR:", err);
    }

  });

}

/* =========================================================
   USER
========================================================= */

function renderUser(){

  const user = Onion.getUser?.();
  if(!user) return;

  const nameEl = document.getElementById("sidebar-name");
  const avatarEl = document.getElementById("sidebar-avatar");

  const name =
    user.name ||
    user.username ||
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

/* =========================================================
   RECIENTES
========================================================= */

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

/* =========================================================
   HELPERS
========================================================= */

function renderAvatarFallback(name){

  const initials = getInitials(name);
  const color = getAvatarColor(name);

  return `
    <div style="width:100%;height:100%;border-radius:50%;
    display:flex;align-items:center;justify-content:center;
    background:${color};color:#fff;font-weight:600;font-size:12px;">
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

/* =========================================================
   DEBUG
========================================================= */

if(Onion.config?.DEBUG){
  Onion.log("📚 Sidebar DEFINITIVO ready");
}

})();

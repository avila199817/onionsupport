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
let sidebarEl = null;
let dropdownEl = null;

/* =========================================================
   LOADER CONTROL (ROBUSTO 🔥)
========================================================= */

function startGlobalLoader(){

  document.body.classList.add("loading");

  clearTimeout(window.__onionLoaderTimeout);

  window.__onionLoaderTimeout = setTimeout(()=>{
    console.warn("⚠️ Loader auto-reset (fallback)");
    stopGlobalLoader();
  }, 4000);

}

function stopGlobalLoader(){

  if(!document.body.classList.contains("loading")) return;

  document.body.classList.remove("loading");
  clearTimeout(window.__onionLoaderTimeout);

}

/* =========================================================
   INIT (ANTI DUPLICADOS)
========================================================= */

function init(){

  if(initialized) return;

  sidebarEl = document.querySelector(".sidebar");
  if(!sidebarEl) return;

  if(!Onion.state?.user){
    return setTimeout(init, 50);
  }

  dropdownEl = document.getElementById("userDropdown");

  renderUser();
  restoreState();
  applyRoleVisibility();
  setRecientesError();

  initialized = true;

  if(!Onion.state.appReady){
    Onion.state.appReady = true;

    console.log("🧅 App READY → first render");

    requestAnimationFrame(()=> Onion.render?.());
  }

}

init();

/* =========================================================
   CORE HOOKS (BLINDADOS)
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
      fixImageFlicker();
    });

    /* 🔥 FALLBACK SOLO */
    stopGlobalLoader();

  });

  bindGlobalEvents();

}

/* =========================================================
   GLOBAL EVENTS (FINOS)
========================================================= */

function bindGlobalEvents(){

  Onion.onGlobalEvent?.(document, "click", (e)=>{

    /* 🔥 SPA NAV */
    const link = e.target.closest("[data-spa]");
    if(link && link.href !== window.location.href){
      startGlobalLoader();
      return;
    }

    /* 🔥 TOGGLE SIDEBAR */
    const toggle = e.target.closest("#toggleSidebar");
    if(toggle){

      e.stopPropagation();

      const isCollapsed = sidebarEl.classList.contains("collapsed");

      sidebarEl.classList.toggle("collapsed");

      localStorage.setItem("sidebar-collapsed", String(!isCollapsed));

      dropdownEl?.classList.remove("active");

      restoreState();
      return;
    }

    /* 🔥 USER DROPDOWN */
    const user = e.target.closest("#userToggle");
    if(user){

      e.stopPropagation();

      const isCollapsed = sidebarEl.classList.contains("collapsed");

      if(isCollapsed){
        sidebarEl.classList.remove("collapsed");
        localStorage.setItem("sidebar-collapsed", "false");

        setTimeout(()=> dropdownEl?.classList.add("active"), 120);
        return;
      }

      dropdownEl?.classList.toggle("active");
      return;
    }

    /* 🔥 CLOSE DROPDOWN */
    if(!e.target.closest("#userDropdown")){
      dropdownEl?.classList.remove("active");
    }

    /* 🔥 LOGOUT */
    const logout = e.target.closest("#logoutBtn");
    if(logout){

      e.stopPropagation();

      startGlobalLoader();

      Onion.auth.logout().catch(err=>{
        Onion.error("LOGOUT ERROR:", err);
        stopGlobalLoader();
      });

    }

  });

  Onion.onGlobalEvent?.(document, "keydown", (e)=>{
    if(e.key === "Escape"){
      dropdownEl?.classList.remove("active");
    }
  });

}

/* =========================================================
   STATE
========================================================= */

function restoreState(){

  if(!sidebarEl) return;

  const toggle = document.getElementById("toggleSidebar");

  const saved = localStorage.getItem("sidebar-collapsed");

  sidebarEl.classList.toggle("collapsed", saved === "true");

  toggle?.setAttribute(
    "data-tooltip",
    sidebarEl.classList.contains("collapsed")
      ? "Abrir barra lateral"
      : "Cerrar barra lateral"
  );

}

/* =========================================================
   ROLES
========================================================= */

function applyRoleVisibility(){

  const user = Onion.getUser?.();
  if(!user) return;

  const role = (user.role || "").toLowerCase();
  const isAdmin = role === "admin";

  document.querySelectorAll('[data-role="admin"]').forEach(el=>{
    el.style.display = isAdmin ? "" : "none";
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
   UI
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

function fixImageFlicker(){

  document.querySelectorAll("img").forEach(img=>{

    if(img.complete) return;

    img.style.opacity = "0";

    img.onload = ()=>{
      img.style.transition = "opacity .2s ease";
      img.style.opacity = "1";
    };

  });

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

function getInitials(name){
  if(!name) return "?";
  return name.split(" ").map(n=>n[0]).join("").slice(0,2).toUpperCase();
}

function getAvatarColor(name){
  const colors = ["#6366f1","#22c55e","#eab308","#ef4444","#06b6d4","#a855f7","#f97316"];
  let hash = 0;
  for(let i = 0; i < name.length; i++){
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

})();

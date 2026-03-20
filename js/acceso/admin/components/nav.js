(function(){

"use strict";

/* =====================================================
   INIT
===================================================== */

boot();

function boot(){

  if(document.readyState === "complete"){
    loadNav();
  }else{
    window.addEventListener("onion:app-ready", loadNav);
  }

  // 🔥 IMPORTANTE: recargar nav si cambias de ruta (por si acaso)
  window.addEventListener("onion:route-change", ()=>{
    rebindNavLinks();
  });

}

/* =====================================================
   LOAD NAV
===================================================== */

async function loadNav(){

  console.log("NAV LOAD");

  const container = document.getElementById("nav-container");
  if(!container) return;

  try{

    const res = await fetch("/es/acceso/admin/partials/nav.html");
    if(!res.ok) throw new Error("NAV HTML ERROR");

    container.innerHTML = await res.text();

    initNav();
    loadNavSearch();

  }catch(err){
    console.error("NAV LOAD ERROR:", err);
  }

}

/* =====================================================
   LOAD SEARCH
===================================================== */

function loadNavSearch(){

  if(window.__onionNavSearchScript) return;

  const script = document.createElement("script");
  script.src = "/js/acceso/admin/components/nav_search.js";

  script.onload = ()=>{
    window.dispatchEvent(new Event("onion:nav-ready"));
  };

  document.body.appendChild(script);

  window.__onionNavSearchScript = true;

}

/* =====================================================
   INIT NAV
===================================================== */

function initNav(){

  console.log("NAV INIT");

  const navLinks       = document.querySelector(".nav-links");
  const navToggle      = document.getElementById("navToggle");

  const navClientes    = document.getElementById("nav-clientes");
  const navUsuarios    = document.getElementById("nav-usuarios");

  const navAvatarImg   = document.getElementById("navAvatarImg");

  const navUserTrigger = document.getElementById("navUserTrigger");
  const navUserMenu    = document.getElementById("navUserMenu");

  const userGreeting   = document.getElementById("userGreeting");

  const logoutBtn      = document.getElementById("logout");

  const nav            = document.querySelector(".nav-top");

  const FALLBACK_AVATAR="/media/img/Usuario.png";

  /* =====================================================
     USER
  ===================================================== */

  function applyUser(user){

    if(!user) return;

    window.APP_ROLE = (user.role || "user").toLowerCase();

    if(navClientes){
      navClientes.style.display =
        window.APP_ROLE === "admin" ? "list-item" : "none";
    }

    if(navUsuarios){
      navUsuarios.style.display =
        window.APP_ROLE === "admin" ? "list-item" : "none";
    }

    if(userGreeting){
      userGreeting.textContent = user.name || "";
    }

    if(navAvatarImg){
      navAvatarImg.src = user.avatar || FALLBACK_AVATAR;
    }

  }

  if(window.Onion?.state?.user){
    applyUser(Onion.state.user);
  }

  window.addEventListener("onion:user-ready",(e)=>{
    applyUser(e.detail);
  });

  /* =====================================================
     NAVIGATION (🔥 FIX REAL)
  ===================================================== */

  rebindNavLinks();

  /* =====================================================
     LOGOUT
  ===================================================== */

  logoutBtn?.addEventListener("click",()=>{
    localStorage.clear();
    window.location.href="/es/acceso/";
  });

  /* =====================================================
     MOBILE
  ===================================================== */

  navToggle?.addEventListener("click",()=>{

    navLinks?.classList.toggle("open");
    navToggle.classList.toggle("active");
    document.body.classList.toggle("nav-open");

  });

  /* =====================================================
     USER MENU
  ===================================================== */

  navUserTrigger?.addEventListener("click",(e)=>{
    e.stopPropagation();
    navUserMenu?.classList.toggle("open");
  });

  document.addEventListener("click",(e)=>{
    if(!navUserMenu?.contains(e.target)){
      navUserMenu?.classList.remove("open");
    }
  });

  /* =====================================================
     SCROLL
  ===================================================== */

  window.addEventListener("scroll",()=>{
    nav?.classList.toggle("scrolled", window.scrollY > 10);
  });

}

/* =====================================================
   🔥 REBIND NAV LINKS (CLAVE)
===================================================== */

function rebindNavLinks(){

  document.querySelectorAll(".nav-links a[data-link]").forEach(link=>{

    // evitar duplicados
    link.onclick = null;

    link.addEventListener("click",(e)=>{

      const path = link.getAttribute("href");
      if(!path) return;

      const role = window.APP_ROLE || "user";

      if(path.includes("/usuarios") || path.includes("/clientes")){
        if(role !== "admin"){
          e.preventDefault();
          console.warn("⛔ Acceso denegado:", path);
          return;
        }
      }

      if(window.Onion){
        e.preventDefault();
        Onion.go(path);
      }

    });

  });

}

})();
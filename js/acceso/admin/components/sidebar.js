(function(){

"use strict";

/* =====================================================
   SINGLETON
===================================================== */

if(window.__onionSidebarLoaded) return;
window.__onionSidebarLoaded = true;


/* =====================================================
   CONFIG
===================================================== */

const SIDEBAR_URL = "/es/acceso/admin/cuenta/components/sidebar.html";

let cacheHTML = null;
let mounted = false;


/* =====================================================
   LOAD SIDEBAR
===================================================== */

async function loadSidebar(){

  const container = document.getElementById("sidebar-container");
  if(!container) return;

  try{

    // 🔥 evitar recargar si ya está montado
    if(mounted && container.innerHTML.trim() !== ""){
      setActive();
      return;
    }

    // 🔥 usar cache si existe
    if(cacheHTML){
      container.innerHTML = cacheHTML;
      mounted = true;
      setActive();
      return;
    }

    const res = await fetch(SIDEBAR_URL);

    if(!res.ok){
      throw new Error("HTTP " + res.status);
    }

    const html = await res.text();

    cacheHTML = html;
    container.innerHTML = html;

    mounted = true;

    setActive();

  }catch(e){

    console.error("💥 Sidebar error:", e);

  }

}


/* =====================================================
   ACTIVE LINK (PRO)
===================================================== */

function setActive(){

  const links = document.querySelectorAll(".gsettings-sidebar a");
  if(!links.length) return;

  const path = normalizePath(window.location.pathname);

  links.forEach(link => {

    const href = normalizePath(link.getAttribute("href"));

    // match exacto o por subruta
    if(path === href || path.startsWith(href)){
      link.classList.add("active");
    }else{
      link.classList.remove("active");
    }

  });

}


/* =====================================================
   HELPERS
===================================================== */

function normalizePath(p){

  if(!p) return "/";

  return p
    .replace(/\/+$/,"")   // quita slash final
    .replace(/^\/@[^/]+/,""); // elimina slug tipo /@user

}


/* =====================================================
   EVENTS
===================================================== */

window.addEventListener("onion:user-ready", loadSidebar);
window.addEventListener("onion:route-change", setActive);


/* =====================================================
   FALLBACK (POR SI ACASO)
===================================================== */

if(document.readyState !== "loading"){
  loadSidebar();
}else{
  document.addEventListener("DOMContentLoaded", loadSidebar);
}

})();
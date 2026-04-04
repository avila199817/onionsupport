"use strict";

(function(){

  if(!window.Onion){
    console.error("💥 Onion no disponible (roles)");
    return;
  }

  /* =========================
     STATE
  ========================= */

  let initialized = false;
  let observer = null;

  /* =========================
     HELPERS
  ========================= */

  function getUser(){
    return Onion.state?.user || null;
  }

  function getRole(){
    return getUser()?.role || "guest";
  }

  function hasRole(role){
    return getRole() === role;
  }

  function hasAnyRole(roles){
    const current = getRole();
    return roles.includes(current);
  }

  /* =========================
     APPLY UI
  ========================= */

  function applyRoleUI(root = document){

    const role = getRole();

    // 🔥 data-role="admin"
    root.querySelectorAll("[data-role]").forEach(el => {

      const roles = el.dataset.role.split(",").map(r => r.trim());

      const allowed = hasAnyRole(roles);

      // ✅ no rompemos display original
      el.hidden = !allowed;
    });

    // 🔥 debug opcional
    // console.log("👤 ROLE:", role);

  }

  /* =========================
     OBSERVER (DOM dinámico)
  ========================= */

  function initObserver(){

    if(observer) return;

    observer = new MutationObserver((mutations)=>{

      for(const m of mutations){

        if(m.addedNodes.length){

          m.addedNodes.forEach(node => {

            if(node.nodeType !== 1) return;

            // 🔥 aplicar solo a lo nuevo
            applyRoleUI(node);

          });

        }

      }

    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

  }

  /* =========================
     HOOK RENDER SPA
  ========================= */

  function hookRender(){

    if(Onion.__rolesHooked) return;
    Onion.__rolesHooked = true;

    const originalRender = Onion.render;

    Onion.render = async function(){

      const result = await originalRender.apply(this, arguments);

      // 🔥 esperar al DOM
      requestAnimationFrame(()=>{
        applyRoleUI();
      });

      return result;
    };

  }

  /* =========================
     PUBLIC API (opcional)
  ========================= */

  window.RoleSystem = {
    refresh: () => applyRoleUI(),
    getRole,
    hasRole,
    hasAnyRole
  };

  /* =========================
     INIT
  ========================= */

  function init(){

    if(initialized) return;

    initialized = true;

    hookRender();
    initObserver();

    // 🔥 primera pasada
    if(document.readyState === "loading"){
      document.addEventListener("DOMContentLoaded", ()=> applyRoleUI());
    }else{
      applyRoleUI();
    }

  }

  init();

})();

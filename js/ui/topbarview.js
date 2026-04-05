"use strict";

/* =========================================================
   🧅 ROLE / TOPBARVIEW SYSTEM — FULL PRO (SIN HOOKS ROTOS)
========================================================= */

(function(){

  if(!window.Onion){
    console.error("💥 Onion no disponible (topbarview)");
    return;
  }

  const Onion = window.Onion;

  /* =========================
     STATE
  ========================= */

  let initialized = false;
  let observer = null;

  /* =========================
     HELPERS
  ========================= */

  function getUser(){
    return Onion.getUser?.() || Onion.state?.user || null;
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

    root.querySelectorAll("[data-role]").forEach(el => {

      const roles = el.dataset.role
        .split(",")
        .map(r => r.trim());

      const allowed = hasAnyRole(roles);

      el.hidden = !allowed;

    });

  }

  /* =========================
     OBSERVER (DOM DINÁMICO)
  ========================= */

  function initObserver(){

    if(observer) return;

    observer = new MutationObserver((mutations)=>{

      for(const m of mutations){

        if(m.addedNodes.length){

          m.addedNodes.forEach(node => {

            if(node.nodeType !== 1) return;

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
     HOOK SPA (SIN ROMPER RENDER)
  ========================= */

  function bindEvents(){

    Onion.events?.on?.("route:end", ()=>{
      requestAnimationFrame(()=> applyRoleUI());
    });

    Onion.events?.on?.("app:ready", ()=>{
      requestAnimationFrame(()=> applyRoleUI());
    });

  }

  /* =========================
     API GLOBAL
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

    initObserver();
    bindEvents();

    if(document.readyState === "loading"){
      document.addEventListener("DOMContentLoaded", ()=> applyRoleUI());
    }else{
      applyRoleUI();
    }

  }

  init();

  /* =========================
     DEBUG
  ========================= */

  if(Onion.config?.DEBUG){
    Onion.log("👤 Role system PRO ready");
  }

})();

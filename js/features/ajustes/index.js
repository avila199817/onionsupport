(function(){

"use strict";

const Onion = window.Onion;

if(!Onion){
  console.error("💥 Onion no disponible (ajustes)");
  return;
}

let initialized = false;

/* =========================
   ROOT
========================= */

function getRoot(){
  return document.querySelector(".panel-content.ajustes");
}

function $(id){
  return getRoot()?.querySelector("#" + id);
}

/* =========================
   INIT
========================= */

function init(){

  const root = getRoot();
  if(!root) return;

  if(initialized) return;

  initialized = true;

  bindEvents();

  Onion.onCleanup(()=>{
    initialized = false;
  });

}

init();

/* =========================
   EVENTS (mínimo)
========================= */

function bindEvents(){

  const root = getRoot();
  if(!root) return;

  // ejemplo toggle simple
  const toggle = $("#toggle-ejemplo");

  if(toggle){
    Onion.cleanupEvent(toggle, "change", ()=>{
      console.log("⚙️ Ajuste cambiado:", toggle.checked);
    });
  }

}

})();

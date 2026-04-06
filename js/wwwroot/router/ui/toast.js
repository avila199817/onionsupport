"use strict";

/* =========================================================
   🧅 TOAST — FINAL PRO (SPA SAFE · NO LEAKS · NO DUPES)
========================================================= */

(function(){

if(!window.Onion){
  console.error("💥 Onion no definido (toast.js)");
  return;
}

const Onion = window.Onion;

const MAX_TOASTS = 5;
let lastMessage = null;

/* =========================
   CONTAINER
========================= */

function getContainer(){

  let container = document.querySelector(".toast-container");

  if(!container){
    container = document.createElement("div");
    container.className = "toast-container";
    document.body.appendChild(container);
  }

  return container;
}

/* =========================
   REMOVE
========================= */

function removeToast(toast){

  if(!toast) return;

  toast.classList.remove("show");
  toast.classList.add("hide");

  setTimeout(()=>{
    try{ toast.remove(); }catch{}
  }, 250);
}

/* =========================
   CLEAR
========================= */

function clearAll(){

  const container = document.querySelector(".toast-container");
  if(container){
    container.innerHTML = "";
  }

}

/* =========================
   SHOW
========================= */

function showToast(message, type="info", duration=3000){

  if(!message) return;

  // 🔥 evitar spam inmediato
  if(message === lastMessage) return;
  lastMessage = message;

  setTimeout(()=>{ lastMessage = null; }, 500);

  const container = getContainer();

  // 🔥 límite de toasts
  if(container.children.length >= MAX_TOASTS){
    removeToast(container.firstChild);
  }

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;

  const msg = document.createElement("div");
  msg.className = "toast-message";
  msg.textContent = message;

  const btn = document.createElement("button");
  btn.className = "toast-close";
  btn.innerHTML = "&times;";

  toast.appendChild(msg);
  toast.appendChild(btn);
  container.appendChild(toast);

  requestAnimationFrame(()=>{
    toast.classList.add("show");
  });

  let timeout = setTimeout(()=>{
    removeToast(toast);
  }, duration);

  /* =========================
     EVENTS
  ========================= */

  const onClose = ()=>{
    clearTimeout(timeout);
    removeToast(toast);
  };

  const onHover = ()=>{
    clearTimeout(timeout);
  };

  const onLeave = ()=>{
    timeout = setTimeout(()=>{
      removeToast(toast);
    }, duration);
  };

  btn.addEventListener("click", onClose);
  toast.addEventListener("mouseenter", onHover);
  toast.addEventListener("mouseleave", onLeave);

  /* =========================
     CLEANUP SPA (CLAVE)
  ========================= */

  Onion.onCleanup?.(()=>{

    clearTimeout(timeout);

    btn.removeEventListener("click", onClose);
    toast.removeEventListener("mouseenter", onHover);
    toast.removeEventListener("mouseleave", onLeave);

    removeToast(toast);

  });

}

/* =========================
   API GLOBAL
========================= */

Onion.ui = Onion.ui || {};

Onion.ui.toast = {
  success:(msg,d)=>showToast(msg,"success",d),
  error:(msg,d)=>showToast(msg,"error",d),
  warning:(msg,d)=>showToast(msg,"warning",d),
  info:(msg,d)=>showToast(msg,"info",d),
  show:showToast,
  clear:clearAll
};

/* =========================
   DEBUG
========================= */

if(Onion.config?.DEBUG){
  console.log("🍞 Toast FINAL PRO READY");
}

})();

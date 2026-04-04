"use strict";

(function(){

  if(!window.Onion){
    console.error("💥 Onion no definido (toast.js)");
    return;
  }

  const Onion = window.Onion;
  const MAX_TOASTS = 5;

  function getContainer(){

    let container = document.querySelector(".toast-container");

    if(!container){
      container = document.createElement("div");
      container.className = "toast-container";
      document.body.appendChild(container);
    }

    return container;

  }

  function removeToast(toast){

    if(!toast) return;

    toast.classList.remove("show");
    toast.classList.add("hide");

    setTimeout(()=> toast.remove(), 250);

  }

  function clearAll(){

    const container = document.querySelector(".toast-container");
    if(container) container.innerHTML = "";

  }

  function showToast(message, type="info", duration=3000){

    const container = getContainer();

    if(container.children.length >= MAX_TOASTS){
      container.firstChild.remove();
    }

    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;

    const msg = document.createElement("div");
    msg.className = "toast-message";
    msg.textContent = message;

    const btn = document.createElement("button");
    btn.className = "toast-close";
    btn.textContent = "✕";

    toast.appendChild(msg);
    toast.appendChild(btn);
    container.appendChild(toast);

    requestAnimationFrame(()=>{
      toast.classList.add("show");
    });

    let timeout = setTimeout(()=>{
      removeToast(toast);
    }, duration);

    const onClose = ()=>{
      clearTimeout(timeout);
      removeToast(toast);
    };

    btn.addEventListener("click", onClose);

    Onion.onCleanup(()=>{
      clearTimeout(timeout);
      btn.removeEventListener("click", onClose);
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

})();

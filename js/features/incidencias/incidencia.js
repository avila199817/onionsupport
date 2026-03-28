"use strict";

(function(){

const Onion = window.Onion;

if(!Onion){
  console.error("💥 Onion no disponible (incidencia.js)");
  return;
}

let initialized = false;

/* =========================
   INIT
========================= */

function init(){

  const root = getRoot();
  if(!root || initialized) return;

  if(!Onion.state?.user){
    return setTimeout(init, 100);
  }

  initialized = true;

  bindEvents();

  Onion.onCleanup(()=>{
    initialized = false;
  });

}

init();

/* =========================
   ROOT
========================= */

function getRoot(){
  return document.querySelector(".panel-content.incidencia-create");
}

function $(selector){
  return getRoot()?.querySelector(selector);
}

/* =========================
   EVENTS
========================= */

function bindEvents(){

  const root = getRoot();
  if(!root) return;

  // VOLVER
  Onion.cleanupEvent(root, "click", (e)=>{

    if(e.target.id === "btn-back"){
      Onion.router.navigate("/incidencias");
    }

  });

  // CREAR
  $("#btn-save-incidencia")?.addEventListener("click", saveIncidencia);

}

/* =========================
   SAVE
========================= */

async function saveIncidencia(){

  clearErrors();

  const data = {
    subject: $("#inc-title")?.value?.trim() || "",
    message: $("#inc-message")?.value?.trim() || "",
    name: $("#inc-cliente")?.value?.trim() || "",
    priority: $("#inc-priority")?.value || "low"
  };

  /* =========================
     VALIDACIÓN PRO
  ========================= */

  let valid = true;

  if(!data.subject){
    setError("#inc-title", "Introduce un título");
    valid = false;
  }

  if(!data.message){
    setError("#inc-message", "Describe el problema");
    valid = false;
  }

  if(!data.name){
    setError("#inc-cliente", "Indica el usuario");
    valid = false;
  }

  if(!valid) return;

  /* =========================
     UI LOCK
  ========================= */

  const btn = $("#btn-save-incidencia");

  if(btn){
    btn.disabled = true;
    btn.dataset.original = btn.innerText;
    btn.innerText = "Creando...";
  }

  try{

    await Onion.fetch(Onion.config.API + "/tickets", {
      method: "POST",
      body: JSON.stringify(data)
    });

    showToast("Incidencia creada correctamente", "success");

    resetForm();

    setTimeout(()=>{
      Onion.router.navigate("/incidencias");
    }, 600);

  }catch(err){

    console.error("💥 Error creando incidencia:", err);

    showToast("Error creando incidencia", "error");

  }finally{

    if(btn){
      btn.disabled = false;
      btn.innerText = btn.dataset.original || "Crear incidencia";
    }

  }

}

/* =========================
   FORM HELPERS
========================= */

function resetForm(){

  ["#inc-title", "#inc-message", "#inc-cliente"].forEach(sel=>{
    const el = $(sel);
    if(el) el.value = "";
  });

  const p = $("#inc-priority");
  if(p) p.value = "low";

}

function setError(selector, message){

  const el = $(selector);
  if(!el) return;

  el.classList.add("error");

  let msg = el.parentNode.querySelector(".input-error");

  if(!msg){
    msg = document.createElement("div");
    msg.className = "input-error";
    el.parentNode.appendChild(msg);
  }

  msg.innerText = message;

}

function clearErrors(){

  const root = getRoot();
  if(!root) return;

  root.querySelectorAll(".error").forEach(el=>{
    el.classList.remove("error");
  });

  root.querySelectorAll(".input-error").forEach(el=>{
    el.remove();
  });

}

/* =========================
   TOAST (LIGHT)
========================= */

function showToast(message, type){

  const el = document.createElement("div");
  el.className = `toast show ${type}`;
  el.innerText = message;

  document.body.appendChild(el);

  setTimeout(()=>{
    el.classList.remove("show");
    setTimeout(()=> el.remove(), 300);
  }, 2000);

}

/* =========================
   KEYBOARD UX
========================= */

document.addEventListener("keydown", (e)=>{

  if(e.key === "Enter" && e.ctrlKey){
    const root = getRoot();
    if(root){
      saveIncidencia();
    }
  }

});

})();

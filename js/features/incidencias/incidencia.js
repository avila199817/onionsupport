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

  // CREAR INCIDENCIA
  $("#btn-save-incidencia")?.addEventListener("click", saveIncidencia);

}

/* =========================
   SAVE
========================= */

async function saveIncidencia(){

  const data = {
    subject: $("#inc-title")?.value?.trim() || "",
    message: $("#inc-message")?.value?.trim() || "",
    name: $("#inc-cliente")?.value?.trim() || "",
    priority: $("#inc-priority")?.value || "low"
  };

  // VALIDACIÓN
  if(!data.message){
    alert("⚠️ El mensaje es obligatorio");
    return;
  }

  // UI LOCK
  const btn = $("#btn-save-incidencia");
  if(btn){
    btn.disabled = true;
    btn.innerText = "Creando...";
  }

  try{

    await Onion.fetch(Onion.config.API + "/tickets", {
      method: "POST",
      body: JSON.stringify(data)
    });

    // SUCCESS
    alert("✅ Incidencia creada");

    resetForm();

    // VOLVER A LISTADO
    Onion.router.navigate("/incidencias");

  }catch(err){

    console.error("💥 Error creando incidencia:", err);
    alert("❌ Error creando incidencia");

  }finally{

    if(btn){
      btn.disabled = false;
      btn.innerText = "Crear incidencia";
    }

  }

}

/* =========================
   RESET FORM
========================= */

function resetForm(){

  const inputs = [
    "#inc-title",
    "#inc-message",
    "#inc-cliente"
  ];

  inputs.forEach(sel => {
    const el = $(sel);
    if(el) el.value = "";
  });

  const priority = $("#inc-priority");
  if(priority) priority.value = "low";

}

/* =========================
   OPTIONAL UX (ENTER SUBMIT)
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

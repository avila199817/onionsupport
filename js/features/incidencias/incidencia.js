"use strict";

(function(){

const Onion = window.Onion;

if(!Onion){
  console.error("💥 Onion no disponible (incidencia.js)");
  return;
}

let initialized = false;
let selectedFiles = [];

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

  setGreeting();
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
   GREETING
========================= */

function setGreeting(){

  const user = Onion.state.user;
  if(!user) return;

  const name = user.name || user.username || "Usuario";

  const title = getRoot()?.querySelector(".page-title");

  if(title){
    title.innerText = `Hola, ${name} 👋`;
  }

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

  // FILES
  $("#btn-attach")?.addEventListener("click", ()=>{
    $("#inc-files")?.click();
  });

  $("#inc-files")?.addEventListener("change", handleFiles);

}

/* =========================
   FILES
========================= */

function handleFiles(e){

  const files = Array.from(e.target.files || []);

  if(!files.length) return;

  selectedFiles = [...selectedFiles, ...files];

  renderFiles();

}

function renderFiles(){

  const list = $("#file-list");
  if(!list) return;

  if(!selectedFiles.length){
    list.innerHTML = "";
    return;
  }

  list.innerHTML = selectedFiles.map((f, i)=>`
    <div style="display:flex; justify-content:space-between; align-items:center; gap:10px;">
      <span>📎 ${f.name}</span>
      <button data-remove="${i}" style="background:none;border:none;color:var(--error);cursor:pointer;">✕</button>
    </div>
  `).join("");

  // remove file
  list.querySelectorAll("[data-remove]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const index = Number(btn.dataset.remove);
      selectedFiles.splice(index, 1);
      renderFiles();
    });
  });

}

/* =========================
   SAVE
========================= */

async function saveIncidencia(){

  clearErrors();

  const subject = $("#inc-title")?.value?.trim() || "";
  const message = $("#inc-message")?.value?.trim() || "";

  let valid = true;

  if(!subject){
    setError("#inc-title", "Introduce un asunto");
    valid = false;
  }

  if(!message){
    setError("#inc-message", "Describe el problema");
    valid = false;
  }

  if(!valid) return;

  const btn = $("#btn-save-incidencia");

  if(btn){
    btn.disabled = true;
    btn.dataset.original = btn.innerText;
    btn.innerText = "Enviando...";
  }

  try{

    const formData = new FormData();

    formData.append("subject", subject);
    formData.append("message", message);

    selectedFiles.forEach(file=>{
      formData.append("files", file);
    });

    await fetch(Onion.config.API + "/tickets", {
      method: "POST",
      body: formData
    });

    showToast("Incidencia enviada correctamente", "success");

    resetForm();

    setTimeout(()=>{
      Onion.router.navigate("/incidencias");
    }, 800);

  }catch(err){

    console.error("💥 Error creando incidencia:", err);
    showToast("Error enviando incidencia", "error");

  }finally{

    if(btn){
      btn.disabled = false;
      btn.innerText = btn.dataset.original || "Enviar incidencia";
    }

  }

}

/* =========================
   FORM HELPERS
========================= */

function resetForm(){

  ["#inc-title", "#inc-message"].forEach(sel=>{
    const el = $(sel);
    if(el) el.value = "";
  });

  selectedFiles = [];
  renderFiles();

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
   TOAST
========================= */

function showToast(message, type){

  const el = document.createElement("div");
  el.className = `toast show ${type}`;
  el.innerText = message;

  document.body.appendChild(el);

  setTimeout(()=>{
    el.classList.remove("show");
    setTimeout(()=> el.remove(), 300);
  }, 2200);

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

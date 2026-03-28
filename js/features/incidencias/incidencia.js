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
   CONFIG
========================= */

const MAX_FILES = 5;
const MAX_SIZE_MB = 10;

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
  loadUserIncidencias();

  Onion.onCleanup(()=> initialized = false);

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
  const title = $(".page-title");

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

  Onion.cleanupEvent(root, "click", (e)=>{
    if(e.target.id === "btn-back"){
      Onion.router.navigate("/incidencias");
    }
  });

  $("#btn-save-incidencia")?.addEventListener("click", saveIncidencia);

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

  for(const file of files){

    if(selectedFiles.length >= MAX_FILES){
      showToast(`Máximo ${MAX_FILES} archivos`, "error");
      break;
    }

    if(file.size > MAX_SIZE_MB * 1024 * 1024){
      showToast(`Archivo demasiado grande (${file.name})`, "error");
      continue;
    }

    selectedFiles.push(file);
  }

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
      <span>📎 ${escapeHTML(f.name)}</span>
      <button data-remove="${i}" style="background:none;border:none;color:var(--error);cursor:pointer;">✕</button>
    </div>
  `).join("");

  list.querySelectorAll("[data-remove]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      selectedFiles.splice(Number(btn.dataset.remove), 1);
      renderFiles();
    });
  });

}

/* =========================
   LOAD USER TICKETS
========================= */

async function loadUserIncidencias(){

  const container = $("#incidencias-user-list");
  if(!container) return;

  container.innerHTML = `<div style="color:var(--dim); font-size:12px;">Cargando...</div>`;

  try{

    const data = await Onion.fetch(
      Onion.config.API + "/tickets?mine=true&status=open"
    );

    if(!data || !data.length){
      container.innerHTML = `<div style="color:var(--dim); font-size:12px;">No tienes incidencias abiertas</div>`;
      return;
    }

    container.innerHTML = data.map(i => `
      <div class="history-item" data-id="${i.id}">
        <div class="history-title">${escapeHTML(i.subject || "Sin asunto")}</div>
        <div class="history-meta">
          <span>${formatEstado(i.status)}</span>
          <span>${formatFecha(i.createdAt)}</span>
        </div>
      </div>
    `).join("");

    container.querySelectorAll(".history-item").forEach(el=>{
      el.addEventListener("click", ()=>{
        Onion.router.navigate("/incidencias/detalle?id=" + el.dataset.id);
      });
    });

  }catch(err){
    console.error("💥 Error cargando incidencias:", err);
    container.innerHTML = "Error cargando incidencias";
  }

}

/* =========================
   AUTH HEADER
========================= */

function getAuthHeaders(){

  const token =
    Onion.state?.token ||
    localStorage.getItem("token") ||
    "";

  return token
    ? { Authorization: "Bearer " + token }
    : {};
}

/* =========================
   SAVE (PRO SAAS)
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

    const response = await fetch(Onion.config.API + "/tickets", {
      method: "POST",
      body: formData,
      headers: getAuthHeaders()
    });

    let data = null;

    try{
      data = await response.json();
    }catch{}

    if(!response.ok || !data?.ok){
      throw new Error("API_ERROR");
    }

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
   HELPERS
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

function formatEstado(s){
  if(s === "closed") return "Cerrada";
  if(s === "in_progress") return "En progreso";
  return "Abierta";
}

function formatFecha(f){
  if(!f) return "--";
  return new Date(f).toLocaleDateString("es-ES");
}

function escapeHTML(str){
  return String(str)
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;");
}

/* =========================
   KEYBOARD UX
========================= */

document.addEventListener("keydown", (e)=>{
  if(e.key === "Enter" && e.ctrlKey){
    if(getRoot()){
      saveIncidencia();
    }
  }
});

})();

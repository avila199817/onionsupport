"use strict";

(function(){

const Onion = window.Onion;

if(!Onion){
  console.error("💥 Onion no disponible (incidencia.js)");
  return;
}

let initialized = false;
let selectedFiles = [];
let sending = false;

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

  Onion.onCleanup(()=>{
    initialized = false;
    sending = false;
    selectedFiles = [];
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
  const title = $(".page-title");

  if(title){
    title.innerText = `Hola, ${name} 👋`;
  }

}

/* =========================
   EVENTS (ANTI DUPLICADO REAL)
========================= */

function bindEvents(){

  const root = getRoot();
  if(!root) return;

  Onion.cleanupEvent(root, "click", (e)=>{
    if(e.target.id === "btn-back"){
      Onion.router.navigate("/incidencias");
    }
  });

  const btn = $("#btn-save-incidencia");

  if(btn){
    btn.onclick = saveIncidencia; // 🔥 evita duplicados reales
  }

  const attachBtn = $("#btn-attach");
  if(attachBtn){
    attachBtn.onclick = ()=> $("#inc-files")?.click();
  }

  const fileInput = $("#inc-files");
  if(fileInput){
    fileInput.onchange = handleFiles;
  }

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
    btn.onclick = ()=>{
      selectedFiles.splice(Number(btn.dataset.remove), 1);
      renderFiles();
    };
  });

}

/* =========================
   LOAD USER TICKETS 🔥 FIX
========================= */

async function loadUserIncidencias(){

  const container = $("#incidencias-user-list");
  if(!container) return;

  container.innerHTML = `<div style="color:var(--dim); font-size:12px;">Cargando...</div>`;

  try{

    // 🔥 SIN FILTRO DE STATUS → TODAS
    const data = await Onion.fetch(
      Onion.config.API + "/tickets?mine=true"
    );

    if(!data || !data.length){
      container.innerHTML = `<div style="color:var(--dim); font-size:12px;">No tienes incidencias</div>`;
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
      el.onclick = ()=>{
        Onion.router.navigate("/incidencias/detalle?id=" + el.dataset.id);
      };
    });

  }catch(err){
    console.error("💥 Error cargando incidencias:", err);
    container.innerHTML = "Error cargando incidencias";
  }

}

/* =========================
   AUTH
========================= */

function getAuthHeaders(){

  const token = Onion.auth.getToken();

  return token
    ? { Authorization: "Bearer " + token }
    : {};
}

/* =========================
   SAVE 🔥 FIX PRO
========================= */

async function saveIncidencia(){

  if(sending) return;

  const subject = $("#inc-title")?.value?.trim() || "";
  const message = $("#inc-message")?.value?.trim() || "";

  if(!subject){
    showToast("Introduce un asunto", "error");
    return;
  }

  if(!message){
    showToast("Describe el problema", "error");
    return;
  }

  sending = true;

  const btn = $("#btn-save-incidencia");

  if(btn){
    btn.disabled = true;
    btn.innerText = "Enviando...";
  }

  try{

    const formData = new FormData();

    // 🔥 FIX CLAVE
    formData.append("subject", subject);
    formData.append("message", message);
    formData.append("description", message); // compatibilidad backend

    selectedFiles.forEach(file=>{
      formData.append("files", file);
    });

    const response = await fetch(Onion.config.API + "/tickets", {
      method: "POST",
      body: formData,
      headers: getAuthHeaders()
    });

    const data = await response.json().catch(()=>null);

    if(!response.ok){
      console.error("💥 API ERROR:", data);
      throw new Error("API_ERROR");
    }

    showToast("Incidencia enviada correctamente", "success");

    resetForm();

    // 🔥 recarga lista SIN RECARGAR VISTA
    loadUserIncidencias();

    setTimeout(()=>{
      Onion.router.navigate("/incidencias");
    }, 800);

  }catch(err){

    console.error("💥 Error creando incidencia:", err);
    showToast("Error enviando incidencia", "error");

  }finally{

    sending = false;

    if(btn){
      btn.disabled = false;
      btn.innerText = "Enviar incidencia";
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

  const fileInput = $("#inc-files");
  if(fileInput) fileInput.value = "";

  renderFiles();

}

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

function formatEstado(s){
  if(s === "closed") return "Cerrada";
  if(s === "in_progress") return "En progreso";
  if(s === "pending") return "Pendiente";
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

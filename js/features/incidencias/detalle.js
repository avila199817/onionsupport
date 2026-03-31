"use strict";

(function(){

const Onion = window.Onion;

if(!Onion){
  console.error("💥 Onion no disponible (detalle.js)");
  return;
}

let initialized = false;
let currentItem = null;
let observer = null;
let sending = false;
let selectedFiles = [];
let deleting = false;

/* 🔥 CONTROL PRO */
let currentRequestId = 0;
let currentAbort = null;


/* =========================
   INIT
========================= */
function init(){

  if(initialized) return;

  const root = getRoot();
  if(!root) return setTimeout(init, 100);
  if(!Onion.state?.user) return setTimeout(init, 100);

  initialized = true;

  bindEvents();
  loadDetalle();
  observeDOM();

}

init();


/* =========================
   ROOT
========================= */
function getRoot(){
  return document.querySelector(".panel-content.incidencia-detalle");
}

function $(selector){
  return getRoot()?.querySelector(selector);
}


/* =========================
   AUTH
========================= */
function getAuthHeaders(){
  const token = Onion.auth?.getToken?.();
  return token ? { Authorization: "Bearer " + token } : {};
}


/* =========================
   OBSERVER
========================= */
function observeDOM(){

  if(observer) return;

  observer = new MutationObserver(()=>{
    if(!getRoot()){
      initialized = false;
      setTimeout(init, 100);
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}


/* =========================
   EVENTS
========================= */
function bindEvents(){

  const root = getRoot();
  if(!root) return;

  Onion.cleanupEvent(root, "click", async (e)=>{

    const t = e.target;

    if(t.id === "btn-back"){
      Onion.router.navigate("/incidencias");
    }

    if(t.id === "btn-save"){
      if(sending) return;
      await updateTicket();
    }

    if(t.id === "btn-attach"){
      $("#inc-files")?.click();
    }

    if(t.classList.contains("file-remove")){
      const i = Number(t.dataset.index);
      selectedFiles.splice(i,1);
      renderFiles();
    }

    if(t.classList.contains("blob-download")){
      downloadBlob(t.dataset.url, t.dataset.name);
    }

    if(t.classList.contains("blob-delete")){
      if(deleting) return;
      await deleteBlob(t.dataset.url);
    }

  });

  Onion.cleanupEvent(root, "change", (e)=>{

    if(e.target.id === "inc-files"){
      selectedFiles = [...selectedFiles, ...e.target.files];
      renderFiles();
      e.target.value = "";
    }

  });
}


/* =========================
   LOAD (🔥 FIX PRO)
========================= */
async function loadDetalle(){

  const id = getId();
  if(!id) return;

  const requestId = ++currentRequestId;

  /* 🔥 cancelar anterior */
  if(currentAbort){
    currentAbort.abort();
  }

  currentAbort = new AbortController();

  clearUI();

  try{

    const res = await fetch(Onion.config.API + "/tickets/" + id, {
      headers: getAuthHeaders(),
      signal: currentAbort.signal
    });

    if(requestId !== currentRequestId) return;

    if(!res.ok) throw new Error("API ERROR");

    const json = await res.json();

    if(requestId !== currentRequestId) return;

    currentItem = json?.ticket || json;

    render(currentItem);

  }catch(err){

    if(err.name === "AbortError") return;

    console.error("💥 loadDetalle:", err);
    showToast("❌ Error cargando");
  }
}


/* =========================
   CLEAR UI (🔥 ANTI PARPADEO)
========================= */
function clearUI(){

  setText("#detalle-usuario", "--");
  setText("#detalle-userid", "--");
  setText("#detalle-id", "--");
  setText("#detalle-fecha", "--");
  setText("#detalle-fecha-cierre", "--");
  setText("#detalle-tecnico", "--");
  setText("#detalle-titulo", "--");

  const msg = $("#detalle-mensaje");
  if(msg) msg.textContent = "";

}


/* =========================
   RENDER
========================= */
function render(i){

  setText("#detalle-usuario", i?.cliente?.nombre);
  setText("#detalle-userid", i?.userId || "--");

  setText("#detalle-id", i?.id);
  setText("#detalle-fecha", formatFecha(i?.createdAt));
  setText("#detalle-fecha-cierre", formatFecha(i?.closedAt));

  const tecnico =
    typeof i?.assignedTo === "object"
      ? i?.assignedTo?.name
      : i?.assignedTo;

  setText("#detalle-tecnico", tecnico || "No asignado");

  setText("#detalle-titulo", i?.subject);

  const msg = $("#detalle-mensaje");
  if(msg){
    msg.textContent = i?.message || "";
  }

  $("#edit-estado").value = i?.status || "open";
  $("#edit-prioridad").value = i?.priority || "low";

  renderAvatar(i?.cliente?.nombre, i?.cliente?.avatar);

  const userFiles = (i?.attachments || []).filter(f => f.type !== "team");
  const teamFiles = (i?.attachments || []).filter(f => f.type === "team");

  renderBlobs("#detalle-blobs-user", userFiles, true);
  renderBlobs("#detalle-blobs-team", teamFiles, false);

}


/* =========================
   AVATAR
========================= */
function renderAvatar(nombre, avatar){

  const el = $("#detalle-avatar");
  if(!el) return;

  if(avatar){
    el.innerHTML = `<img src="${avatar}" />`;
    return;
  }

  const initials = (nombre || "U")
    .split(" ")
    .map(w => w[0])
    .slice(0,2)
    .join("")
    .toUpperCase();

  el.textContent = initials;
}


/* =========================
   FILE LIST
========================= */
function renderFiles(){

  const list = $("#file-list");
  if(!list) return;

  list.innerHTML = selectedFiles.map((f,i)=>`
    <div class="file-item">
      <span>${f.name}</span>
      <button class="file-remove" data-index="${i}">✕</button>
    </div>
  `).join("");
}


/* =========================
   BLOBS
========================= */
function renderBlobs(selector, files, allowDelete){

  const c = $(selector);
  if(!c) return;

  if(!files.length){
    c.innerHTML = `<div class="detalle-hint">Sin archivos</div>`;
    return;
  }

  c.innerHTML = files.map(f => `
    <div class="blob-item">
      <span>${f.name}</span>
      <div class="blob-actions">
        <button class="blob-download" data-url="${f.url}" data-name="${f.name}">
          Descargar
        </button>
        ${allowDelete ? `
          <button class="blob-delete" data-url="${f.url}">
            🗑️
          </button>
        ` : ""}
      </div>
    </div>
  `).join("");
}


/* =========================
   DELETE
========================= */
async function deleteBlob(url){

  if(!confirm("¿Eliminar archivo?")) return;

  try{

    const res = await fetch(Onion.config.API + "/tickets/" + currentItem.id,{
      method:"PATCH",
      headers:{
        "Content-Type":"application/json",
        ...getAuthHeaders()
      },
      body: JSON.stringify({
        deleteAttachments:[url]
      })
    });

    if(!res.ok) throw new Error();

    const json = await res.json();
    currentItem = json?.ticket || json;

    render(currentItem);

  }catch{
    showToast("❌ Error eliminando");
  }

}


/* =========================
   UPDATE
========================= */
async function updateTicket(){

  sending = true;
  setSaving(true);

  try{

    const res = await fetch(Onion.config.API + "/tickets/" + currentItem.id,{
      method:"PATCH",
      headers:{
        "Content-Type":"application/json",
        ...getAuthHeaders()
      },
      body: JSON.stringify({
        status: $("#edit-estado").value,
        priority: $("#edit-prioridad").value,
        message: $("#detalle-mensaje").innerText.trim()
      })
    });

    if(!res.ok) throw new Error();

    const json = await res.json();
    currentItem = json?.ticket || json;

    render(currentItem);

    showToast("✔ Guardado");

  }catch(err){
    console.error(err);
    showToast("❌ Error guardando");
  }

  sending = false;
  setSaving(false);
}


/* =========================
   HELPERS
========================= */
function setText(sel,val){
  const el = $(sel);
  if(el) el.textContent = val || "--";
}

function formatFecha(f){
  return f ? new Date(f).toLocaleDateString("es-ES") : "--";
}

function getId(){
  return new URLSearchParams(location.search).get("id");
}

function setSaving(active){
  const btn = $("#btn-save");
  if(btn){
    btn.disabled = active;
    btn.textContent = active ? "Guardando..." : "Guardar cambios";
  }
}

function downloadBlob(url,name){
  const a=document.createElement("a");
  a.href=url;
  a.download=name;
  a.click();
}

function showToast(msg){
  if(Onion.toast){
    Onion.toast(msg);
  }else{
    console.log(msg);
  }
}

})();

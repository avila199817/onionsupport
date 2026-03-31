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
   LOAD
========================= */
async function loadDetalle(){

  const id = getId();
  if(!id) return;

  try{

    const res = await fetch(Onion.config.API + "/tickets/" + id, {
      headers: getAuthHeaders()
    });

    if(!res.ok) throw new Error("API ERROR");

    const json = await res.json();
    currentItem = json?.ticket || json;

    render(currentItem);

  }catch(err){
    console.error("💥 loadDetalle:", err);
    showToast("❌ Error cargando");
  }
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
    msg.setAttribute("contenteditable", "true");
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
   UPDATE
========================= */
async function updateTicket(){

  sending = true;
  setSaving(true);

  try{

    let uploaded = [];

    for(const f of selectedFiles){
      const data = await uploadFile(f);
      uploaded.push(data);
    }

    const res = await fetch(Onion.config.API + "/tickets/" + currentItem.id,{
      method:"PATCH",
      headers:{
        "Content-Type":"application/json",
        ...getAuthHeaders()
      },
      body: JSON.stringify({
        status: $("#edit-estado").value,
        priority: $("#edit-prioridad").value,
        message: $("#detalle-mensaje").innerText.trim(),
        attachments: uploaded
      })
    });

    if(!res.ok) throw new Error();

    const json = await res.json();
    currentItem = json?.ticket || json;

    selectedFiles = [];
    renderFiles();
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

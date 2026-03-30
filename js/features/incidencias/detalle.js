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

/* 🔥 MULTI FILE */
let selectedFiles = [];


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
   AVATAR (FIX)
========================= */
function renderAvatar(nombre, avatar){

  const el = $("#detalle-avatar");
  if(!el) return;

  if(avatar){
    el.innerHTML = `<img src="${avatar}" />`;
    return;
  }

  const initials = nombre
    ?.split(" ")
    .map(w => w[0])
    .slice(0,2)
    .join("")
    .toUpperCase();

  el.textContent = initials || "U";
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

    if(t.id === "btn-attach-detalle"){
      $("#detalle-files")?.click();
    }

    /* 🔥 REMOVE FILE */
    if(t.classList.contains("file-remove")){
      const index = Number(t.dataset.index);
      selectedFiles.splice(index, 1);
      renderFiles();
    }

    /* 🔥 DOWNLOAD */
    if(t.classList.contains("blob-download")){
      downloadBlob(t.dataset.url, t.dataset.name);
    }

  });

  Onion.cleanupEvent(root, "change", (e)=>{

    if(e.target.id === "detalle-files"){
      selectedFiles = [...selectedFiles, ...e.target.files];
      renderFiles();
      e.target.value = "";
    }

    if(e.target.id === "edit-estado" || e.target.id === "edit-prioridad"){
      applyVisualState();
    }

  });

  const msg = $("#detalle-mensaje");

  if(msg){

    msg.addEventListener("click", ()=>{
      msg.setAttribute("contenteditable","true");
      msg.focus();
    });

    msg.addEventListener("blur", ()=>{
      msg.setAttribute("contenteditable","false");
    });

    msg.addEventListener("keydown", (e)=>{
      if(e.key === "Enter"){
        e.preventDefault();
        msg.blur();
      }
    });

  }
}


/* =========================
   LOAD
========================= */
async function loadDetalle(){

  const id = getId();
  if(!id) return setError("ID no válido");

  setLoading();

  try{

    const res = await fetch(Onion.config.API + "/tickets/" + id, {
      headers: getAuthHeaders()
    });

    const json = await res.json();
    const data = json?.ticket || json;

    if(!data){
      setEmpty();
      return;
    }

    currentItem = data;
    render(data);

  }catch(err){
    console.error(err);
    setError("Error cargando incidencia");
  }finally{
    clearLoading();
  }
}


/* =========================
   UPLOAD
========================= */
async function uploadFile(file){

  const res = await fetch(Onion.config.API + "/uploads/upload-url", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders()
    },
    body: JSON.stringify({
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size
    })
  });

  const { uploadUrl, blobUrl } = await res.json();

  await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "x-ms-blob-type": "BlockBlob",
      "Content-Type": file.type
    },
    body: file
  });

  return { name: file.name, url: blobUrl };
}


/* =========================
   UPDATE
========================= */
async function updateTicket(){

  if(sending) return;
  sending = true;

  try{

    setSaving(true);

    let uploaded = [];

    for(const f of selectedFiles){
      const data = await uploadFile(f);
      uploaded.push(data);
    }

    const res = await fetch(Onion.config.API + "/tickets/" + currentItem.id, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders()
      },
      body: JSON.stringify({
        status: $("#edit-estado")?.value,
        priority: $("#edit-prioridad")?.value,
        message: $("#detalle-mensaje")?.innerText,
        attachments: uploaded
      })
    });

    const json = await res.json();
    const data = json?.ticket || json;

    if(data){
      currentItem = data;
      render(data);
    }

    selectedFiles = [];
    renderFiles();

    showToast("Cambios guardados", "success");

  }catch(err){
    console.error(err);
    showToast("Error", "error");
  }

  setSaving(false);
  sending = false;
}


/* =========================
   RENDER
========================= */
function render(i){

  const nombre = i.cliente?.nombre || "Usuario";

  setText("#detalle-usuario", nombre);
  setText("#detalle-id", i.id);
  setText("#detalle-titulo", i.subject || "Sin título");
  setText("#detalle-fecha", formatFecha(i.createdAt));

  $("#detalle-mensaje").textContent = i.message || "";

  setSelectValue($("#edit-estado"), i.status || "open");
  setSelectValue($("#edit-prioridad"), i.priority || "low");

  renderAvatar(nombre, i.cliente?.avatar);
  renderBlobs(i.attachments || []);

  applyVisualState();
}


/* =========================
   FILE LIST
========================= */
function renderFiles(){

  const list = $("#detalle-file-list");
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
function renderBlobs(files){

  const c = $("#detalle-blobs");
  if(!c) return;

  if(!files.length){
    c.innerHTML = `<div class="detalle-hint">Sin archivos</div>`;
    return;
  }

  c.innerHTML = files.map(f => `
    <div class="blob-item">
      <span>${f.name}</span>
      <button class="blob-download" data-url="${f.url}" data-name="${f.name}">
        Descargar
      </button>
    </div>
  `).join("");
}


/* =========================
   DOWNLOAD
========================= */
function downloadBlob(url, name){
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}


/* =========================
   HELPERS
========================= */
function setText(sel, val){
  const el = $(sel);
  if(el) el.textContent = val ?? "--";
}

function formatFecha(f){
  return f ? new Date(f).toLocaleDateString("es-ES") : "--";
}

function getId(){
  return new URLSearchParams(location.search).get("id");
}

function setSelectValue(select, value){
  if(!select) return;
  select.value = value;
}


/* =========================
   STATES
========================= */
function setLoading(){
  const el = $("#detalle-content");
  if(el){
    el.style.opacity = "0.4";
    el.style.pointerEvents = "none";
  }
}

function clearLoading(){
  const el = $("#detalle-content");
  if(el){
    el.style.opacity = "1";
    el.style.pointerEvents = "auto";
  }
}

function setEmpty(){
  $("#detalle-content").innerHTML = `<div>No encontrada</div>`;
}

function setError(msg){
  $("#detalle-content").innerHTML = `<div>${msg}</div>`;
}

function setSaving(active){
  const btn = $("#btn-save");
  if(btn){
    btn.disabled = active;
    btn.textContent = active ? "Guardando..." : "Guardar cambios";
  }
}


/* =========================
   VISUAL STATE
========================= */
function applyVisualState(){
  const root = getRoot();
  if(!root) return;

  root.dataset.estado = $("#edit-estado")?.value;
  root.dataset.prioridad = $("#edit-prioridad")?.value;
}


/* =========================
   TOAST
========================= */
function showToast(message){
  console.log(message);
}

})();

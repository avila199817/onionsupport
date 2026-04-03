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


/* =========================
   INIT
========================= */
function init(){

  if(initialized) return;

  const root = getRoot();

  if(!root) return setTimeout(init, 100);
  if(!Onion.state?.user) return setTimeout(init, 100);

  initialized = true;

  setLoading(true);

  bindEvents();
  loadDetalle();
  observeDOM();
}

init();


/* =========================
   ROOT
========================= */
function getRoot(){
  return document.querySelector(".panel-view.incidencia-detalle");
}

function $(selector){
  return getRoot()?.querySelector(selector);
}


/* =========================
   LOADER CONTROL 🔥
========================= */
function setLoading(active){
  const root = getRoot();
  if(!root) return;

  if(active){
    root.classList.add("loading");
    root.classList.remove("ready");
  }else{
    root.classList.remove("loading");
    root.classList.add("ready");
  }
}


/* =========================
   AUTH
========================= */
function getAuthHeaders(){
  const token = Onion.auth?.getToken?.();
  return token ? { Authorization: "Bearer " + token } : {};
}


/* =========================
   OBSERVER (SPA SAFE)
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
   AVATAR
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
      const index = Number(t.dataset.index);
      selectedFiles.splice(index, 1);
      renderFiles();
    }

    if(t.classList.contains("blob-download")){
      downloadBlob(t.dataset.url, t.dataset.name);
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
  if(!id){
    setLoading(false);
    return;
  }

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
    showToast("❌ Error cargando incidencia");
  }

  setLoading(false);
}


/* =========================
   UPLOAD (SAS)
========================= */
function uploadFile(file){

  return new Promise(async (resolve, reject)=>{

    try{

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

      if(!res.ok) return reject("SAS ERROR");

      const { uploadUrl, blobUrl } = await res.json();

      const xhr = new XMLHttpRequest();

      xhr.open("PUT", uploadUrl, true);
      xhr.setRequestHeader("x-ms-blob-type", "BlockBlob");
      xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");

      xhr.onload = ()=>{
        if(xhr.status >= 200 && xhr.status < 300){
          resolve({ name: file.name, url: blobUrl });
        }else{
          reject("UPLOAD FAILED");
        }
      };

      xhr.onerror = ()=> reject("XHR ERROR");

      xhr.send(file);

    }catch(err){
      reject(err);
    }

  });
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

    if(!res.ok) throw new Error("UPDATE ERROR");

    const json = await res.json();
    currentItem = json?.ticket || json;

    render(currentItem);

    selectedFiles = [];
    renderFiles();

    showToast("✔ Guardado");

  }catch(err){
    console.error("💥 updateTicket:", err);
    showToast("❌ Error");
  }

  setSaving(false);
  sending = false;
}


/* =========================
   RENDER
========================= */
function render(i){

  if(!i) return;

  setText("#detalle-usuario", i?.cliente?.nombre);
  setText("#detalle-id", i?.id);
  setText("#detalle-titulo", i?.subject);
  setText("#detalle-fecha", formatFecha(i?.createdAt));

  const msg = $("#detalle-mensaje");
  if(msg) msg.textContent = i?.message || "";

  renderAvatar(i?.cliente?.nombre, i?.cliente?.avatar);
  renderBlobs(i?.attachments || []);
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
function renderBlobs(files){

  const user = $("#detalle-blobs-user");
  const team = $("#detalle-blobs-team");

  if(user){
    user.innerHTML = files.map(f => `
      <div class="blob-item">
        <span>${f.name}</span>
        <button class="blob-download" data-url="${f.url}" data-name="${f.name}">
          Descargar
        </button>
      </div>
    `).join("") || `<div class="detalle-hint">Sin archivos</div>`;
  }

  if(team){
    team.innerHTML = "";
  }
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

function showToast(msg){
  console.log(msg);
}

})();

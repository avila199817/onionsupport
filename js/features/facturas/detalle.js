"use strict";

(function(){

const Onion = window.Onion;

if(!Onion){
  console.error("💥 Onion no disponible (factura detalle)");
  return;
}

let initialized = false;
let factura = null;

/* =========================
   ROOT
========================= */

function getRoot(){
  return document.querySelector(".panel-content.factura-detalle");
}

function $(selector){
  const root = getRoot();
  return root ? root.querySelector(selector) : null;
}

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

  const id = getIdFromURL();
  if(!id){
    console.error("❌ ID no encontrado");
    return;
  }

  bindEvents();
  loadFactura(id);

  Onion.onCleanup(()=>{
    initialized = false;
    factura = null;
  });

}

init();

/* =========================
   GET ID
========================= */

function getIdFromURL(){
  const params = new URLSearchParams(window.location.search);
  return params.get("id");
}

/* =========================
   EVENTS
========================= */

function bindEvents(){

  $("#btn-back")?.addEventListener("click", ()=>{
    Onion.router.navigate("/facturas");
  });

  $("#btn-save")?.addEventListener("click", saveFactura);

  $("#btn-attach-detalle")?.addEventListener("click", ()=>{
    $("#detalle-files")?.click();
  });

  $("#detalle-files")?.addEventListener("change", handleFiles);

}

/* =========================
   LOAD
========================= */

async function loadFactura(id){

  try{

    const res = await Onion.fetch(Onion.config.API + "/facturas/" + id);
    factura = res?.factura || res?.data || res;

    if(!factura){
      console.error("❌ Factura no encontrada");
      return;
    }

    render();

  }catch(e){
    console.error("💥 ERROR FACTURA DETALLE:", e);
  }

}

/* =========================
   RENDER
========================= */

function render(){

  if(!factura) return;

  const cliente = factura.cliente || {};

  /* =========================
     HEADER USER
  ========================= */

  const nombre = cliente.nombre || "Cliente";

  $("#detalle-cliente").textContent = nombre;
  $("#detalle-cliente-id").textContent = cliente.id || "";

  renderAvatar(cliente);

  /* =========================
     CORE
  ========================= */

  $("#detalle-id").textContent = factura.numero || factura.id || "--";

  $("#detalle-fecha").textContent = formatFecha(factura.fecha);
  $("#detalle-vencimiento").textContent = formatFecha(factura.fechaServicio);

  $("#detalle-metodo").textContent = factura.formaPago || "-";
  $("#detalle-total").textContent = formatMoney(factura.total);

  $("#detalle-concepto").textContent = factura.concepto || "-";
  $("#detalle-descripcion").textContent = factura.descripcion || "";

  /* =========================
     SELECTS
  ========================= */

  $("#edit-estado").value = mapEstado(factura.estadoPago);
  $("#edit-iva").value = getIVA(factura);

  /* =========================
     FILES (BLOB)
  ========================= */

  renderFilesFromBlob();
  renderSidebar();

}

/* =========================
   AVATAR
========================= */

function renderAvatar(cliente){

  const el = $("#detalle-avatar");
  if(!el) return;

  if(cliente.avatar){
    el.innerHTML = `<img src="${cliente.avatar}" alt="${escapeHTML(cliente.nombre)}" />`;
    return;
  }

  el.innerHTML = `<div class="avatar-fallback">${getInitials(cliente.nombre)}</div>`;

}

/* =========================
   FILES (LOCAL MOCK)
========================= */

function renderFiles(files){

  const list = $("#detalle-file-list");
  if(!list) return;

  list.innerHTML = (files || []).map(f=>`
    <div class="file-item">
      <span>${escapeHTML(f.nombre)}</span>
      <button class="file-remove" onclick="removeFile('${f.id}')">✕</button>
    </div>
  `).join("");

}

window.removeFile = function(id){
  factura.archivos = (factura.archivos || []).filter(f=>f.id !== id);
  renderFiles(factura.archivos);
};

/* =========================
   BLOB REAL (PDF)
========================= */

function renderFilesFromBlob(){

  const list = $("#detalle-file-list");
  if(!list) return;

  if(!factura.blobPath){
    list.innerHTML = `<span class="detalle-hint">Sin archivos</span>`;
    return;
  }

  list.innerHTML = `
    <div class="file-item">
      <span>Factura PDF</span>
      <button class="file-remove" onclick="window.open('${Onion.config.API}/facturas/${factura.id}/descargar','_blank')">
        Ver
      </button>
    </div>
  `;

}

/* =========================
   SIDEBAR
========================= */

function renderSidebar(){

  const docs = $("#detalle-blobs-docs");

  if(!docs) return;

  if(!factura.blobPath){
    docs.innerHTML = `<span class="detalle-hint">Sin documentos</span>`;
    return;
  }

  docs.innerHTML = `
    <div class="blob-item">
      <span>Factura PDF</span>
      <div class="blob-actions">
        <button class="blob-download"
          onclick="window.open('${Onion.config.API}/facturas/${factura.id}/descargar','_blank')">
          Descargar
        </button>
      </div>
    </div>
  `;

}

/* =========================
   SAVE
========================= */

async function saveFactura(){

  try{

    const payload = {
      estadoPago: $("#edit-estado").value,
      descripcion: $("#detalle-descripcion").textContent
    };

    await Onion.fetch(Onion.config.API + "/facturas/" + factura.id, {
      method:"PUT",
      body: JSON.stringify(payload)
    });

    toast("Factura actualizada");

  }catch(e){
    console.error(e);
    toast("Error al guardar");
  }

}

/* =========================
   FILE UPLOAD MOCK
========================= */

function handleFiles(e){

  const files = Array.from(e.target.files);

  factura.archivos = factura.archivos || [];

  files.forEach(file=>{
    factura.archivos.push({
      id: Date.now() + file.name,
      nombre: file.name,
      file
    });
  });

  renderFiles(factura.archivos);

}

/* =========================
   HELPERS
========================= */

function mapEstado(e){
  e = (e || "").toLowerCase();
  if(e === "pagada") return "paid";
  if(e === "cancelada") return "cancelled";
  return "pending";
}

function getIVA(f){
  return f.impuestos?.[0]?.porcentaje || "21";
}

function formatFecha(f){
  if(!f) return "--";
  return new Date(f).toLocaleDateString("es-ES");
}

function formatMoney(n){
  return Number(n || 0).toLocaleString("es-ES", {
    minimumFractionDigits:2,
    maximumFractionDigits:2
  }) + " €";
}

function getInitials(name){
  if(!name) return "?";
  return name.split(" ").map(n=>n[0]).join("").slice(0,2).toUpperCase();
}

function escapeHTML(str){
  return String(str)
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;");
}

/* =========================
   TOAST
========================= */

function toast(msg){

  let c = document.getElementById("toast-container");

  if(!c){
    c = document.createElement("div");
    c.id = "toast-container";
    document.body.appendChild(c);
  }

  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;

  c.appendChild(el);

  requestAnimationFrame(()=> el.classList.add("show"));

  setTimeout(()=>{
    el.classList.remove("show");
    setTimeout(()=> el.remove(), 300);
  },2000);

}

})();

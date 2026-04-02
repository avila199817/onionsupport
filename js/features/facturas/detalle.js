"use strict";

(function(){

const Onion = window.Onion;

if(!Onion){
  console.error("💥 Onion no disponible (factura detalle)");
  return;
}

let initialized = false;
let factura = null;

/* 🔥 CONTROL PRO */
let currentRequestId = 0;
let currentAbort = null;

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
   LOADER
========================= */

function setLoading(active){
  const root = getRoot();
  if(!root) return;

  if(active) root.classList.add("loading");
  else root.classList.remove("loading");
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

    if(currentAbort) currentAbort.abort();
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

  const root = getRoot();
  if(!root) return;

  Onion.cleanupEvent(root, "click", (e)=>{

    const t = e.target;

    if(t.id === "btn-back"){
      Onion.router.navigate("/facturas");
    }

    if(t.id === "btn-ver-factura"){
      openFactura();
    }

    if(t.id === "btn-descargar-factura"){
      downloadFactura();
    }

    if(t.id === "btn-ver-doc"){
      openFactura();
    }

    if(t.id === "btn-descargar-doc"){
      downloadFactura();
    }

  });

}

/* =========================
   LOAD (🔥 PRO)
========================= */

async function loadFactura(id){

  const requestId = ++currentRequestId;

  if(currentAbort) currentAbort.abort();
  currentAbort = new AbortController();

  setLoading(true);

  try{

    const res = await fetch(Onion.config.API + "/facturas/" + id, {
      headers: {
        Authorization: "Bearer " + Onion.auth.getToken()
      },
      signal: currentAbort.signal
    });

    if(requestId !== currentRequestId) return;

    if(!res.ok){

      if(res.status === 403 || res.status === 404){
        showNotFound();
        return;
      }

      throw new Error("Error inesperado");
    }

    const json = await res.json();

    if(requestId !== currentRequestId) return;

    factura = normalizeFactura(json?.factura || json?.data || json);

    if(!factura){
      showNotFound();
      return;
    }

    render();

  }catch(e){

    if(e.name === "AbortError") return;

    console.error("💥 ERROR FACTURA DETALLE:", e);
    showNotFound();

  }finally{

    if(requestId === currentRequestId){
      setLoading(false);
    }

  }

}

/* =========================
   ERROR UI
========================= */

function showNotFound(){

  const root = getRoot();
  if(!root) return;

  root.innerHTML = `
    <div class="error-saas">
      <div class="error-icon">🔒</div>

      <h2>Factura no encontrada</h2>
      <p>No existe o no tienes acceso a este recurso.</p>

      <div class="error-actions">
        <button id="btn-back">← Volver</button>
      </div>
    </div>
  `;
}

/* =========================
   NORMALIZE
========================= */

function normalizeFactura(f){

  if(!f) return null;

  return {
    id: f.id,
    numeroLegal: f.numeroFacturaLegal || f.numero || f.id,
    incidenciaId: f.incidenciaId || f.incidencia_id || null,

    fecha: f.fecha,
    fechaServicio: f.fechaServicio || f.fecha_vencimiento,

    formaPago: f.formaPago || f.metodoPago,

    total: f.total,

    concepto: f.concepto,
    descripcion: f.descripcion,

    estadoPago: (f.estadoPago || f.estado || "pendiente").toLowerCase(),

    iva: f.impuestos?.[0]?.porcentaje || f.iva || 21,
    irpf: f.irpf,

    blobPath: f.blobPath || f.archivo || null,

    cliente: {
      id: f.cliente?.id || f.clienteId,
      nombre: f.cliente?.nombre || f.nombreCliente,
      avatar: f.cliente?.avatar,
      tipo: f.cliente?.tipo,
      empresa: f.cliente?.empresa
    }
  };

}

/* =========================
   RENDER
========================= */

function render(){

  if(!factura) return;

  const cliente = factura.cliente || {};

  $("#detalle-cliente").textContent = escapeHTML(cliente.nombre || "Cliente");
  $("#detalle-cliente-id").textContent = cliente.id || "";

  renderAvatar(cliente);

  $("#detalle-numero-legal").textContent = cleanNumero(factura.numeroLegal);

  $("#detalle-id").textContent = factura.id || "--";
  $("#detalle-incidencia-id").textContent = factura.incidenciaId || "--";

  $("#detalle-fecha").textContent = formatFecha(factura.fecha);
  $("#detalle-vencimiento").textContent = formatFecha(factura.fechaServicio);

  $("#detalle-metodo").textContent = capitalize(factura.formaPago);
  $("#detalle-total").textContent = formatMoney(factura.total);

  $("#detalle-concepto").textContent = factura.concepto || "-";
  $("#detalle-descripcion").textContent = factura.descripcion || "-";

  const estadoEl = $("#detalle-estado");
  if(estadoEl){
    estadoEl.textContent = formatEstado(factura.estadoPago);
    estadoEl.dataset.estado = factura.estadoPago;
  }

  $("#detalle-iva").textContent = factura.iva + "%";

  const irpfContainer = $("#detalle-irpf-container");

  if(isEmpresa(cliente) && factura.irpf){
    irpfContainer.style.display = "block";
    $("#detalle-irpf").textContent = factura.irpf + "%";
  }else{
    irpfContainer.style.display = "none";
  }

  renderSidebar();

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

  const nombreArchivo = cleanNumero(factura.numeroLegal) + ".pdf";

  docs.innerHTML = `
    <div class="blob-item">
      <span title="${nombreArchivo}">${nombreArchivo}</span>
      <div class="blob-actions">
        <button id="btn-ver-doc">Ver</button>
        <button id="btn-descargar-doc">Descargar</button>
      </div>
    </div>
  `;

}

/* =========================
   ACTIONS
========================= */

function openFactura(){
  if(!factura?.id) return;
  window.open(`${Onion.config.API}/facturas/${factura.id}/ver`, "_blank");
}

function downloadFactura(){
  if(!factura?.id) return;
  window.open(`${Onion.config.API}/facturas/${factura.id}/descargar`, "_blank");
}

/* =========================
   HELPERS
========================= */

function cleanNumero(num){
  if(!num) return "--";
  return String(num).replace(/^FAC-/i,"").replace(/-.*/,"");
}

function capitalize(str){
  if(!str) return "-";
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

function formatEstado(e){
  if(!e) return "Pendiente";
  if(e === "pagada") return "Pagada";
  if(e === "cancelada") return "Cancelada";
  return "Pendiente";
}

function isEmpresa(cliente){
  return cliente.tipo === "empresa" || cliente.empresa === true;
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

})();

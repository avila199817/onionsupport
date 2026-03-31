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

  $("#btn-ver-factura")?.addEventListener("click", openFactura);
  $("#btn-descargar-factura")?.addEventListener("click", downloadFactura);

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
     HEADER
  ========================= */

  const nombre = cliente.nombre || "Cliente";

  $("#detalle-cliente").textContent = nombre;
  $("#detalle-cliente-id").textContent = cliente.id || "";

  renderAvatar(cliente);

  /* =========================
     CORE
  ========================= */

  $("#detalle-numero-legal").textContent = factura.numeroFacturaLegal || factura.numero || "--";

  $("#detalle-id").textContent = factura.id || "--";

  $("#detalle-incidencia-id").textContent = factura.incidenciaId || "--";

  $("#detalle-fecha").textContent = formatFecha(factura.fecha);
  $("#detalle-vencimiento").textContent = formatFecha(factura.fechaServicio);

  $("#detalle-metodo").textContent = capitalize(factura.formaPago);
  $("#detalle-total").textContent = formatMoney(factura.total);

  $("#detalle-concepto").textContent = factura.concepto || "-";
  $("#detalle-descripcion").textContent = factura.descripcion || "-";

  $("#detalle-estado").textContent = formatEstado(factura.estadoPago);
  $("#detalle-iva").textContent = getIVA(factura) + "%";

  /* =========================
     IRPF (EMPRESA)
  ========================= */

  const irpfContainer = $("#detalle-irpf-container");

  if(isEmpresa(cliente) && factura.irpf){

    irpfContainer.style.display = "block";
    $("#detalle-irpf").textContent = factura.irpf + "%";

  }else{
    irpfContainer.style.display = "none";
  }

  /* =========================
     SIDEBAR
  ========================= */

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
        <button onclick="window.open('${Onion.config.API}/facturas/${factura.id}/ver','_blank')">
          Ver
        </button>
        <button onclick="window.open('${Onion.config.API}/facturas/${factura.id}/descargar','_blank')">
          Descargar
        </button>
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

function capitalize(str){
  if(!str) return "-";
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

function formatEstado(e){
  e = (e || "").toLowerCase();

  if(e === "pagada") return "Pagada";
  if(e === "cancelada") return "Cancelada";
  return "Pendiente";
}

function getIVA(f){
  return f.impuestos?.[0]?.porcentaje || "21";
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

})();

"use strict";

(function(){

const Onion = window.Onion;

if(!Onion){
  console.error("💥 Onion no disponible (factura detalle)");
  return;
}

let initialized = false;
let factura = null;
let currentAbort = null;

/* ========================= ROOT ========================= */

function getRoot(){
  return document.querySelector(".panel-content.factura-detalle");
}

function $(selector){
  const root = getRoot();
  return root ? root.querySelector(selector) : null;
}

/* ========================= INIT ========================= */

function init(){

  const root = getRoot();
  if(!root || initialized) return;

  if(!Onion.state?.user){
    return setTimeout(init, 100);
  }

  initialized = true;

  const id = new URLSearchParams(window.location.search).get("id");
  if(!id) return;

  bindEvents();
  loadFactura(id);

  Onion.onCleanup(()=>{
    initialized = false;
    factura = null;
    if(currentAbort) currentAbort.abort();
  });

}

init();

/* ========================= EVENTS ========================= */

function bindEvents(){

  const root = getRoot();
  if(!root) return;

  Onion.cleanupEvent(root, "click", (e)=>{

    const t = e.target;

    if(t.id === "btn-back"){
      Onion.router.navigate("/facturas");
    }

    if(t.id === "btn-descargar-doc"){
      downloadFactura();
    }

    if(t.id === "btn-enviar-doc"){
      sendFactura();
    }

  });

}

/* ========================= LOAD ========================= */

async function loadFactura(id){

  if(currentAbort) currentAbort.abort();
  currentAbort = new AbortController();

  try{

    const res = await fetch(Onion.config.API + "/facturas/" + id, {
      headers: {
        Authorization: "Bearer " + Onion.auth.getToken()
      },
      signal: currentAbort.signal
    });

    const json = await res.json();

    factura = normalizeFactura(json?.factura || json);

    render();

  }catch(e){
    console.error("💥 ERROR:", e);
  }

}

/* ========================= NORMALIZE ========================= */

function normalizeFactura(f){

  return {
    id: f.id,
    numeroLegal: f.numero || f.id,
    incidenciaId: f.incidenciaId || null,

    fecha: f.fecha,
    fechaServicio: f.fechaServicio,

    formaPago: f.formaPago,
    total: Number(f.total || 0),

    concepto: f.concepto,
    descripcion: f.descripcion,

    estadoPago: (f.estadoPago || "pendiente").toLowerCase(),

    iva: f.impuestos?.[0]?.porcentaje || 21,
    irpf: Number(f.irpf || 0),

    blobPath: f.blobPath,

    cliente: {
      id: f.cliente?.id,
      nombre: f.cliente?.nombre || "Cliente"
    }
  };

}

/* ========================= RENDER ========================= */

function render(){

  const c = factura.cliente;

  $("#detalle-cliente").textContent = c.nombre;
  $("#detalle-cliente-id").textContent = c.id || "";

  $("#detalle-numero-legal").textContent = factura.numeroLegal;
  $("#detalle-id").textContent = factura.id || "--";

  $("#detalle-fecha").textContent = formatFecha(factura.fecha);
  $("#detalle-vencimiento").textContent = formatFecha(factura.fechaServicio);

  /* 🔥 MÉTODO SOLO SI PAGADA */
  const metodoEl = $("#detalle-metodo");
  if(factura.estadoPago === "pagada"){
    metodoEl.textContent = factura.formaPago || "-";
  }else{
    metodoEl.textContent = "-";
  }

  $("#detalle-total").textContent = formatMoney(factura.total);

  $("#detalle-concepto").textContent = factura.concepto || "-";
  $("#detalle-descripcion").textContent = factura.descripcion || "-";

  /* 🔥 BADGE ESTADO */
  const estadoEl = $("#detalle-estado");
  estadoEl.className = "badge " + (factura.estadoPago === "pagada" ? "success" : "warning");
  estadoEl.textContent = factura.estadoPago === "pagada" ? "Pagada" : "Pendiente";

  /* 🔥 IVA CORRECTO (base real) */
  const base = factura.total / (1 + factura.iva/100);
  const ivaImporte = factura.total - base;

  $("#detalle-iva").textContent =
    `${factura.iva}% · ${formatMoney(ivaImporte)}`;

  /* 🔥 IRPF */
  const irpfContainer = $("#detalle-irpf-container");

  if(factura.irpf){
    const irpfImporte = base * (factura.irpf / 100);

    irpfContainer.style.display = "block";
    $("#detalle-irpf").textContent =
      `${factura.irpf}% · -${formatMoney(irpfImporte)}`;
  }else{
    irpfContainer.style.display = "none";
  }

  renderSidebar();

}

/* ========================= SIDEBAR ========================= */

function renderSidebar(){

  const docs = $("#detalle-blobs-docs");
  if(!docs) return;

  if(!factura.blobPath){
    docs.innerHTML = `<span>Sin documentos</span>`;
    return;
  }

  const nombre = factura.numeroLegal + ".pdf";

  docs.innerHTML = `
    <div class="blob-item">
      <span>${nombre}</span>
      <div class="blob-actions">
        <button id="btn-enviar-doc" title="Enviar">📧</button>
        <button id="btn-descargar-doc">Descargar</button>
      </div>
    </div>
  `;

}

/* ========================= ACTIONS ========================= */

async function getURL(){

  const res = await fetch(
    `${Onion.config.API}/facturas/${factura.id}/descargar`,
    {
      headers: {
        Authorization: "Bearer " + Onion.auth.getToken()
      }
    }
  );

  const data = await res.json();
  return data.url;
}

async function downloadFactura(){

  const url = await getURL();

  const a = document.createElement("a");
  a.href = url;
  a.download = `${factura.numeroLegal}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

async function sendFactura(){

  try{
    const res = await fetch(
      `${Onion.config.API}/facturas/${factura.id}/enviar`,
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + Onion.auth.getToken()
        }
      }
    );

    const data = await res.json();

    if(!data.ok) throw new Error();

    alert("📧 Enviado");

  }catch(e){
    alert("Error enviando");
  }

}

/* ========================= HELPERS ========================= */

function formatFecha(f){
  if(!f) return "--";
  return new Date(f).toLocaleDateString("es-ES");
}

function formatMoney(n){
  return Number(n).toLocaleString("es-ES",{minimumFractionDigits:2})+" €";
}

})();

"use strict";

(function(){

const Onion = window.Onion;

if(!Onion){
  console.error("💥 Onion no disponible (factura detalle)");
  return;
}

let initialized = false;
let factura = null;

let currentRequestId = 0;
let currentAbort = null;

/* ========================= ROOT ========================= */

function getRoot(){
  return document.querySelector(".panel-content.factura-detalle");
}

function $(selector){
  const root = getRoot();
  return root ? root.querySelector(selector) : null;
}

/* ========================= LOADER ========================= */

function setLoading(active){
  const root = getRoot();
  if(!root) return;
  root.classList.toggle("loading", active);
}

/* ========================= INIT ========================= */

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

/* ========================= GET ID ========================= */

function getIdFromURL(){
  return new URLSearchParams(window.location.search).get("id");
}

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
      throw new Error("Error factura");
    }

    const json = await res.json();

    factura = normalizeFactura(json?.factura || json);

    render();

  }catch(e){

    if(e.name === "AbortError") return;

    console.error("💥 ERROR:", e);

  }finally{

    if(requestId === currentRequestId){
      setLoading(false);
    }

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

    blobPath: f.blobPath || null,

    cliente: {
      id: f.cliente?.id || null,
      nombre: f.cliente?.nombre || "Cliente",
      avatar: f.cliente?.avatar || null,
      empresa: f.cliente?.empresa || null
    }
  };

}

/* ========================= RENDER ========================= */

function render(){

  if(!factura) return;

  const c = factura.cliente;

  $("#detalle-cliente").textContent = c.nombre;
  $("#detalle-cliente-id").textContent = c.id || "";

  renderAvatar(c);

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
  }

  /* 🔥 IVA CALCULADO */
  const ivaImporte = factura.total * (factura.iva / 100);
  $("#detalle-iva").textContent =
    `${factura.iva}% · ${formatMoney(ivaImporte)}`;

  /* 🔥 IRPF CALCULADO */
  const irpfContainer = $("#detalle-irpf-container");

  if(factura.irpf){
    const irpfImporte = factura.total * (factura.irpf / 100);

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
      <span title="${nombre}">${nombre}</span>
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
  a.download = `factura-${factura.numeroLegal}.pdf`;
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

    alert("📧 Factura enviada correctamente");

  }catch(e){
    alert("Error enviando factura");
  }

}

/* ========================= HELPERS ========================= */

function cleanNumero(num){
  if(!num) return "--";
  return String(num).replace(/^FAC-/i,"").replace(/-.*/,"");
}

function capitalize(str){
  if(!str) return "-";
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

function formatEstado(e){
  if(e === "pagada") return "Pagada";
  if(e === "cancelada") return "Cancelada";
  return "Pendiente";
}

function formatFecha(f){
  if(!f) return "--";
  return new Date(f).toLocaleDateString("es-ES");
}

function formatMoney(n){
  return Number(n).toLocaleString("es-ES", {
    minimumFractionDigits:2
  }) + " €";
}

function getInitials(name){
  if(!name) return "?";
  return name.split(" ").map(n=>n[0]).join("").slice(0,2).toUpperCase();
}

function renderAvatar(cliente){

  const el = $("#detalle-avatar");
  if(!el) return;

  if(cliente.avatar){
    el.innerHTML = `<img src="${cliente.avatar}" />`;
  }else{
    el.innerHTML = `<div class="avatar-fallback">${getInitials(cliente.nombre)}</div>`;
  }

}

})();

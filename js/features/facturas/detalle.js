"use strict";

(function(){

const Onion = window.Onion;

if(!Onion){
  console.error("💥 Onion no disponible");
  return;
}

let initialized = false;
let factura = null;

/* ========================= ROOT ========================= */

function getRoot(){
  return document.querySelector(".panel-content.factura-detalle");
}

function $(s){
  return getRoot()?.querySelector(s);
}

/* ========================= INIT ========================= */

function init(){

  const root = getRoot();
  if(!root || initialized) return;

  if(!Onion.state?.user){
    return setTimeout(init,100);
  }

  initialized = true;

  bindEvents();
  loadFactura(getId());

}

init();

/* ========================= ID ========================= */

function getId(){
  return new URLSearchParams(location.search).get("id");
}

/* ========================= EVENTS ========================= */

function bindEvents(){

  const root = getRoot();
  if(!root) return;

  Onion.cleanupEvent(root,"click",(e)=>{

    const t = e.target;

    if(t.id === "btn-back"){
      Onion.router.navigate("/facturas");
    }

    if(t.id === "btn-descargar-factura"){
      downloadFactura();
    }

    if(t.id === "btn-enviar-factura"){
      sendFactura();
    }

  });

}

/* ========================= LOAD ========================= */

async function loadFactura(id){

  try{

    const res = await fetch(
      Onion.config.API + "/facturas/" + id,
      {
        headers:{
          Authorization: "Bearer " + Onion.auth.getToken()
        }
      }
    );

    const json = await res.json();

    factura = json?.factura || json;

    render();

  }catch(e){
    console.error("💥 ERROR LOAD:", e);
  }

}

/* ========================= RENDER ========================= */

function render(){

  if(!factura) return;

  const c = factura.cliente || {};

  /* ========================= CLIENTE ========================= */

  $("#detalle-cliente").textContent = c.nombre || "Cliente";
  $("#detalle-cliente-id").textContent = c.id || "";

  renderAvatar(c);

  /* ========================= DATA ========================= */

  $("#detalle-numero-legal").textContent = factura.numero;
  $("#detalle-id").textContent = factura.id || "--";
  $("#detalle-incidencia-id").textContent = factura.incidenciaId || "--";

  $("#detalle-fecha").textContent = formatFecha(factura.fecha);
  $("#detalle-vencimiento").textContent = formatFecha(factura.fechaServicio);

  /* 🔥 método solo si pagada */
  $("#detalle-metodo").textContent =
    factura.estadoPago === "pagada"
      ? (factura.formaPago || "-")
      : "-";

  $("#detalle-total").textContent = formatMoney(factura.total);

  $("#detalle-concepto").textContent = factura.concepto || "-";
  $("#detalle-descripcion").textContent = factura.descripcion || "-";

  /* ========================= ESTADO BADGE ========================= */

  const estadoEl = $("#detalle-estado");

  estadoEl.className =
    "detalle-value badge " +
    (factura.estadoPago === "pagada" ? "success" : "warning");

  estadoEl.textContent =
    factura.estadoPago === "pagada" ? "Pagada" : "Pendiente";

  /* ========================= CALCULOS REALES ========================= */

  const ivaPct = factura.impuestos?.[0]?.porcentaje || 21;
  const irpfPct = factura.irpf || 0;

  const base = factura.total / (1 + ivaPct/100 - irpfPct/100);

  const ivaImporte = base * (ivaPct/100);
  const irpfImporte = base * (irpfPct/100);

  $("#detalle-iva").textContent =
    `${ivaPct}% · ${formatMoney(ivaImporte)}`;

  /* ========================= IRPF ========================= */

  const irpfContainer = $("#detalle-irpf-container");

  if(irpfPct){
    irpfContainer.style.display = "block";
    $("#detalle-irpf").textContent =
      `${irpfPct}% · -${formatMoney(irpfImporte)}`;
  }else{
    irpfContainer.style.display = "none";
  }

  /* ========================= SIDEBAR NOMBRE PDF ========================= */

  const blobNameEl = document.querySelector(".blob-item span");
  if(blobNameEl){
    blobNameEl.textContent = factura.numero + ".pdf";
  }

}

/* ========================= AVATAR ========================= */

function renderAvatar(cliente){

  const el = $("#detalle-avatar");
  if(!el) return;

  if(cliente.avatar){
    el.innerHTML = `<img src="${cliente.avatar}" />`;
  }else{
    const initials = (cliente.nombre || "?")
      .split(" ")
      .map(n=>n[0])
      .join("")
      .slice(0,2)
      .toUpperCase();

    el.innerHTML = `<div class="avatar-fallback">${initials}</div>`;
  }

}

/* ========================= ACTIONS ========================= */

async function getURL(){

  const res = await fetch(
    `${Onion.config.API}/facturas/${factura.id}/descargar`,
    {
      headers:{
        Authorization: "Bearer " + Onion.auth.getToken()
      }
    }
  );

  const data = await res.json();
  return data.url;
}

async function downloadFactura(){

  try{

    const url = await getURL();

    const a = document.createElement("a");
    a.href = url;
    a.download = factura.numero + ".pdf";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

  }catch(e){
    console.error("💥 DOWNLOAD ERROR", e);
  }

}

async function sendFactura(){

  try{

    const res = await fetch(
      `${Onion.config.API}/facturas/${factura.id}/enviar`,
      {
        method:"POST",
        headers:{
          Authorization: "Bearer " + Onion.auth.getToken()
        }
      }
    );

    const data = await res.json();

    if(!data.ok) throw new Error();

    alert("📧 Enviada");

  }catch(e){
    console.error("💥 SEND ERROR", e);
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

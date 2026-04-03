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

  /* método solo si pagada */
  $("#detalle-metodo").textContent =
    factura.estadoPago === "pagada"
      ? (factura.formaPago || "-")
      : "-";

  $("#detalle-total").textContent = formatMoney(factura.total);

  $("#detalle-concepto").textContent = factura.concepto || "-";
  $("#detalle-descripcion").textContent = factura.descripcion || "-";

  /* ========================= ESTADO ========================= */

  const estadoEl = $("#detalle-estado");

  estadoEl.dataset.estado = factura.estadoPago;

  estadoEl.textContent =
    factura.estadoPago === "pagada" ? "Pagada" :
    factura.estadoPago === "cancelada" ? "Cancelada" :
    "Pendiente";

  /* ========================= IVA (REAL BACKEND) ========================= */

  const iva = factura.impuestos?.find(i => i.tipo === "IVA");

  if(iva){
    $("#detalle-iva").textContent =
      `${iva.porcentaje}% · ${formatMoney(iva.importe)}`;
  }else{
    $("#detalle-iva").textContent = "--";
  }

  /* ========================= IRPF (🔥 FIX REAL) ========================= */

  const irpfContainer = $("#detalle-irpf-container");

  let irpf = factura.impuestos?.find(i => i.tipo === "IRPF");

  if(!irpf && factura.irpf){
    irpf = {
      porcentaje: factura.irpf,
      importe: factura.baseImponible
        ? factura.baseImponible * (factura.irpf / 100)
        : 0
    };
  }

  if(irpf && irpf.porcentaje){

    irpfContainer.style.display = "block";

    $("#detalle-irpf").textContent =
      `${irpf.porcentaje}% · -${formatMoney(irpf.importe)}`;

  }else{

    irpfContainer.style.display = "none";

  }

  /* ========================= SIDEBAR ========================= */

  const blobNameEl = document.querySelector(".blob-item span");

  if(blobNameEl){
    blobNameEl.textContent = factura.numero; // 🔥 SIN .pdf
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
  return Number(n || 0).toLocaleString("es-ES",{
    minimumFractionDigits:2
  }) + " €";
}

})();

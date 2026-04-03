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
  return document.querySelector(".panel-view.factura-detalle");
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

    if(!res.ok) throw new Error();

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

  /* CLIENTE */
  setText("#detalle-cliente", c.nombre || "Cliente");
  setText("#detalle-cliente-id", c.id || "");

  renderAvatar(c);

  /* DATA */
  setText("#detalle-numero-legal", factura.numero);
  setText("#detalle-id", factura.id || "--");
  setText("#detalle-incidencia-id", factura.incidenciaId || "--");

  setText("#detalle-fecha", formatFecha(factura.fecha));
  setText("#detalle-vencimiento", formatFecha(factura.fechaServicio));

  setText(
    "#detalle-metodo",
    factura.estadoPago === "pagada"
      ? (factura.formaPago || "-")
      : "-"
  );

  setText("#detalle-total", formatMoney(factura.total));
  setText("#detalle-concepto", factura.concepto || "-");
  setText("#detalle-descripcion", factura.descripcion || "-");

  /* ESTADO */
  const estadoEl = $("#detalle-estado");

  if(estadoEl){

    const estado = factura.estadoPago || "pendiente";

    estadoEl.dataset.estado = estado;

    estadoEl.textContent =
      estado === "pagada" ? "Pagada" :
      estado === "cancelada" ? "Cancelada" :
      "Pendiente";
  }

  /* IVA */
  const iva = factura.impuestos?.find(i => i.tipo === "IVA");

  setText(
    "#detalle-iva",
    iva
      ? `${iva.porcentaje}% · ${formatMoney(iva.importe)}`
      : "--"
  );

  /* IRPF */
  const irpfContainer = $("#detalle-irpf-container");

  let irpf = factura.impuestos?.find(i => i.tipo === "IRPF");

  if(!irpf && factura.irpf){

    const base = factura.baseImponible || 0;

    irpf = {
      porcentaje: factura.irpf,
      importe: base * (factura.irpf / 100)
    };
  }

  if(irpf && irpf.porcentaje){

    irpfContainer.style.display = "block";

    setText(
      "#detalle-irpf",
      `${irpf.porcentaje}% · -${formatMoney(irpf.importe)}`
    );

  }else{

    irpfContainer.style.display = "none";

  }

  /* SIDEBAR */
  const blobNameEl = document.querySelector(".view-file span");

  if(blobNameEl){
    blobNameEl.textContent = factura.numero || "Factura";
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

    el.textContent = initials;
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

function setText(sel,val){
  const el = $(sel);
  if(el) el.textContent = val || "--";
}

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

"use strict";

(function(){

const Onion = window.Onion;

if(!Onion){
  console.error("💥 Onion no disponible (factura-detalle)");
  return;
}

/* =========================================================
   STATE
========================================================= */
let initialized = false;
let factura = null;

let observer = null;

/* 🔥 CONTROL PRO */
let currentRequestId = 0;
let currentAbort = null;


/* =========================================================
   ROOT
========================================================= */
function getRoot(){
  return document.querySelector(".panel-content.factura-detalle");
}

function $(s){
  const root = getRoot();
  return root ? root.querySelector(s) : null;
}


/* =========================================================
   🔥 TOAST PRO (ALINEADO CON UI)
========================================================= */
function showToast(msg, type="success"){

  const t = document.createElement("div");
  t.className = `toast ${type}`;

  const content = document.createElement("div");
  content.className = "toast-content";

  const message = document.createElement("div");
  message.className = "toast-message";
  message.textContent = msg;

  const close = document.createElement("div");
  close.className = "toast-close";
  close.textContent = "✕";

  content.appendChild(message);
  t.appendChild(content);
  t.appendChild(close);

  document.body.appendChild(t);

  requestAnimationFrame(()=>{
    t.classList.add("show");
  });

  const timeout = setTimeout(()=>{
    remove();
  }, 2200);

  function remove(){
    t.classList.remove("show");
    setTimeout(()=> t.remove(), 250);
  }

  close.onclick = ()=>{
    clearTimeout(timeout);
    remove();
  };

}
  

/* =========================================================
   🔥 BUTTON STATE
========================================================= */
function setBtnLoading(btn, active, textLoading){

  if(!btn) return;

  if(active){
    btn.dataset.original = btn.textContent;
    btn.textContent = textLoading;
    btn.disabled = true;
    btn.classList.add("loading");
  }else{
    btn.textContent = btn.dataset.original || btn.textContent;
    btn.disabled = false;
    btn.classList.remove("loading");
  }

}


/* =========================================================
   LOADER CONTROL
========================================================= */
function setLoading(active){

  const loader = document.getElementById("factura-loading");
  const content = document.getElementById("factura-content");

  if(!loader || !content) return;

  if(active){
    loader.style.display = "flex";
    content.style.display = "none";
  }else{
    loader.style.display = "none";
    content.style.display = "block";
  }

}


/* =========================================================
   AUTH
========================================================= */
function getAuthHeaders(){
  const token = Onion.auth?.getToken?.();
  return token ? { Authorization: "Bearer " + token } : {};
}


/* =========================================================
   INIT
========================================================= */
function init(){

  const root = getRoot();
  if(!root || initialized) return;

  if(!Onion.state?.user){
    return setTimeout(init,100);
  }

  initialized = true;

  setLoading(true);

  bindEvents();
  observeDOM();

  requestAnimationFrame(()=>{
    loadFactura(getId());
  });

  Onion.onCleanup(()=>{
    initialized = false;
    currentRequestId++;
    currentAbort?.abort();
  });

}

init();


/* =========================================================
   OBSERVER
========================================================= */
function observeDOM(){

  if(observer) return;

  observer = new MutationObserver(()=>{
    if(!getRoot()){
      initialized = false;
      currentRequestId++;
      setTimeout(init,100);
    }
  });

  observer.observe(document.body,{
    childList:true,
    subtree:true
  });

}


/* =========================================================
   ID
========================================================= */
function getId(){
  return new URLSearchParams(location.search).get("id");
}


/* =========================================================
   EVENTS
========================================================= */
function bindEvents(){

  const root = getRoot();
  if(!root) return;

  Onion.cleanupEvent(root,"click",async (e)=>{

    const t = e.target;

    if(t.id === "btn-back"){
      Onion.router.navigate("/facturas");
    }

    if(t.id === "btn-descargar-factura"){
      await downloadFactura(t);
    }

    if(t.id === "btn-enviar-factura"){
      await sendFactura(t);
    }

  });

}


/* =========================================================
   LOAD
========================================================= */
async function loadFactura(id){

  const root = getRoot();
  if(!id || !root){
    setLoading(false);
    return;
  }

  const requestId = ++currentRequestId;

  if(currentAbort) currentAbort.abort();
  currentAbort = new AbortController();

  document.activeElement?.blur();
  setLoading(true);

  clearUI();

  try{

    const res = await fetch(
      `${Onion.config.API}/facturas/${id}`,
      {
        headers: getAuthHeaders(),
        signal: currentAbort.signal
      }
    );

    if(requestId !== currentRequestId) return;
    if(!res.ok) throw new Error("API ERROR");

    const json = await res.json();

    if(requestId !== currentRequestId) return;

    factura = json?.factura || json;

    requestAnimationFrame(()=>{
      render();
    });

  }catch(e){

    if(e.name === "AbortError") return;

    if(requestId !== currentRequestId) return;

    console.error("💥 ERROR LOAD:", e);

  }finally{

    if(requestId === currentRequestId){
      setTimeout(()=> setLoading(false), 80);
    }

  }

}


/* =========================================================
   CLEAR UI
========================================================= */
function clearUI(){

  setText("#detalle-cliente","--");
  setText("#detalle-cliente-id","--");

  setText("#detalle-numero-legal","--");
  setText("#detalle-id","--");
  setText("#detalle-incidencia-id","--");

  setText("#detalle-fecha","--");
  setText("#detalle-vencimiento","--");

  setText("#detalle-metodo","--");
  setText("#detalle-total","--");

  setText("#detalle-concepto","--");
  setText("#detalle-descripcion","--");

  setText("#detalle-iva","--");
  setText("#detalle-irpf","--");

}


/* =========================================================
   RENDER
========================================================= */
function render(){

  if(!factura) return;

  const c = factura.cliente || {};

  setText("#detalle-cliente", c.nombre || "Cliente");
  setText("#detalle-cliente-id", c.id || "");

  renderAvatar(c);

  const numeroLegal = factura.numeroFacturaLegal || factura.numero || "--";

  setText("#detalle-numero-legal", numeroLegal);
  setText("#detalle-id", factura.id || "--");
  setText("#detalle-incidencia-id", factura.incidenciaId || "--");

  const fileCard = document.querySelector(".view-file");
  if(fileCard){
    const label = fileCard.querySelector("span");
    if(label) label.textContent = numeroLegal;
  }

  setText("#detalle-fecha", formatFecha(factura.fecha));
  setText("#detalle-vencimiento", formatFecha(factura.fechaServicio));

  setText(
    "#detalle-metodo",
    factura.estadoPago === "pagada"
      ? capitalize(factura.formaPago || "-")
      : "-"
  );

  setText("#detalle-total", formatMoney(factura.total));
  setText("#detalle-concepto", factura.concepto || "-");
  setText("#detalle-descripcion", factura.descripcion || "-");

  const estadoEl = $("#detalle-estado");
  if(estadoEl){
    const estado = factura.estadoPago || "pendiente";
    estadoEl.dataset.estado = estado;
    estadoEl.textContent =
      estado === "pagada" ? "Pagada" :
      estado === "cancelada" ? "Cancelada" :
      "Pendiente";
  }

  const iva = factura.impuestos?.find(i => i.tipo === "IVA");
  setText("#detalle-iva",
    iva ? `${iva.porcentaje}% · ${formatMoney(iva.importe)}` : "--"
  );

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
    setText("#detalle-irpf",
      `${irpf.porcentaje}% · ${irpf.importe ? "-" : ""}${formatMoney(Math.abs(irpf.importe))}`
    );
  }else{
    irpfContainer.style.display = "none";
  }

}


/* =========================================================
   AVATAR
========================================================= */
function renderAvatar(cliente){

  const el = $("#detalle-avatar");
  if(!el) return;

  el.innerHTML = "";

  if(cliente.avatar){
    el.innerHTML = `<img src="${cliente.avatar}" />`;
    return;
  }

  const initials = (cliente.nombre || "?")
    .split(" ")
    .map(n=>n[0])
    .join("")
    .slice(0,2)
    .toUpperCase();

  el.textContent = initials;

}


/* =========================================================
   ACTIONS
========================================================= */
async function getURL(){

  const res = await fetch(
    `${Onion.config.API}/facturas/${factura.id}/descargar`,
    { headers: getAuthHeaders() }
  );

  const data = await res.json();
  return data.url;
}

async function downloadFactura(btn){

  if(!factura) return;

  setBtnLoading(btn, true, "Descargando...");

  try{
    const url = await getURL();

    const a = document.createElement("a");
    a.href = url;
    a.download = factura.numero + ".pdf";

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    showToast("Factura descargada 📄");

  }catch(e){
    console.error("💥 DOWNLOAD ERROR", e);
    showToast("Error al descargar", "error");
  }

  setBtnLoading(btn, false);

}

async function sendFactura(btn){

  if(!factura) return;

  setBtnLoading(btn, true, "Enviando...");

  try{
    const res = await fetch(
      `${Onion.config.API}/facturas/${factura.id}/enviar`,
      {
        method:"POST",
        headers: getAuthHeaders()
      }
    );

    const data = await res.json();
    if(!data.ok) throw new Error();

    showToast("Factura enviada 📧");

  }catch(e){
    console.error("💥 SEND ERROR", e);
    showToast("Error al enviar", "error");
  }

  setBtnLoading(btn, false);

}


/* =========================================================
   HELPERS
========================================================= */
function setText(sel,val){
  const el = $(sel);
  if(el) el.textContent = val || "--";
}

function formatFecha(f){
  return f ? new Date(f).toLocaleDateString("es-ES") : "--";
}

function formatMoney(n){
  return Number(n || 0).toLocaleString("es-ES",{
    minimumFractionDigits:2
  }) + " €";
}

function capitalize(text){
  if(!text) return "";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

})();

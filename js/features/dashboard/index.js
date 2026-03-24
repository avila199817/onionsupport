"use strict";

(function(){

const Onion = window.Onion;

if(!Onion){
  console.error("💥 Onion no disponible (dashboard)");
  return;
}

let interval = null;

/* =========================
   ROOT
========================= */

function getRoot(){
  return document.querySelector(".panel-content.dashboard");
}

function $(id){
  return getRoot()?.querySelector("#" + id);
}

/* =========================
   HELPERS
========================= */

function safe(n){
  return (n === 0 || n) ? n : 0;
}

function pick(...vals){
  return vals.find(v => v !== undefined && v !== null);
}

function formatMoney(n){
  return new Intl.NumberFormat("es-ES", {
    style:"currency",
    currency:"EUR",
    maximumFractionDigits:0
  }).format(safe(n));
}

function setText(id, value){
  const el = $(id);
  if(el) el.textContent = value;
}

/* =========================
   MES
========================= */

function setMonthLabel(){
  const el = $("facturacion-mes-label");
  if(!el) return;

  const now = new Date();

  const meses = [
    "Enero","Febrero","Marzo","Abril","Mayo","Junio",
    "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"
  ];

  el.textContent = meses[now.getMonth()] + " " + now.getFullYear();
}

/* =========================
   DASHBOARD
========================= */

async function loadDashboard(){

  try{

    const res = await Onion.fetch(Onion.config.API + "/dashboard");
    const data = res?.data || res;

    if(!data) return;

    const k = data.kpis || data || {};

    /* =========================
       USUARIOS
    ========================= */

    setText("home-usuarios", safe(pick(
      k.usuarios,
      k.usuariosActivos
    )));

    setText("home-usuarios-inactivos", safe(
      k.usuariosInactivos
    ));

    /* =========================
       CLIENTES
    ========================= */

    setText("home-clientes", safe(pick(
      k.clientes,
      k.clientesActivos
    )));

    setText("home-clientes-inactivos", safe(
      k.clientesInactivos
    ));

    /* =========================
       FACTURACIÓN (CORRECTA)
    ========================= */

    const totalPagado = pick(
      k.facturacionPagada,
      k.facturacionTotal
    );

    const pendiente = pick(
      k.facturacionPendiente
    );

    const mensual = pick(
      k.facturacionMensual
    );

    setText("home-facturas", formatMoney(totalPagado));
    setText("home-facturas-pendiente", formatMoney(pendiente));
    setText("home-facturacion-mes", formatMoney(mensual));

    /* =========================
       HOY
    ========================= */

    setText("tickets-hoy", safe(k.ticketsToday));
    setText("resueltos-hoy", safe(k.resueltosToday));
    setText("pendientes-hoy", safe(k.pendientesToday));

    renderActivity(data.activity || []);

  }catch(e){
    Onion.error("💥 Dashboard error:", e);
  }

}

/* =========================
   ACTIVITY
========================= */

function renderActivity(items){

  const list = $("activity-list");
  if(!list) return;

  list.innerHTML = "";

  if(!items.length){
    list.innerHTML = "<div>Sin actividad</div>";
    return;
  }

  items.slice(0,8).forEach(i => {

    const el = document.createElement("div");

    el.className = "activity-item";

    el.innerHTML = `
      <div>
        <strong>${escapeHTML(i.type)}</strong>
        <p>${escapeHTML(i.desc)}</p>
        <small>${timeAgo(i.time)}</small>
      </div>
    `;

    list.appendChild(el);

  });

}

/* =========================
   SYSTEM
========================= */

async function loadSystem(){

  try{

    const base = new URL(Onion.config.API).origin;

    const res = await Onion.fetch(base + "/health");
    const data = res?.data || res;

    setText("status-api", "API · " + (data?.api?.latency || "--") + " ms");
    setText("status-db", "DB · " + (data?.db?.status || "--"));
    setText("status-uptime", "Uptime · " + (data?.uptime || "--"));

  }catch(e){
    console.error("💥 HEALTH FAIL:", e);
  }

}

/* =========================
   INIT
========================= */

async function init(){

  const root = getRoot();
  if(!root) return;

  setMonthLabel();

  await loadDashboard();
  loadSystem();

  interval = setInterval(()=>{
    loadDashboard();
    loadSystem();
  }, 60000);

}

/* =========================
   START
========================= */

init();

/* =========================
   HELPERS
========================= */

function timeAgo(date){
  if(!date) return "Ahora";

  const diff = Math.floor((Date.now() - new Date(date)) / 1000);

  if(diff < 60) return "Hace " + diff + "s";
  if(diff < 3600) return "Hace " + Math.floor(diff/60) + " min";
  if(diff < 86400) return "Hace " + Math.floor(diff/3600) + " h";

  return "Hace " + Math.floor(diff/86400) + " d";
}

function escapeHTML(str){
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

})();

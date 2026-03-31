"use strict";

(function(){

const Onion = window.Onion;

if(!Onion){
  console.error("💥 Onion no disponible (dashboard)");
  return;
}

let interval = null;
let initialized = false;

/* =========================
   CONFIG
========================= */

const API = Onion.config?.API;

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
  return Number(n || 0);
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
  if(el) el.textContent = value ?? "--";
}

function parseDate(d){
  if(!d) return null;
  const date = new Date(d);
  return isNaN(date) ? null : date;
}

/* =========================
   MES LABEL
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
   🔥 RENDER BARRAS AÑO
========================= */

function renderYearRevenue(data){

  const container = document.querySelector(".year-grid");
  if(!container) return;

  const months = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

  const max = Math.max(...data, 1);

  container.innerHTML = data.map((value, i) => {

    const percent = (value / max) * 100;

    return `
      <div class="month">

        <div class="bar" style="height:0%"></div>

        <span>${months[i]}</span>
        <strong>${formatMoney(value)}</strong>

      </div>
    `;

  }).join("");

  // 🔥 ANIMACIÓN SUAVE
  requestAnimationFrame(()=>{

    const bars = container.querySelectorAll(".bar");

    bars.forEach((bar, i)=>{
      const value = data[i];
      const percent = (value / max) * 100;

      bar.style.height = percent + "%";
    });

  });

}

/* =========================
   DASHBOARD DATA
========================= */

async function loadDashboardData(){

  try {

    const resFacturas = await Onion.fetch(API + "/facturas");
    const facturas = resFacturas?.facturas || resFacturas?.data || [];

    const pagadas = facturas.filter(f => f?.estadoPago === "pagada");
    const pendientes = facturas.filter(f => f?.estadoPago === "pendiente");

    const totalPagado = pagadas.reduce((acc, f) => acc + safe(f?.total), 0);
    const totalPendiente = pendientes.reduce((acc, f) => acc + safe(f?.total), 0);

    const now = new Date();
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const mensualPagado = pagadas
      .filter(f => {
        const d = parseDate(f?.fecha || f?.createdAt);
        return d && d >= startMonth;
      })
      .reduce((acc, f) => acc + safe(f?.total), 0);

    setText("home-facturas", formatMoney(totalPagado));
    setText("home-facturas-pendiente", formatMoney(totalPendiente));
    setText("home-facturacion-mes", formatMoney(mensualPagado));

  } catch(e){
    console.error("💥 Facturas error:", e);
  }

  try {

    const res = await Onion.fetch(API + "/dashboard");
    const data = res?.data || res || {};
    const k = data?.kpis || {};

    setText("home-usuarios", safe(k?.usuarios));
    setText("home-usuarios-inactivos", safe(k?.usuariosInactivos));

    setText("home-clientes", safe(k?.clientes));
    setText("home-clientes-inactivos", safe(k?.clientesInactivos));

    setText("tickets-hoy", safe(k?.ticketsToday));
    setText("resueltos-hoy", safe(k?.resueltosToday));
    setText("pendientes-hoy", safe(k?.pendientesToday));

    renderActivity(data?.activity || []);

    // 🔥 AÑO (LO IMPORTANTE)
    renderYearRevenue(data?.facturacionPorMes || []);

  } catch(e){
    console.error("💥 KPIs error:", e);
  }
}

/* =========================
   SYSTEM
========================= */

async function loadSystem(){

  const token = Onion.auth?.getToken?.();

  if(!token){
    setText("status-api", "API · no auth");
    setText("status-db", "DB · no auth");
    return;
  }

  try{

    const base = new URL(API).origin;

    const res = await fetch(base + "/health/internal", {
      headers: {
        "Authorization": "Bearer " + token
      }
    });

    const data = await res.json();

    setText("status-api", "API · " + (data?.api?.latency ?? "--") + " ms");
    setText("status-db", "DB · " + (data?.db?.status ?? "--"));
    setText("status-uptime", "Uptime · " + (data?.uptime ?? "--"));

  }catch(e){

    setText("status-api", "API · error");
    setText("status-db", "DB · error");

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

  items.slice(0,3).forEach(i => {

    const el = document.createElement("div");
    el.className = "activity-item";

    el.innerHTML = `
      <div class="activity-title">${escapeHTML(i?.desc || "Actividad")}</div>
      <div class="activity-meta">${timeAgo(i?.time)}</div>
    `;

    list.appendChild(el);

  });
}

/* =========================
   LOAD
========================= */

async function loadDashboard(){

  const panel = getRoot();
  panel?.classList.remove("ready");

  await Promise.allSettled([
    loadDashboardData(),
    loadSystem()
  ]);

  requestAnimationFrame(()=>{
    panel?.classList.add("ready");
  });
}

/* =========================
   INIT
========================= */

function init(){

  const root = getRoot();
  if(!root || initialized) return;

  initialized = true;

  setMonthLabel();
  loadDashboard();

  interval = setInterval(loadDashboard, 60000);

  Onion.onCleanup(()=>{
    initialized = false;
    if(interval) clearInterval(interval);
  });
}

/* =========================
   HELPERS
========================= */

function timeAgo(date){

  const d = parseDate(date);
  if(!d) return "Ahora";

  const diff = Math.floor((Date.now() - d) / 1000);

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

/* =========================
   START
========================= */

init();

})();

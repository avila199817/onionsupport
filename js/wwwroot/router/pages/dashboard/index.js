"use strict";

(function(){

const Onion = window.Onion;

if(!Onion){
  console.error("💥 Onion no disponible (dashboard)");
  return;
}

let loading = false;

/* =========================
   CONFIG
========================= */

const API = Onion.config?.API || "";

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

function formatDate(d){
  if(!d) return "-";
  const date = new Date(d);
  return date.toLocaleDateString("es-ES");
}

function setText(id, value){
  const el = $(id);
  if(el) el.textContent = value ?? "--";
}

function getInitials(name){
  if(!name) return "?";
  return name
    .split(" ")
    .map(n => n[0])
    .slice(0,2)
    .join("")
    .toUpperCase();
}

/* =========================
   AVATAR
========================= */

function hashString(str){
  let hash = 0;
  for(let i = 0; i < str.length; i++){
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return hash;
}

function getAvatarColor(name){
  const colors = ["#6366f1","#22c55e","#eab308","#ef4444","#06b6d4","#a855f7","#f97316"];
  return colors[Math.abs(hashString(name)) % colors.length];
}

function renderAvatar(name){
  return `
    <div style="
      width:100%;
      height:100%;
      border-radius:50%;
      display:flex;
      align-items:center;
      justify-content:center;
      background:${getAvatarColor(name)};
      color:#fff;
      font-weight:600;
      font-size:12px;
    ">
      ${getInitials(name)}
    </div>
  `;
}

/* =========================
   GREETING
========================= */

function setGreeting(){

  const el = document.getElementById("greeting-text");
  if(!el) return;

  const hour = new Date().getHours();

  let greeting = "Buenos días";

  if(hour >= 12 && hour < 20){
    greeting = "Buenas tardes";
  } else if(hour >= 20 || hour < 6){
    greeting = "Buenas noches";
  }

  const fullName = Onion.state.user?.name || "Usuario";
  const name = fullName.split(" ")[0];

  el.textContent = `${greeting}, ${name}`;
}

/* =========================
   YEAR DATA
========================= */

function buildYearData(evolucion){

  const currentYear = new Date().getFullYear();

  const yearData = new Array(12).fill(0).map(() => ({
    paid: 0,
    pending: 0
  }));

  if(!Array.isArray(evolucion)) return yearData;

  evolucion.forEach(m => {

    if(!m?.mes) return;

    const [yearStr, mesStr] = m.mes.split("-");
    const year = Number(yearStr);
    const monthIndex = Number(mesStr) - 1;

    if(year !== currentYear) return;

    yearData[monthIndex] = {
      paid: safe(m.pagado),
      pending: safe(m.pendiente)
    };

  });

  return yearData;
}

/* =========================
   CHART
========================= */

function renderYearRevenue(data){

  const container = getRoot()?.querySelector(".year-grid");
  if(!container) return;

  const months = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  const max = Math.max(...data.map(d => d.paid + d.pending), 1);

  container.innerHTML = data.map((d, i) => {

    const total = d.paid + d.pending;
    const percent = (total / max) * 100;

    return `
      <div class="month">
        <div class="bar" style="height:${percent}%"></div>
      </div>
    `;
  }).join("");
}

/* =========================
   PENDIENTES
========================= */

function renderPendingFacturas(facturas){

  const tbody = $("dashboard-pending-body");
  if(!tbody) return;

  const pendientes = (facturas || []).slice(0,5);

  tbody.innerHTML = pendientes.map(f => `
    <tr>
      <td>${f.numero || "-"}</td>
      <td>${f.cliente?.nombre || "Cliente"}</td>
      <td>${formatDate(f.fecha)}</td>
      <td>${formatMoney(f.total)}</td>
    </tr>
  `).join("");
}

/* =========================
   DATA
========================= */

async function loadDashboardData(){

  try {

    const res = await Onion.fetch(API + "/dashboard");
    const data = res?.data || {};

    renderYearRevenue(buildYearData(data.charts?.evolucionMensual));

    const resFacturas = await Onion.fetch(API + "/facturas");

    renderPendingFacturas(resFacturas?.facturas);

  } catch(e){
    console.error("💥 Dashboard error:", e);
  }
}

/* =========================
   LOAD
========================= */

async function loadDashboard(){

  if(loading) return;
  loading = true;

  setGreeting();

  await loadDashboardData();

  getRoot()?.classList.add("ready");

  loading = false;
}

/* =========================
   🔥 AUTO INIT (CLAVE)
========================= */

(function init(){

  function waitRoot(){

    const root = getRoot();

    if(!root){
      requestAnimationFrame(waitRoot);
      return;
    }

    loadDashboard();
  }

  waitRoot();

})();

})();

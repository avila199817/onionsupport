"use strict";

(function(){

const Onion = window.Onion;

if(!Onion){
  console.error("💥 Onion no disponible (dashboard)");
  return;
}

let initialized = false;
let loading = false;

/* =========================
   CONFIG
========================= */

const API = Onion.config?.API || "";

/* =========================
   TEMPLATE
========================= */

function template(){
  return `
    <div class="panel-content dashboard">

      <div class="dashboard-header">
        <h1 id="greeting-text">Cargando...</h1>
      </div>

      <!-- AQUÍ VA TU HTML REAL DEL DASHBOARD -->
      <!-- (respeta tus IDs: home-facturas, year-grid, etc.) -->

      <div class="year-grid"></div>

      <table>
        <tbody id="dashboard-pending-body"></tbody>
      </table>

    </div>
  `;
}

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

function avatarHTML(initials, color){
  return `
    <div style="
      width:100%;
      height:100%;
      border-radius:50%;
      display:flex;
      align-items:center;
      justify-content:center;
      background:${color};
      color:#fff;
      font-weight:600;
      font-size:12px;
    ">
      ${initials}
    </div>
  `;
}

function renderAvatar(name){
  return avatarHTML(getInitials(name), getAvatarColor(name));
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

  const fullName = Onion.auth?.getUser?.()?.nombre || "Cristian";
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

  const html = data.map((d, i) => {

    const total = d.paid + d.pending;

    const percent = (total / max) * 100;
    const paidPercent = total ? (d.paid / total) * 100 : 0;
    const pendingPercent = total ? (d.pending / total) * 100 : 0;

    return `
      <div class="month ${total === 0 ? "empty" : ""}">
        <div class="bar" data-month="${months[i]}" style="height:${total === 0 ? 2 : percent}%">

          <div class="bar-paid" style="height:${paidPercent}%">
            ${d.paid > 0 ? `<span class="bar-label">${formatMoney(d.paid)}</span>` : ""}
          </div>

          <div class="bar-pending" style="height:${pendingPercent}%">
            ${d.pending > 0 ? `<span class="bar-label negative">${formatMoney(d.pending)}</span>` : ""}
          </div>

        </div>
      </div>
    `;
  }).join("");

  container.innerHTML = html;

  requestAnimationFrame(()=>{
    container.querySelectorAll(".bar").forEach(bar=>{
      bar.classList.add("animate");
    });
  });
}

/* =========================
   PENDIENTES
========================= */

function renderPendingFacturas(facturas){

  const tbody = $("dashboard-pending-body");
  if(!tbody) return;

  const pendientes = (facturas || [])
    .filter(f => f.estadoPago !== "pagada")
    .sort((a,b) => safe(b.total) - safe(a.total))
    .slice(0,5);

  if(!pendientes.length){
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align:center; opacity:.6; padding:20px;">
          Sin facturas pendientes
        </td>
      </tr>
    `;
    return;
  }

  const html = pendientes.map(f => {

    const cliente = f.cliente?.nombre || "Cliente";
    const email = f.cliente?.email || "-";
    const fecha = formatDate(f.fecha);
    const importe = formatMoney(f.total);
    const id = f.numero || "-";

    return `
      <tr data-id="${f.id}">
        <td>${id}</td>
        <td>
          <div class="cell-user">
            <div class="table-avatar">${renderAvatar(cliente)}</div>
            <div class="user-info">
              <span>${cliente}</span>
              <span>${email}</span>
            </div>
          </div>
        </td>
        <td>${fecha}</td>
        <td>${importe}</td>
        <td><span class="badge warning">Pendiente</span></td>
      </tr>
    `;
  }).join("");

  tbody.innerHTML = html;
}

/* =========================
   DATA
========================= */

async function loadDashboardData(){

  try {

    const res = await Onion.fetch(API + "/dashboard");
    const data = res?.data || {};

    const resumen = data.resumen || {};
    const evolucion = data.charts?.evolucionMensual || [];

    setText("home-facturas", formatMoney(resumen.totalCobrado));
    setText("home-iva", formatMoney(resumen.totalIVA));
    setText("home-irpf", formatMoney(resumen.totalIRPF));
    setText("home-beneficio", formatMoney(resumen.beneficio));
    setText("home-pendiente", formatMoney(resumen.totalPendiente));

    renderYearRevenue(buildYearData(evolucion));

    const resFacturas = await Onion.fetch(API + "/facturas");
    const facturas = resFacturas?.facturas || [];

    renderPendingFacturas(facturas);

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
   MOUNT
========================= */

function mount(){

  const root = getRoot();
  if(!root || initialized) return;

  initialized = true;

  loadDashboard();
}

/* =========================
   CLEANUP
========================= */

function cleanup(){
  initialized = false;
}

/* =========================
   REGISTER
========================= */

Onion.pages = Onion.pages || {};

Onion.pages["dashboard"] = {
  render: template,
  mount,
  cleanup
};

})();

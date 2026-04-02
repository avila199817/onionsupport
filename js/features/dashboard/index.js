"use strict";

(function(){

const Onion = window.Onion;

if(!Onion){
  console.error("💥 Onion no disponible (dashboard)");
  return;
}

let interval = null;
let initialized = false;
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
   🔥 GREETING
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
   🔥 BUILD YEAR DATA
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
   🔥 LOADER
========================= */

function showLoader(){
  const container = getRoot()?.querySelector(".year-grid");
  if(!container) return;
  container.classList.add("skeleton-grid");
}

function hideLoader(){
  const container = getRoot()?.querySelector(".year-grid");
  if(!container) return;
  container.classList.remove("skeleton-grid");
  container.innerHTML = "";
}

/* =========================
   🔥 RENDER CHART
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
   🔥 RENDER PENDIENTES
========================= */

function renderPendingFacturas(facturas){

  const tbody = $("dashboard-pending-body");
  const countEl = $("pending-count");

  if(!tbody) return;

  const pendientes = (facturas || [])
    .filter(f => (f.estadoPago || "").toLowerCase() !== "pagada")
    .sort((a,b) => safe(b.baseImponible) - safe(a.baseImponible))
    .slice(0,5);

  if(countEl){
    countEl.textContent = pendientes.length;
  }

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

    const cliente = f.cliente?.nombreContacto || "Sin nombre";
    const empresa = f.cliente?.razonSocial || "";
    const email = f.emailCliente || "";
    const fecha = formatDate(f.fechaFactura);
    const importe = formatMoney(f.total);
    const id = f.numeroFacturaLegal || "-";

    return `
      <tr data-id="${f.id}">

        <td class="col-id">${id}</td>

        <td class="col-main">
          <div class="cell-user">
            <div class="table-avatar">${getInitials(cliente)}</div>
            <div class="user-info">
              <span class="user-name">${cliente}</span>
              <span class="user-sub">${email}</span>
            </div>
          </div>
        </td>

        <td class="col-date">${fecha}</td>

        <td class="col-importe">${importe}</td>

        <td class="col-status">
          <span class="badge warning">Pendiente</span>
        </td>

        <td class="col-actions">
          <div class="actions">
            <button class="btn-action view">Ver</button>
            <button class="btn-action download">PDF</button>
            <button class="btn-action pay">Pagar</button>
          </div>
        </td>

      </tr>
    `;
  }).join("");

  tbody.innerHTML = html;
}

/* =========================
   🔥 DATA
========================= */

async function loadDashboardData(){

  try {

    const res = await Onion.fetch(API + "/dashboard");
    const data = res?.data || {};

    const resumen = data.resumen || {};
    const evolucion = data.charts?.evolucionMensual || [];

    // KPIs
    setText("home-facturas", formatMoney(resumen.totalCobrado));
    setText("home-iva", formatMoney(resumen.totalIVA));
    setText("home-irpf", formatMoney(resumen.totalIRPF));
    setText("home-beneficio", formatMoney(resumen.beneficio));
    setText("home-pendiente", formatMoney(resumen.totalPendiente));

    const yearData = buildYearData(evolucion);

    hideLoader();
    renderYearRevenue(yearData);

    // 🔥 NUEVO FETCH FACTURAS
    const resFacturas = await Onion.fetch(API + "/facturas");
    const facturas = resFacturas?.data || [];

    renderPendingFacturas(facturas);

  } catch(e){

    console.error("💥 Dashboard error:", e);
    hideLoader();
  }
}

/* =========================
   🔥 LOAD
========================= */

async function loadDashboard(){

  if(loading) return;
  loading = true;

  const panel = getRoot();
  panel?.classList.remove("ready");

  setGreeting();
  showLoader();

  await loadDashboardData();

  requestAnimationFrame(()=>{
    panel?.classList.add("ready");
  });

  loading = false;
}

/* =========================
   🔥 INIT
========================= */

function init(){

  const root = getRoot();
  if(!root || initialized) return;

  initialized = true;

  loadDashboard();

  interval = setInterval(loadDashboard, 60000);

  Onion.onCleanup(()=>{
    initialized = false;
    if(interval) clearInterval(interval);
  });
}

/* =========================
   START
========================= */

init();

})();

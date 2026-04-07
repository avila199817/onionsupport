"use strict";

(function(){

const Onion = window.Onion;

if(!Onion){
  console.error("💥 Onion no disponible (dashboard)");
  return;
}

const API = Onion.config?.API || "";

const state = {
  root: null,
  loading: false,
  observer: null,
  bootstrapped: false
};

function getRoot(){
  return document.querySelector(".panel-content.dashboard");
}

function $(id){
  return state.root?.querySelector("#" + id) || null;
}

function safe(n){
  return Number(n || 0);
}

function formatMoney(n){
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0
  }).format(safe(n));
}

function formatDate(value){
  if(!value) return "-";

  const date = new Date(value);

  if(Number.isNaN(date.getTime())) return "-";

  return date.toLocaleDateString("es-ES");
}

function getInitials(name){
  if(!name) return "?";

  return name
    .trim()
    .split(/\s+/)
    .map((n)=> n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function hashString(str){
  let hash = 0;

  for(let i = 0; i < str.length; i++){
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }

  return hash;
}

function getAvatarColor(name){
  const colors = ["#6366f1", "#22c55e", "#eab308", "#ef4444", "#06b6d4", "#a855f7", "#f97316"];
  return colors[Math.abs(hashString(name || "onion")) % colors.length];
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

function setText(id, value){
  const el = $(id);
  if(el) el.textContent = value ?? "--";
}

function setGreeting(){
  const el = $("greeting-text");
  if(!el) return;

  const hour = new Date().getHours();
  let greeting = "Buenos días";

  if(hour >= 12 && hour < 20){
    greeting = "Buenas tardes";
  }else if(hour >= 20 || hour < 6){
    greeting = "Buenas noches";
  }

  const fullName = Onion.state?.user?.name || "Usuario";
  const name = fullName.split(" ")[0] || "Usuario";

  el.textContent = `${greeting}, ${name}`;
}

function buildYearData(evolucion){
  const currentYear = new Date().getFullYear();

  const data = new Array(12).fill(0).map(()=>({
    paid: 0,
    pending: 0
  }));

  if(!Array.isArray(evolucion)) return data;

  evolucion.forEach((item)=>{
    if(!item?.mes) return;

    const [yearStr, monthStr] = String(item.mes).split("-");
    const year = Number(yearStr);
    const monthIndex = Number(monthStr) - 1;

    if(year !== currentYear) return;
    if(monthIndex < 0 || monthIndex > 11) return;

    data[monthIndex] = {
      paid: safe(item.pagado),
      pending: safe(item.pendiente)
    };
  });

  return data;
}

function renderYearRevenue(data){
  const container = state.root?.querySelector(".year-grid");
  if(!container) return;

  const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  const max = Math.max(...data.map((d)=> d.paid + d.pending), 1);

  container.innerHTML = data.map((d, i)=>{
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

  requestAnimationFrame(()=>{
    container.querySelectorAll(".bar").forEach((bar)=>{
      bar.classList.add("animate");
    });
  });
}

function renderPendingFacturas(facturas){
  const tbody = $("dashboard-pending-body");
  if(!tbody) return;

  const pendientes = (facturas || [])
    .filter((f)=> f?.estadoPago !== "pagada")
    .sort((a, b)=> safe(b?.total) - safe(a?.total))
    .slice(0, 5);

  const countEl = $("pending-count");
  if(countEl) countEl.textContent = String(pendientes.length);

  if(!pendientes.length){
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align:center; opacity:.6; padding:20px;">Sin facturas pendientes</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = pendientes.map((f)=>{
    const cliente = f?.cliente?.nombre || "Cliente";
    const email = f?.cliente?.email || "-";
    const fecha = formatDate(f?.fecha);
    const importe = formatMoney(f?.total);
    const id = f?.numero || "-";

    return `
      <tr data-id="${f?.id || ""}">
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
        <td></td>
      </tr>
    `;
  }).join("");
}

async function loadDashboardData(){
  const [dashboardRes, facturasRes] = await Promise.all([
    Onion.fetch(API + "/dashboard"),
    Onion.fetch(API + "/facturas")
  ]);

  const data = dashboardRes?.data || {};
  const resumen = data?.resumen || {};
  const evolucion = data?.charts?.evolucionMensual || [];

  setText("home-facturas", formatMoney(resumen.totalCobrado));
  setText("home-iva", formatMoney(resumen.totalIVA));
  setText("home-irpf", formatMoney(resumen.totalIRPF));
  setText("home-beneficio", formatMoney(resumen.beneficio));
  setText("home-pendiente", formatMoney(resumen.totalPendiente));

  renderYearRevenue(buildYearData(evolucion));
  renderPendingFacturas(facturasRes?.facturas || []);
}

async function hydrate(root){
  if(state.loading) return;
  if(!root || root !== state.root) return;

  state.loading = true;

  try{
    setGreeting();
    await loadDashboardData();
    root.classList.add("ready");
  }catch(e){
    console.error("💥 Dashboard error:", e);
    Onion.ui?.toast?.("Error cargando dashboard", "error");
  }finally{
    state.loading = false;
  }
}

function mountIfNeeded(){
  const root = getRoot();

  if(!root){
    state.root = null;
    return;
  }

  if(root === state.root && root.dataset.dashboardMounted === "1"){
    return;
  }

  state.root = root;
  root.dataset.dashboardMounted = "1";

  hydrate(root);
}

function startObserver(){
  if(state.observer) return;

  const target = document.getElementById("view-container") || document.body;

  state.observer = new MutationObserver(()=>{
    mountIfNeeded();
  });

  state.observer.observe(target, {
    childList: true,
    subtree: true
  });
}

function bootstrap(){
  if(state.bootstrapped) return;
  state.bootstrapped = true;

  startObserver();
  mountIfNeeded();

  window.addEventListener("popstate", ()=>{
    requestAnimationFrame(mountIfNeeded);
  });

  document.addEventListener("click", (e)=>{
    const link = e.target.closest("[data-spa]");
    if(!link) return;
    requestAnimationFrame(mountIfNeeded);
  });
}

if(document.readyState === "loading"){
  document.addEventListener("DOMContentLoaded", bootstrap);
}else{
  bootstrap();
}

})();

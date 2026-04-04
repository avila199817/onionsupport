"use strict";

(function(){

const Onion = window.Onion;

if(!Onion){
  console.error("💥 Onion no disponible (facturas)");
  return;
}

let initialized = false;
let currentItems = [];
let filteredItems = [];
let loading = false;
let currentRequestId = 0;

/* 🔥 SORT STATE */
let sortState = {
  key: null,
  dir: "asc"
};

/* =========================
   ROOT
========================= */

function getRoot(){
  return document.querySelector(".panel-content.facturas");
}

function $(selector){
  const root = getRoot();
  return root ? root.querySelector(selector) : null;
}

/* =========================
   INIT
========================= */

function init(){

  const root = getRoot();
  if(!root || initialized) return;

  if(!Onion.state?.user){
    return setTimeout(init, 100);
  }

  initialized = true;

  bindEvents();
  bindSorting();

  requestAnimationFrame(loadFacturas);

  Onion.onCleanup(()=>{
    initialized = false;
  });

}

init();

/* =========================
   EVENTS
========================= */

function bindEvents(){

  const root = getRoot();
  if(!root) return;

  Onion.cleanupEvent(root, "click", (e)=>{

    const btn = e.target.closest(".btn-action");

    if(btn){
      handleAction(btn);
      return;
    }

    const row = e.target.closest("tr[data-id]");
    if(!row) return;

    Onion.router.navigate("/facturas/detalle?id=" + row.dataset.id);

  });

  $("#btn-new-factura")?.addEventListener("click", ()=>{
    Onion.router.navigate("/facturas/nueva");
  });

  $("#search-factura")?.addEventListener("input", debounce(applyFilters, 250));
  $("#filter-estado-factura")?.addEventListener("change", applyFilters);

}

/* =========================
   SORTING
========================= */

function bindSorting(){

  const headers = getRoot()?.querySelectorAll("th");
  if(!headers) return;

  headers.forEach(th => {

    const key = getSortKey(th);
    if(!key) return;

    th.addEventListener("click", ()=>{

      if(sortState.key === key){
        sortState.dir = sortState.dir === "asc" ? "desc" : "asc";
      }else{
        sortState.key = key;
        sortState.dir = "asc";
      }

      applySort();
      updateSortUI();

    });

  });

}

function getSortKey(th){

  if(th.classList.contains("col-id")) return "numero";
  if(th.classList.contains("col-main")) return "cliente";
  if(th.classList.contains("col-secondary")) return "empresa";
  if(th.classList.contains("col-date")) return "fecha";
  if(th.classList.contains("col-importe")) return "total";
  if(th.classList.contains("col-status")) return "estado";

  return null;

}

function applySort(){

  if(!sortState.key) return;

  filteredItems.sort((a,b)=>{

    const A = mapItem(a);
    const B = mapItem(b);

    let valA, valB;

    switch(sortState.key){

      case "cliente":
        valA = A.cliente.nombre;
        valB = B.cliente.nombre;
        break;

      case "empresa":
        valA = A.empresa;
        valB = B.empresa;
        break;

      case "fecha":
        valA = new Date(A.fecha);
        valB = new Date(B.fecha);
        break;

      case "total":
        valA = parseFloat(A.total.replace(",", "."));
        valB = parseFloat(B.total.replace(",", "."));
        break;

      case "estado":
        valA = A.estadoPago.raw;
        valB = B.estadoPago.raw;
        break;

      default:
        valA = A.numero;
        valB = B.numero;
    }

    if(valA < valB) return sortState.dir === "asc" ? -1 : 1;
    if(valA > valB) return sortState.dir === "asc" ? 1 : -1;
    return 0;

  });

  render(filteredItems);

}

function updateSortUI(){

  const headers = getRoot()?.querySelectorAll("th");
  if(!headers) return;

  headers.forEach(th=>{
    th.classList.remove("sort-asc","sort-desc");
  });

  headers.forEach(th=>{
    const key = getSortKey(th);
    if(key === sortState.key){
      th.classList.add(sortState.dir === "asc" ? "sort-asc" : "sort-desc");
    }
  });

}

/* =========================
   LOAD
========================= */

async function loadFacturas(){

  if(loading) return;
  loading = true;

  const tbody = $("#facturas-body");
  if(!tbody) return;

  const requestId = ++currentRequestId;

  document.activeElement?.blur();

  try{

    await new Promise(r=>requestAnimationFrame(r));
    await new Promise(r=>setTimeout(r,200));

    const res = await Onion.fetch(Onion.config.API + "/facturas");
    const items = normalize(res);

    if(requestId !== currentRequestId) return;

    currentItems = items;
    filteredItems = items;

    if(!items.length){
      setEmpty();
      return;
    }

    render(items);

  }catch(e){

    console.error("💥 ERROR FACTURAS:", e);
    setError();

  }finally{
    loading = false;
  }

}

/* =========================
   FILTERS
========================= */

function applyFilters(){

  const search = ($("#search-factura")?.value || "").toLowerCase();
  const estado = ($("#filter-estado-factura")?.value || "").toLowerCase();

  filteredItems = currentItems.filter(f => {

    const cliente = safeText(f.cliente?.nombre || f.cliente?.nombreContacto);
    const empresa = safeText(f.cliente?.empresa || f.cliente?.razonSocial);
    const id = String(f.numero || f.id || "").toLowerCase();

    return (
      (!search || cliente.includes(search) || empresa.includes(search) || id.includes(search)) &&
      (!estado || (f.estadoPago || "").toLowerCase() === estado)
    );

  });

  applySort();

}

/* =========================
   STATES
========================= */

function setEmpty(){
  $("#facturas-body").innerHTML =
    `<tr><td colspan="7">No hay facturas</td></tr>`;
}

function setError(){
  $("#facturas-body").innerHTML =
    `<tr><td colspan="7">Error cargando facturas</td></tr>`;
}

/* =========================
   RENDER (ORIGINAL INTACTO)
========================= */

function render(items){

  const tbody = $("#facturas-body");
  if(!tbody) return;

  const html = items.map(f => {

    const d = mapItem(f);

    const empresaHTML = d.hasEmpresa
      ? `
        <div class="cell-user empresa-cell">
          <div class="table-avatar">${renderAvatarEmpresa(d.empresa)}</div>
          <div class="user-info">
            <span class="user-name">${escapeHTML(d.empresa)}</span>
          </div>
        </div>
      `
      : `<span class="empresa-empty">-</span>`;

    return `
<tr data-id="${d.id}">

  <td class="col-id">${d.numero}</td>

  <td class="col-main">
    <div class="cell-user">
      <div class="table-avatar">${renderAvatar(d.cliente.nombre)}</div>
      <div class="user-info">
        <span class="user-name">${escapeHTML(d.cliente.nombre)}</span>
        <span class="user-sub">${escapeHTML(d.cliente.email)}</span>
      </div>
    </div>
  </td>

  <td class="col-secondary">
    ${empresaHTML}
  </td>

  <td class="col-date">${d.fecha}</td>
  <td class="col-importe">${d.total}</td>

  <td class="col-status">
    <span class="badge ${d.estadoPago.class}">
      ${d.estadoPago.label}
    </span>
  </td>

  <td class="col-actions">
    <div class="actions">
      <button class="btn-action view" data-id="${d.id}">Ver</button>
      <button class="btn-action download" data-id="${d.id}">PDF</button>
      ${
        d.estadoPago.raw === "pendiente"
          ? `<button class="btn-action pay" data-id="${d.id}">Pagar</button>`
          : ``
      }
    </div>
  </td>

</tr>
`;

  }).join("");

  tbody.innerHTML = html;

}

/* =========================
   MAP + HELPERS (INTACTOS)
========================= */

function mapItem(f){

  const empresaRaw = f.cliente?.empresa || f.cliente?.razonSocial;
  const empresaClean = cleanValue(empresaRaw, "");

  return {
    id: f.id,
    numero: f.numeroFacturaLegal || f.numero || f.id,

    cliente: {
      nombre: cleanValue(f.cliente?.nombre || f.cliente?.nombreContacto, "Cliente"),
      email: cleanValue(f.cliente?.email || f.emailCliente, "-")
    },

    empresa: empresaClean,
    hasEmpresa: !!empresaClean,

    fecha: formatFecha(f.fechaFactura || f.fecha),
    total: formatMoney(f.total),

    estadoPago: getEstadoPago(f.estadoPago)
  };

}

function cleanValue(val, fallback){
  if(!val) return fallback;
  let v = String(val).trim();
  const lower = v.toLowerCase();
  if(lower === "null" || lower === "undefined" || lower === "-"){
    return fallback;
  }
  return v;
}

function safeText(val){
  return String(cleanValue(val, "")).toLowerCase();
}

function renderAvatar(name){
  return avatarHTML(getInitials(name), getAvatarColor(name));
}

function renderAvatarEmpresa(name){
  return avatarHTML(getInitialsEmpresa(name), getAvatarColor(name + "_empresa"));
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

function getInitials(name){
  return name ? name.split(" ").map(n=>n[0]).join("").slice(0,2).toUpperCase() : "?";
}

function getInitialsEmpresa(name){
  return name
    ? name.replace(/(SL|SA)/gi,"").trim().split(" ").map(n=>n[0]).join("").slice(0,2).toUpperCase()
    : "?";
}

function getEstadoPago(e){
  e = (e || "").toLowerCase();
  if(e === "pagada") return { label:"Pagada", class:"success", raw:e };
  return { label:"Pendiente", class:"warning", raw:e };
}

function formatFecha(f){
  if(!f) return "--";
  return new Date(f).toLocaleDateString("es-ES");
}

function formatMoney(n){
  return Number(n || 0).toLocaleString("es-ES",{minimumFractionDigits:2}) + " €";
}

function escapeHTML(str){
  return String(str)
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;");
}

function debounce(fn, delay){
  let t;
  return (...args)=>{
    clearTimeout(t);
    t = setTimeout(()=>fn(...args), delay);
  };
}

})();

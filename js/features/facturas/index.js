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

/* 🔥 FILTROS CENTRALIZADOS */
let externalFilters = {
  search: "",
  estado: ""
};

/* 🔥 SORT STATE */
let currentSort = {
  field: null,
  direction: null
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
   NORMALIZE (🔥 FALTABA ESTO)
========================= */

function normalize(res){

  if(!res) return [];

  if(Array.isArray(res)) return res;
  if(Array.isArray(res.facturas)) return res.facturas;
  if(Array.isArray(res.data)) return res.data;
  if(Array.isArray(res.items)) return res.items;

  return [];

}


/* =========================
   LOADER
========================= */

function showLoader(){
  const loader = getRoot()?.querySelector(".table-loader");
  if(loader){
    loader.style.display = "flex";
    loader.style.opacity = "1";
  }
}

function hideLoader(){
  const loader = getRoot()?.querySelector(".table-loader");
  if(loader){
    loader.style.opacity = "0";
    setTimeout(()=> loader.style.display = "none", 250);
  }
}


/* =========================
   LOAD
========================= */

async function loadFacturas(){

  if(loading) return;
  loading = true;

  const tbody = $("#facturas-body");
  if(!tbody){
    loading = false;
    return;
  }

  const requestId = ++currentRequestId;

  showLoader();
  document.activeElement?.blur();

  try{

    await new Promise(r => requestAnimationFrame(r));
    await new Promise(r => requestAnimationFrame(r));

    const res = await Onion.fetch(Onion.config.API + "/facturas");
    const items = normalize(res);

    if(requestId !== currentRequestId) return;

    currentItems = items;
    filteredItems = items;

    if(!items.length){
      setEmpty();
      return;
    }

    applyFilters();

  }catch(e){

    console.error("💥 ERROR FACTURAS:", e);

    if(requestId === currentRequestId){
      setError();
    }

  }finally{
    hideLoader();
    loading = false;
  }

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

    const th = e.target.closest("th[data-sort]");
    if(th) return handleSort(th);

    const btn = e.target.closest(".btn-action");
    if(btn) return handleAction(btn);

    const row = e.target.closest("tr[data-id]");
    if(row){
      Onion.router.navigate("/facturas/detalle?id=" + row.dataset.id);
    }

  });

}


/* =========================
   SORT
========================= */

function handleSort(th){

  const field = th.dataset.sort;

  if(currentSort.field === field){
    currentSort.direction = currentSort.direction === "asc" ? "desc" : "asc";
  }else{
    currentSort.field = field;
    currentSort.direction = "asc";
  }

  updateSortUI();
  applySort();
}

function applySort(){

  if(!currentSort.field){
    return render(filteredItems);
  }

  const dir = currentSort.direction === "asc" ? 1 : -1;

  filteredItems.sort((a,b)=>{

    const A = getSortValue(a, currentSort.field);
    const B = getSortValue(b, currentSort.field);

    if(A > B) return dir;
    if(A < B) return -dir;
    return 0;
  });

  render(filteredItems);
}

function getSortValue(f, field){

  switch(field){
    case "numero": return Number(f.numeroFacturaLegal || f.numero || f.id || 0);
    case "cliente": return safeText(f.cliente?.nombre || f.cliente?.nombreContacto);
    case "empresa": return safeText(f.cliente?.empresa || f.cliente?.razonSocial);
    case "fecha": return new Date(f.fechaFactura || f.fecha || 0).getTime();
    case "total": return Number(f.total || 0);
    case "estadoPago": return safeText(f.estadoPago);
    default: return "";
  }

}

function updateSortUI(){
  document.querySelectorAll("th[data-sort]").forEach(th=>{
    th.classList.remove("asc","desc");
    if(th.dataset.sort === currentSort.field){
      th.classList.add(currentSort.direction);
    }
  });
}


/* =========================
   FILTERS
========================= */

function applyFilters(){

  const search = externalFilters.search.toLowerCase();
  const estado = externalFilters.estado.toLowerCase();

  filteredItems = currentItems.filter(f => {

    const cliente = safeText(f.cliente?.nombre || f.cliente?.nombreContacto);
    const empresa = safeText(f.cliente?.empresa || f.cliente?.razonSocial);
    const id = String(f.numero || f.id || "").toLowerCase();
    const estadoPago = safeText(f.estadoPago);

    return (
      (!search || cliente.includes(search) || empresa.includes(search) || id.includes(search)) &&
      (!estado || estadoPago === estado)
    );

  });

  applySort();
}


/* =========================
   STATES
========================= */

function setEmpty(){
  $("#facturas-body").innerHTML = `<tr><td colspan="7">No hay facturas</td></tr>`;
}

function setError(){
  $("#facturas-body").innerHTML = `<tr><td colspan="7">Error cargando facturas</td></tr>`;
}


/* =========================
   RENDER
========================= */

function render(items){

  const tbody = $("#facturas-body");
  if(!tbody) return;

  if(!items.length) return setEmpty();

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

  <td class="col-secondary">${empresaHTML}</td>

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
</tr>`;
  }).join("");

  tbody.innerHTML = html;
}


/* =========================
   HELPERS
========================= */

function mapItem(f){

  const empresaRaw =
    f.cliente?.empresa ||
    f.cliente?.razonSocial;

  const empresaClean = cleanValue(empresaRaw, "");

  return {
    id: f.id,
    numero: f.numeroFacturaLegal || f.numero || f.id,

    cliente: {
      nombre: cleanValue(
        f.cliente?.nombre ||
        f.cliente?.nombreContacto,
        "Cliente"
      ),
      email: cleanValue(
        f.cliente?.email ||
        f.emailCliente,
        "-"
      )
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
  v = v.replace(/^'+|'+$/g, "");
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


/* =========================
   🔥 CONEXIÓN TOPBAR
========================= */

window.FacturasUIExternal = {
  applyFilters: (uiState)=>{
    externalFilters = uiState || externalFilters;
    applyFilters();
  }
};

})();

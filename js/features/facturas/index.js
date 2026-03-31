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
  loadFacturas();

  Onion.onCleanup(()=> initialized = false);

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
   ACTIONS
========================= */

function handleAction(btn){

  const id = btn.dataset.id;
  if(!id) return;

  if(btn.classList.contains("view")){
    Onion.router.navigate("/facturas/detalle?id=" + id);
  }

  if(btn.classList.contains("download")){
    window.open(Onion.config.API + "/facturas/" + id + "/descargar");
  }

  if(btn.classList.contains("pay")){
    alert("💳 Simulación pago factura " + id);
  }

}

/* =========================
   LOAD
========================= */

async function loadFacturas(){

  if(loading) return;
  loading = true;

  const panel = getRoot();
  const tbody = $("#facturas-body");
  if(!tbody) return;

  panel?.classList.add("loading");

  try{

    const res = await Onion.fetch(Onion.config.API + "/facturas");
    const items = normalize(res);

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

    panel?.classList.remove("loading");
    loading = false;

  }

}

/* =========================
   NORMALIZE
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
   FILTERS
========================= */

function applyFilters(){

  const search = ($("#search-factura")?.value || "").toLowerCase();
  const estado = ($("#filter-estado-factura")?.value || "").toLowerCase();

  filteredItems = currentItems.filter(f => {

    const cliente = safeText(f.cliente?.nombre);
    const empresa = safeText(f.cliente?.empresa);
    const id = String(f.numero || f.id || "").toLowerCase();

    return (
      (!search || cliente.includes(search) || empresa.includes(search) || id.includes(search)) &&
      (!estado || (f.estadoPago || "").toLowerCase() === estado)
    );

  });

  render(filteredItems);

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
   RENDER 🔥 CLAVE
========================= */

function render(items){

  const tbody = $("#facturas-body");
  if(!tbody) return;

  const html = items.map(f => {

    const d = mapItem(f);

    const empresaHTML = d.hasEmpresa
      ? `
        <div class="cell-user">
          <div class="table-avatar">${renderAvatarEmpresa(d.empresa)}</div>
          <div class="user-info">
            <span class="user-name">${escapeHTML(d.empresa)}</span>
          </div>
        </div>
      `
      : `<span style="opacity:.6;">-</span>`;

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
   MAP 🔥 LIMPIO
========================= */

function mapItem(f){

  const empresaRaw =
    f.cliente?.empresa ||
    f.cliente?.razonSocial;

  const empresaClean = cleanValue(empresaRaw, "");

  return {
    id: f.id,
    numero: f.numero || f.id,

    cliente: {
      nombre: cleanValue(
        f.cliente?.nombre ||
        f.cliente?.nombreContacto,
        "Cliente"
      ),
      email: cleanValue(
        f.cliente?.email ||
        f.cliente?.correo,
        "-"
      )
    },

    empresa: empresaClean,
    hasEmpresa: !!empresaClean,

    fecha: formatFecha(f.fecha),
    total: formatMoney(f.total),

    estadoPago: getEstadoPago(f.estadoPago)
  };

}

/* =========================
   CLEANERS
========================= */

function cleanValue(val, fallback){

  if(!val) return fallback;

  const v = String(val).trim().toLowerCase();

  if(v === "null" || v === "undefined" || v === "-"){
    return fallback;
  }

  return val;
}

function safeText(val){
  return String(cleanValue(val, "")).toLowerCase();
}

/* =========================
   AVATAR
========================= */

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

/* =========================
   HELPERS
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

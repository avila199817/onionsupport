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

  Onion.onCleanup(()=>{ initialized = false; });

}

init();

/* =========================
   EVENTS
========================= */

function bindEvents(){

  const root = getRoot();
  if(!root) return;

  Onion.cleanupEvent(root, "click", (e)=>{

    if(e.target.closest("button")) return;

    const row = e.target.closest("tr[data-id]");
    if(!row) return;

    const id = row.dataset.id;
    if(!id) return;

    Onion.router.navigate("/facturas/detalle?id=" + id);

  });

  $("#btn-new-factura")?.addEventListener("click", ()=>{
    Onion.router.navigate("/facturas/nueva");
  });

  $("#search-factura")?.addEventListener("input", debounce(applyFilters, 250));
  $("#filter-estado-factura")?.addEventListener("change", applyFilters);

}

/* =========================
   LOAD
========================= */

async function loadFacturas(){

  const panel = getRoot();
  const tbody = $("#facturas-body");

  if(!tbody) return;

  panel?.classList.remove("ready");
  setLoading();

  try{

    const res = await Onion.fetch(Onion.config.API + "/facturas");
    const items = normalize(res);

    currentItems = items;
    filteredItems = items;

    if(!items.length){
      setEmpty();
      panel?.classList.add("ready");
      return;
    }

    render(items);
    panel?.classList.add("ready");

  }catch(e){

    console.error("💥 ERROR FACTURAS:", e);
    setError();
    panel?.classList.add("ready");

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

    const cliente = (f.cliente?.nombre || "").toLowerCase();
    const empresa = (f.cliente?.empresa || "").toLowerCase();
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

function setLoading(){
  $("#facturas-body").innerHTML =
    `<tr><td colspan="9">Cargando facturas...</td></tr>`;
}

function setEmpty(){
  $("#facturas-body").innerHTML =
    `<tr><td colspan="9">No hay facturas</td></tr>`;
}

function setError(){
  $("#facturas-body").innerHTML =
    `<tr><td colspan="9">Error cargando facturas</td></tr>`;
}

/* =========================
   RENDER
========================= */

function render(items){

  const tbody = $("#facturas-body");
  if(!tbody) return;

  const html = items.map(f => {

    const d = mapItem(f);

    return `
<tr data-id="${d.id}" style="cursor:pointer">

  <td class="col-id">${d.numero}</td>

  <td class="col-main">
    <div class="cell-user">
      <div class="table-avatar">
        ${renderAvatar(d)}
      </div>
      <div class="user-info">
        <span class="user-name">${escapeHTML(d.cliente)}</span>
        <span class="user-sub">${escapeHTML(d.email)}</span>
      </div>
    </div>
  </td>

  <td class="col-secondary">
    <div class="cell-user">
      <div class="table-avatar">
        ${renderAvatarEmpresa(d)}
      </div>
      <div class="user-info">
        <span class="user-name">${escapeHTML(d.empresa)}</span>
      </div>
    </div>
  </td>

  <td class="col-date">${d.fecha}</td>

  <td class="col-importe">${d.total}</td>

  <td class="col-status">
    <span class="badge ${d.estadoPago.class}">
      ${d.estadoPago.label}
    </span>
  </td>

  <td class="col-status">
    <span class="badge ${d.estadoFactura.class}">
      ${d.estadoFactura.label}
    </span>
  </td>

  <td class="col-method">${d.metodo}</td>

  <td class="col-date">${d.fechaEnvio}</td>

</tr>
`;

  }).join("");

  tbody.innerHTML = html;

}

/* =========================
   MAP
========================= */

function mapItem(f){

  return {
    id: f.id,
    numero: f.numero || f.numeroFacturaLegal || f.id || "--",

    cliente: f.cliente?.nombre || "Cliente",
    empresa: f.cliente?.empresa || "-",
    email: f.cliente?.email || "-",

    avatar: f.cliente?.avatar || null,

    fecha: formatFecha(f.fecha),
    total: formatMoney(f.total),

    estadoPago: getEstadoPago(f.estadoPago, f.fecha),
    estadoFactura: getEstadoFactura(f.estado),

    metodo: f.formaPago || "-",
    fechaEnvio: f.fechaEnvio ? formatFecha(f.fechaEnvio) : "-"
  };

}

/* =========================
   AVATAR CLIENTE
========================= */

function renderAvatar(d){

  if(d.avatar){
    return `<img src="${d.avatar}" alt="${escapeHTML(d.cliente)}" />`;
  }

  const initials = getInitials(d.cliente);
  const color = getAvatarColor(d.cliente);

  return avatarHTML(initials, color);
}

/* =========================
   AVATAR EMPRESA 🔥
========================= */

function renderAvatarEmpresa(d){

  const name = d.empresa || "Empresa";
  const initials = getInitialsEmpresa(name);
  const color = getAvatarColor(name);

  return avatarHTML(initials, color);
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
    ? name
        .replace(/(SL|SA|S\.L\.|S\.A\.)/gi,"")
        .trim()
        .split(" ")
        .map(n=>n[0])
        .join("")
        .slice(0,2)
        .toUpperCase()
    : "?";
}

function getEstadoPago(e, fecha){
  e = (e || "").toLowerCase();
  if(e !== "pagada" && isVencida(fecha)) return { label:"Vencida", class:"error" };
  if(e === "pagada") return { label:"Pagada", class:"success" };
  return { label:"Pendiente", class:"warning" };
}

function getEstadoFactura(e){
  e = (e || "").toLowerCase();
  if(e === "emitida") return { label:"Emitida", class:"info" };
  if(e === "borrador") return { label:"Borrador", class:"neutral" };
  if(e === "anulada") return { label:"Anulada", class:"error" };
  return { label:"-", class:"" };
}

function isVencida(fecha){
  if(!fecha) return false;
  return (new Date() - new Date(fecha)) / 86400000 > 30;
}

function formatFecha(f){
  if(!f) return "--";
  return new Date(f).toLocaleDateString("es-ES");
}

function formatMoney(n){
  return Number(n || 0).toLocaleString("es-ES",{minimumFractionDigits:2}) + " €";
}

function escapeHTML(str){
  return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

function debounce(fn, delay){
  let t;
  return (...args)=>{
    clearTimeout(t);
    t = setTimeout(()=>fn(...args), delay);
  };
}

})();

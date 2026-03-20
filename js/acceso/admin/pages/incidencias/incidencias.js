(function(){

"use strict";

console.log("✅ Incidencias JS cargado");


/* =========================
   HELPERS
========================= */

function getRoot(){
  return document.querySelector(".panel-content.incidencias");
}

function getTable(){
  const root = getRoot();
  if(!root) return null;
  return root.querySelector("#incidencias-body");
}


/* =========================
   INIT
========================= */

function init(){

  const tbody = getTable();

  if(!tbody){
    console.warn("❌ #incidencias-body no encontrado");
    return;
  }

  // 🔥 MOCK DATA (luego aquí metes API)
  const data = [
    {
      id: 1,
      titulo: "Servidor caído",
      cliente: "Empresa A",
      estado: "abierta",
      prioridad: "alta",
      fecha: "2026-03-20"
    },
    {
      id: 2,
      titulo: "Error login",
      cliente: "Empresa B",
      estado: "progreso",
      prioridad: "media",
      fecha: "2026-03-19"
    },
    {
      id: 3,
      titulo: "Factura incorrecta",
      cliente: "Empresa C",
      estado: "cerrada",
      prioridad: "baja",
      fecha: "2026-03-18"
    }
  ];

  render(data);
}


/* =========================
   RENDER
========================= */

function render(items){

  const tbody = getTable();
  if(!tbody) return;

  if(!items.length){
    tbody.innerHTML = `
      <tr>
        <td colspan="7">No hay incidencias</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = items.map(i => `
    <tr>

      <td>#${i.id}</td>

      <td>${i.titulo}</td>

      <td>${i.cliente || "-"}</td>

      <td>
        <span class="badge ${i.estado}">
          ${formatEstado(i.estado)}
        </span>
      </td>

      <td>
        <span class="badge ${i.prioridad}">
          ${capitalize(i.prioridad)}
        </span>
      </td>

      <td>${formatFecha(i.fecha)}</td>

      <td>
        <div class="table-actions">

          <button class="action-btn" data-id="${i.id}" data-action="view">
            👁
          </button>

          <button class="action-btn" data-id="${i.id}" data-action="delete">
            🗑
          </button>

        </div>
      </td>

    </tr>
  `).join("");

}


/* =========================
   FORMATTERS
========================= */

function formatEstado(e){
  if(e === "abierta") return "Abierta";
  if(e === "progreso") return "En progreso";
  if(e === "cerrada") return "Cerrada";
  return e;
}

function capitalize(str){
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function formatFecha(f){
  if(!f) return "-";
  const d = new Date(f);
  return d.toLocaleDateString();
}


/* =========================
   START
========================= */

init();

})();

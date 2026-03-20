(function(){

"use strict";

console.log("✅ Facturas JS cargado");


/* =========================
   HELPERS ROOT
========================= */

function getRoot(){
  return document.querySelector(".panel-content.facturas");
}

function getTable(){
  const root = getRoot();
  if(!root) return null;
  return root.querySelector("#facturas-body");
}


/* =========================
   INIT
========================= */

function init(){

  const Onion = window.Onion;

  if(!Onion || !Onion.state?.user){
    return setTimeout(init, 100);
  }

  loadFacturas();

}

init();


/* =========================
   LOAD FACTURAS
========================= */

async function loadFacturas(){

  const tbody = getTable();
  if(!tbody) return;

  try{

    tbody.innerHTML = `
      <tr class="table-loading">
        <td colspan="5">Cargando facturas...</td>
      </tr>
    `;

    const res = await Onion.fetch(Onion.config.API + "/facturas");

    const facturas = res.facturas || res || [];

    if(!facturas.length){
      tbody.innerHTML = `
        <tr>
          <td colspan="5">No hay facturas</td>
        </tr>
      `;
      return;
    }

    renderFacturas(facturas);
    renderStats(facturas);

  }catch(e){

    console.error("💥 FACTURAS ERROR:", e);

    tbody.innerHTML = `
      <tr>
        <td colspan="5">Error cargando facturas</td>
      </tr>
    `;

  }

}


/* =========================
   RENDER TABLE
========================= */

function renderFacturas(facturas){

  const tbody = getTable();
  if(!tbody) return;

  tbody.innerHTML = facturas.map(f => {

    const estado = getEstado(f);

    return `
      <tr>

        <td>#${f.id || f.facturaId || "--"}</td>

        <td>${f.cliente || f.clienteNombre || "Cliente"}</td>

        <td>${formatFecha(f.fecha || f.createdAt)}</td>

        <td>${formatImporte(f.total || f.importe)}</td>

        <td>
          <span class="badge ${estado.class}">
            ${estado.label}
          </span>
        </td>

      </tr>
    `;

  }).join("");

}


/* =========================
   STATS
========================= */

function renderStats(facturas){

  const root = getRoot();
  if(!root) return;

  const totalEl = root.querySelector("#facturas-total");
  const pendientesEl = root.querySelector("#facturas-pendientes");
  const pagadasEl = root.querySelector("#facturas-pagadas");

  let total = 0;
  let pendientes = 0;
  let pagadas = 0;

  facturas.forEach(f => {

    const importe = Number(f.total || f.importe || 0);
    total += importe;

    if(isPagada(f)){
      pagadas++;
    }else{
      pendientes++;
    }

  });

  if(totalEl) totalEl.textContent = formatImporte(total);
  if(pendientesEl) pendientesEl.textContent = pendientes;
  if(pagadasEl) pagadasEl.textContent = pagadas;

}


/* =========================
   HELPERS
========================= */

function isPagada(f){
  return f.estado === "pagada" || f.pagada === true;
}

function getEstado(f){

  if(isPagada(f)){
    return { label: "Pagada", class: "pagada" };
  }

  return { label: "Pendiente", class: "pendiente" };

}

function formatFecha(date){

  if(!date) return "--";

  const d = new Date(date);
  return d.toLocaleDateString("es-ES");

}

function formatImporte(n){

  const num = Number(n || 0);
  return num.toFixed(2) + "€";

}

})();

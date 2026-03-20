(function(){

"use strict";

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

  const tbody = document.getElementById("facturas-body");
  if(!tbody) return;

  try{

    tbody.innerHTML = `
      <tr><td colspan="5">Cargando facturas...</td></tr>
    `;

    const res = await Onion.fetch(Onion.config.API + "/facturas");

    const facturas = res.facturas || res || [];

    if(!facturas.length){
      tbody.innerHTML = `
        <tr><td colspan="5">No hay facturas</td></tr>
      `;
      return;
    }

    renderFacturas(facturas);
    renderStats(facturas);

  }catch(e){

    console.error("💥 FACTURAS ERROR:", e);

    tbody.innerHTML = `
      <tr><td colspan="5">Error cargando facturas</td></tr>
    `;

  }

}


/* =========================
   RENDER TABLE
========================= */

function renderFacturas(facturas){

  const tbody = document.getElementById("facturas-body");

  tbody.innerHTML = facturas.map(f => {

    const estado = getEstado(f);

    return `
      <tr>
        <td>#${f.id || f.facturaId || "--"}</td>
        <td>${f.cliente || f.clienteNombre || "Cliente"}</td>
        <td>${formatFecha(f.fecha || f.createdAt)}</td>
        <td>${formatImporte(f.total || f.importe)}</td>
        <td><span class="badge ${estado.class}">${estado.label}</span></td>
      </tr>
    `;

  }).join("");

}


/* =========================
   STATS
========================= */

function renderStats(facturas){

  const totalEl = document.getElementById("facturas-total");
  const pendientesEl = document.getElementById("facturas-pendientes");
  const pagadasEl = document.getElementById("facturas-pagadas");

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
    return { label: "Pagada", class: "paid" };
  }

  return { label: "Pendiente", class: "pending" };

}

function formatFecha(date){

  if(!date) return "--";

  const d = new Date(date);

  return d.toLocaleDateString("es-ES");

}

function formatImporte(n){

  if(!n) return "0€";

  return Number(n).toFixed(2) + "€";

}

})();
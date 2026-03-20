/* =====================================================
   FACTURAS · PAGE ENGINE
   ONION PANEL · FINAL PRO
===================================================== */

(function(){

"use strict";

if(window.__onionFacturasLoaded) return;
window.__onionFacturasLoaded = true;


/* =====================================================
   STATE
===================================================== */

let tbody = null;


/* =====================================================
   INIT SAFE (ANTI RACE CONDITION)
===================================================== */

function start(){

  if(window.Onion?.state?.user){
    init();
  }else{
    window.addEventListener("onion:user-ready", init, { once:true });
  }

}

start();


/* =====================================================
   HELPERS
===================================================== */

const safe = v =>
  v && String(v).trim() !== "" ? v : "-";


const formatDate = v => {

  if(!v) return "-";

  const d = new Date(v);

  if(isNaN(d)) return "-";

  return d.toLocaleDateString("es-ES");

};


function badgeEstado(estado){

  if(estado === "pagada"){
    return `<span class="badge badge-paid">Pagada</span>`;
  }

  return `<span class="badge badge-pending">Pendiente</span>`;

}


/* =====================================================
   RENDER FACTURAS
===================================================== */

function renderFacturas(facturas = []){

  if(!facturas.length){
    renderState("No hay facturas.","empty");
    return;
  }

  const html = facturas.map(f => {

    const numero = safe(f.numero);
    const fechaServicio = formatDate(f.fechaServicio);
    const cliente = safe(f.cliente);
    const importe = window.eur ? eur(Number(f.total || 0)) : f.total;

    const estado =
      f.estadoPago === "pagada"
      ? "pagada"
      : "pendiente";

    return `

<tr>

<td class="factura-numero" data-id="${f.id}">
${numero}
</td>

<td>${fechaServicio}</td>
<td>${cliente}</td>
<td>${importe}</td>

<td>
${badgeEstado(estado)}
</td>

<td>

${
estado === "pagada"
? `<button class="btn-pagada" disabled>Pagada</button>`
: `<button class="btn-pagar" data-id="${f.id}">Pagar</button>`
}

</td>

<td>

<div class="factura-actions">

<button class="btn-descargar" data-id="${f.id}">
Descargar
</button>

<button class="btn-enviar" data-id="${f.id}">
📤
</button>

</div>

</td>

</tr>

`;

  }).join("");

  tbody.innerHTML = html;

}


/* =====================================================
   STATE RENDER
===================================================== */

function renderState(message,cls="loading"){

  tbody.innerHTML = `
<tr>
<td colspan="7" class="${cls}">
${message}
</td>
</tr>
`;

}


/* =====================================================
   TABLE ACTIONS
===================================================== */

function initTableActions(){

  tbody.addEventListener("click", async e => {

    const btn = e.target.closest("button, .factura-numero");
    if(!btn) return;


    /* ===== ABRIR ===== */

    if(btn.classList.contains("factura-numero")){

      const id = btn.dataset.id;

      Onion.go(`/facturas/factura?id=${id}`);
      return;

    }


    /* ===== PAGAR ===== */

    if(btn.classList.contains("btn-pagar")){

      const id = btn.dataset.id;

      Onion.go(`/facturas/pagar?id=${id}`);
      return;

    }


    /* ===== DESCARGAR ===== */

    if(btn.classList.contains("btn-descargar")){

      const id = btn.dataset.id;

      if(btn.disabled) return;

      const original = btn.innerHTML;

      btn.disabled = true;
      btn.innerHTML = "Descargando...";

      try{

        const json = await Onion.fetch(
          Onion.config.API + `/facturas/${id}/descargar`
        );

        if(json?.url){

          window.open(json.url,"_blank","noopener");

          btn.innerHTML = "✔";

          setTimeout(()=>{
            btn.innerHTML = original;
            btn.disabled = false;
          },1500);

        }else{
          throw new Error();
        }

      }catch{

        btn.innerHTML = original;
        btn.disabled = false;

        window.toast?.error?.("No se pudo descargar");

      }

      return;

    }


    /* ===== ENVIAR ===== */

    if(btn.classList.contains("btn-enviar")){

      const id = btn.dataset.id;

      if(btn.disabled) return;

      const original = btn.innerHTML;

      btn.disabled = true;
      btn.innerHTML = "⏳";

      try{

        await Onion.fetch(
          Onion.config.API + `/facturas/${id}/enviar`,
          { method:"POST" }
        );

        btn.innerHTML = "✔";

        window.toast?.success?.("Factura enviada 📤");

        setTimeout(()=>{
          btn.innerHTML = original;
          btn.disabled = false;
        },2000);

        window.cache?.remove?.("facturas");

      }catch(err){

        btn.innerHTML = original;
        btn.disabled = false;

        window.toast?.error?.(
          err?.message || "Error enviando factura"
        );

      }

      return;

    }

  });

}


/* =====================================================
   FETCH FACTURAS
===================================================== */

async function fetchFacturas(){

  const json = await window.cache?.instant?.(

    "facturas",

    () => Onion.fetch(Onion.config.API + "/facturas")

  );

  return json?.facturas || [];

}


/* =====================================================
   INIT
===================================================== */

async function init(){

  tbody = document.getElementById("facturas-body");
  if(!tbody) return;

  try{

    initTableActions();

    renderState("Cargando facturas…");

    const facturas = await fetchFacturas();

    renderFacturas(facturas);

  }catch(err){

    console.error("FACTURAS ERROR:", err);
    window.toast?.error?.("Error cargando facturas");

  }

}

})();
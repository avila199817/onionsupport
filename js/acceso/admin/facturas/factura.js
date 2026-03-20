document.addEventListener("DOMContentLoaded", async () => {

/* =========================
   TOAST
========================= */

function showToast(message, type="success"){

let container=document.querySelector(".toast-container");

if(!container){
container=document.createElement("div");
container.className="toast-container";
document.body.appendChild(container);
}

const toast=document.createElement("div");

toast.className=`toast toast-${type}`;
toast.textContent=message;

toast.style.opacity="0";
toast.style.transform="translateX(40px)";

container.appendChild(toast);

requestAnimationFrame(()=>{
toast.style.opacity="1";
toast.style.transform="translateX(0)";
});

setTimeout(()=>{

toast.style.opacity="0";
toast.style.transform="translateX(40px)";

setTimeout(()=>toast.remove(),300);

},3000);

}


/* =========================
   HELPERS
========================= */

const dom=id=>document.getElementById(id);

const safe=v=>v||"-";

const formatDate=d=>{
if(!d) return "-";
const date=new Date(d);
if(isNaN(date)) return "-";
return date.toLocaleDateString("es-ES");
};

const money=v=>
typeof v==="number"
? new Intl.NumberFormat("es-ES",{style:"currency",currency:"EUR"}).format(v)
: "-";

const badgeEstado=estado=>
estado==="pagada"
? `<span class="badge badge-paid">Pagada</span>`
: `<span class="badge badge-pending">Pendiente</span>`;


/* =========================
   FETCH JSON
========================= */

async function fetchJSON(url,options={}){

const res=await fetch(url,options);

let json=null;

try{
json=await res.json();
}catch{}

if(res.status===401 || res.status===403){
localStorage.removeItem("onion_token");
location.href="/es/acceso/";
return;
}

if(!res.ok){
throw new Error(json?.error || "Error servidor");
}

return json;

}


/* =========================
   ID FACTURA URL
========================= */

function getFacturaId(){
const params=new URLSearchParams(window.location.search);
return params.get("id");
}

const facturaUrlId=getFacturaId();

if(!facturaUrlId){

document.body.innerHTML=`
<div style="padding:40px;font-family:system-ui">
<h2>Error</h2>
<p>No se pudo identificar la factura.</p>
</div>
`;

return;

}


/* =========================
   TOKEN
========================= */

const token=localStorage.getItem("onion_token");

if(!token){
location.href="/es/acceso/";
return;
}

const authHeaders={
Authorization:`Bearer ${token}`,
"Content-Type":"application/json"
};


/* =========================
   FACTURA REAL
========================= */

let facturaReal=null;


/* =========================
   LOAD FACTURA
========================= */

async function loadFactura(){

const json=await fetchJSON(
`https://api.onionit.net/api/facturas/${facturaUrlId}`,
{headers:authHeaders}
);

facturaReal=json.factura || json;

return facturaReal;

}


/* =========================
   LOGO CLIENTE
========================= */

function pintarLogoCliente(cliente){

const avatar=dom("clienteAvatar");

if(!avatar) return;

const logo=cliente?.logo;

if(logo){

avatar.innerHTML=`
<img src="${logo}"
style="width:100%;height:100%;object-fit:contain;">
`;

}else{

const iniciales=
(cliente?.razonSocial || "CL")
.substring(0,2)
.toUpperCase();

avatar.innerHTML=`
<div style="font-weight:600;font-size:22px;color:#666;">
${iniciales}
</div>
`;

}

}


/* =========================
   PINTAR FACTURA
========================= */

function pintarFactura(f){

/* TITULO */

if(dom("numeroFactura")){
dom("numeroFactura").textContent=
"Factura "+
safe(
f.numeroFacturaLegal ||
f.numeroFacturaSistema
);
}

/* ESTADO */

if(dom("estadoPago")){
dom("estadoPago").innerHTML=
badgeEstado(f.estadoPago);
}

/* LOGO CLIENTE */

pintarLogoCliente(f.cliente);


/* =========================
   DATOS FACTURA
========================= */

if(dom("numeroSistema"))
dom("numeroSistema").textContent=safe(f.numeroFacturaSistema);

if(dom("serie"))
dom("serie").textContent=safe(f.serie);

if(dom("fechaFactura"))
dom("fechaFactura").textContent=formatDate(f.fechaFactura);

if(dom("fechaServicio"))
dom("fechaServicio").textContent=formatDate(f.fechaServicio);

if(dom("moneda"))
dom("moneda").textContent=safe(f.moneda);


/* =========================
   CLIENTE
========================= */

if(dom("clienteEmpresa"))
dom("clienteEmpresa").textContent=safe(f.cliente?.razonSocial);

if(dom("clienteContacto"))
dom("clienteContacto").textContent=safe(f.cliente?.nombreContacto);

if(dom("clienteNif"))
dom("clienteNif").textContent=safe(f.cliente?.nif);

if(dom("clienteCalle"))
dom("clienteCalle").textContent=safe(f.cliente?.direccion?.calle);

if(dom("clienteCp"))
dom("clienteCp").textContent=safe(f.cliente?.direccion?.cp);

if(dom("clienteCiudad"))
dom("clienteCiudad").textContent=safe(f.cliente?.direccion?.ciudad);

if(dom("clientePais"))
dom("clientePais").textContent=safe(f.cliente?.direccion?.pais);


/* =========================
   DIRECCION SERVICIO
========================= */

if(dom("servicioCalle"))
dom("servicioCalle").textContent=safe(f.direccionServicio?.calle);

if(dom("servicioCp"))
dom("servicioCp").textContent=safe(f.direccionServicio?.cp);

if(dom("servicioCiudad"))
dom("servicioCiudad").textContent=safe(f.direccionServicio?.ciudad);

if(dom("servicioPais"))
dom("servicioPais").textContent=safe(f.direccionServicio?.pais);


/* =========================
   IMPORTES
========================= */

if(dom("baseImponible"))
dom("baseImponible").textContent=money(f.baseImponible);


/* IMPUESTOS */

if(dom("impuestos")){

let html="";

(f.impuestos||[]).forEach(i=>{

html+=`
<div>
<span>${safe(i.tipo)} (${safe(i.porcentaje)}%)</span>
<span>${money(i.importe)}</span>
</div>
`;

});

dom("impuestos").innerHTML=html;

}


/* TOTAL */

if(dom("totalFactura"))
dom("totalFactura").textContent=money(f.total);


/* =========================
   LINEAS
========================= */

const tbody=dom("facturaLineas");

if(tbody){

tbody.innerHTML="";

(f.lineas||[]).forEach(l=>{

const tr=document.createElement("tr");

tr.innerHTML=`
<td>${safe(l.concepto)}</td>
<td>${safe(l.descripcion)}</td>
<td>${safe(l.cantidad)}</td>
<td>${money(l.precioUnitario)}</td>
<td>${money(l.totalLinea)}</td>
`;

tbody.appendChild(tr);

});

}

}


/* =========================
   DESCARGAR PDF
========================= */

let descargando=false;

async function descargarFactura(){

if(descargando) return;
if(!facturaReal?.id) return;

descargando=true;

const btn=dom("downloadFacturaBtn");

if(btn) btn.textContent="Descargando…";

try{

const json=await fetchJSON(
`https://api.onionit.net/api/facturas/${facturaReal.id}/descargar`,
{headers:authHeaders}
);

if(json?.url){

window.open(json.url,"_blank","noopener");

showToast("Factura descargada correctamente");

}else{

showToast("No se pudo obtener el PDF","error");

}

}catch(err){

console.error(err);

showToast("Error descargando factura","error");

}

if(btn) btn.textContent="Descargar PDF";

descargando=false;

}


/* =========================
   ENVIAR FACTURA
========================= */

let enviando=false;

async function enviarFactura(){

if(enviando) return;
if(!facturaReal?.id) return;

enviando=true;

const btn=dom("sendFacturaBtn");

if(btn) btn.textContent="Enviando…";

try{

await fetchJSON(
`https://api.onionit.net/api/facturas/${facturaReal.id}/enviar`,
{
method:"POST",
headers:authHeaders
}
);

showToast("Factura enviada correctamente 📤");

}catch(err){

console.error(err);

showToast("Error enviando factura","error");

}

if(btn) btn.textContent="Enviar por correo";

enviando=false;

}


/* =========================
   BOTONES
========================= */

const btnDescargar=dom("downloadFacturaBtn");
const btnEnviar=dom("sendFacturaBtn");

if(btnDescargar)
btnDescargar.addEventListener("click",descargarFactura);

if(btnEnviar)
btnEnviar.addEventListener("click",enviarFactura);


/* =========================
   INIT
========================= */

try{

const factura=await loadFactura();

pintarFactura(factura);

}catch(err){

console.error("FACTURA ERROR:",err);

document.body.innerHTML=`
<div style="padding:40px;font-family:system-ui">
<h2>Error cargando factura</h2>
<p>No se pudo obtener la información.</p>
</div>
`;

}

});
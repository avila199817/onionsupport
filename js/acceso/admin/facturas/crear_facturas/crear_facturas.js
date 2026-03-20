/* =====================================================
   CREATE FACTURA · ONION PANEL ENGINE
   FULL SAAS PRO VERSION
===================================================== */

(function(){

"use strict";

window.addEventListener("onion:core-ready", init);


/* =====================================================
   STATE
===================================================== */

let form;

let clientSearchInput;
let clientIdInput;
let clientTypeInput;
let clientNameSelect;
let clientEmailInput;

let resultsBox;

let quantityInput;
let priceInput;
let taxInput;
let irpfInput;

let subtotalInput;
let taxTotalInput;
let irpfTotalInput;
let totalInput;

let irpfGroup;
let irpfTotalGroup;

let submitBtn;

let searchTimer;
let searchCache = new Map();
let abortController = null;


/* =====================================================
   HELPERS
===================================================== */

function capitalize(str){
if(!str) return "";
return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

function formatMoney(n){
return (n || 0).toFixed(2) + " €";
}


/* =====================================================
   CREATE RESULTS BOX
===================================================== */

function createResultsBox(){

resultsBox = document.createElement("div");

resultsBox.id = "clientSearchResults";
resultsBox.style.position = "absolute";
resultsBox.style.zIndex = "900";
resultsBox.style.display = "none";

document.body.appendChild(resultsBox);

}


/* =====================================================
   POSITION RESULTS
===================================================== */

function positionResults(){

const rect = clientSearchInput.getBoundingClientRect();

resultsBox.style.left = rect.left + "px";
resultsBox.style.top = rect.bottom + window.scrollY + "px";
resultsBox.style.width = rect.width + "px";

}


/* =====================================================
   RENDER RESULTS
===================================================== */

function renderResults(clientes=[]){

if(!clientes.length){
resultsBox.style.display="none";
resultsBox.innerHTML="";
return;
}

positionResults();

resultsBox.innerHTML = clientes.map(c=>`

<div
class="search-result-item"
data-id="${c.clientId}"
data-name="${c.name}"
data-email="${c.email}"
data-tipo="${c.tipo}"
data-contactos='${JSON.stringify(c.contactos || [])}'
>

${c.label}

</div>

`).join("");

resultsBox.style.display="block";

}


/* =====================================================
   SELECT CLIENT
===================================================== */

function selectClient(client){

clientSearchInput.value = client.name;

clientIdInput.value = client.clientId;

/* CAPITALIZAR TIPO */
const tipoCapitalizado = capitalize(client.tipo);
clientTypeInput.value = tipoCapitalizado;

clientEmailInput.value = client.email || "";

/* CONTACTOS */
clientNameSelect.innerHTML = `<option value="">Selecciona contacto</option>`;

if(client.contactos){
for(const c of client.contactos){
const opt = document.createElement("option");
opt.value = c.id;
opt.textContent = `${c.nombre} — ${c.email}`;
clientNameSelect.appendChild(opt);
}
}

clientNameSelect.disabled = false;

/* LOGICA IRPF */
if(client.tipo === "empresa"){

irpfGroup.style.visibility = "visible";
irpfGroup.style.height = "auto";

irpfTotalGroup.style.visibility = "visible";
irpfTotalGroup.style.height = "auto";

}else{

irpfGroup.style.visibility = "hidden";
irpfGroup.style.height = "0";

irpfTotalGroup.style.visibility = "hidden";
irpfTotalGroup.style.height = "0";

}

calculateInvoice();

resultsBox.style.display="none";

}


/* =====================================================
   RESULT CLICK
===================================================== */

function initResultClick(){

resultsBox.addEventListener("click",(e)=>{

const item = e.target.closest(".search-result-item");
if(!item) return;

const client={

clientId:item.dataset.id,
name:item.dataset.name,
email:item.dataset.email,
tipo:item.dataset.tipo,
contactos:JSON.parse(item.dataset.contactos)

};

selectClient(client);

});

}


/* =====================================================
   SEARCH CLIENTES
===================================================== */

async function searchClientes(q){

if(searchCache.has(q)){
renderResults(searchCache.get(q));
return;
}

if(abortController){
abortController.abort();
}

abortController = new AbortController();

try{

const json = await fetchJSON(
`${API}/admin/search/clientes/search?q=${encodeURIComponent(q)}`,
{
headers:getHeaders(),
signal:abortController.signal
}
);

const clientes = json?.clientes || [];

searchCache.set(q,clientes);

renderResults(clientes);

}catch(err){

if(err.name !== "AbortError"){
console.error("CLIENT SEARCH ERROR:",err.message);
}

}

}


/* =====================================================
   INPUT SEARCH
===================================================== */

function initSearch(){

clientSearchInput.addEventListener("input",(e)=>{

const q = e.target.value.trim();

clearTimeout(searchTimer);

if(q.length < 2){
renderResults([]);
return;
}

searchTimer = setTimeout(()=>{
searchClientes(q);
},250);

});

}


/* =====================================================
   CALCULATOR
===================================================== */

function initCalculator(){

quantityInput = qs("item_quantity");
priceInput = qs("item_price");
taxInput = qs("tax");
irpfInput = qs("irpf");

subtotalInput = qs("subtotal");
taxTotalInput = qs("tax_total");
irpfTotalInput = qs("irpf_total");
totalInput = qs("total");

irpfGroup = qs("irpf-group");
irpfTotalGroup = qs("irpf-total-group");

[quantityInput,priceInput].forEach(el=>{
el.addEventListener("input",calculateInvoice);
});

calculateInvoice();

}


function calculateInvoice(){

const quantity = parseFloat(quantityInput.value) || 0;
const price = parseFloat(priceInput.value) || 0;
const tax = parseFloat(taxInput.value) || 0;
const irpf = parseFloat(irpfInput?.value || 0);

const subtotal = quantity * price;
const iva = subtotal * (tax/100);

/* SOLO EMPRESA */
const isEmpresa = clientTypeInput.value.toLowerCase() === "empresa";
const irpfValue = isEmpresa ? subtotal * (irpf/100) : 0;

const total = subtotal + iva - irpfValue;

subtotalInput.value = formatMoney(subtotal);
taxTotalInput.value = formatMoney(iva);
irpfTotalInput.value = formatMoney(irpfValue);
totalInput.value = formatMoney(total);

}


/* =====================================================
   CREATE FACTURA
===================================================== */

async function createFactura(e){

e.preventDefault();

/* BOTON LOADING */
submitBtn.disabled = true;
const originalText = submitBtn.textContent;
submitBtn.textContent = "Creando...";

try{

const payload = {

clienteId: clientIdInput.value,
fechaFactura: qs("invoice_date").value,
horas: qs("item_quantity").value,
precioUnitario: qs("item_price").value,
descripcion: qs("item_description").value

};

if(!payload.clienteId){
toast.error("Selecciona un cliente");
submitBtn.disabled = false;
submitBtn.textContent = originalText;
return;
}

const json = await fetchJSON(
`${API}/facturas`,
{
method:"POST",
headers:getHeaders(),
body:JSON.stringify(payload)
}
);

if(!json?.ok){
throw new Error("Error backend");
}

toast.success("Factura creada correctamente");

setTimeout(()=>{
window.location.href="/es/acceso/admin/facturas/";
},1200);

}catch(err){

console.error("CREATE FACTURA ERROR:",err.message);

toast.error("Error creando factura");

/* RESTORE BOTON */
submitBtn.disabled = false;
submitBtn.textContent = originalText;

}

}


/* =====================================================
   INIT
===================================================== */

function init(){

form = qs("createInvoiceForm");
clientSearchInput = qs("clientSearch");

if(!form || !clientSearchInput) return;

clientIdInput = qs("client_id");
clientTypeInput = qs("client_type");
clientNameSelect = qs("client_name");
clientEmailInput = qs("client_email");

submitBtn = form.querySelector("button[type='submit']");

createResultsBox();

initSearch();
initResultClick();
initCalculator();

form.addEventListener("submit",createFactura);

}

})();
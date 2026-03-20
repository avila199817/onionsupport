(function(){

"use strict";

console.log("✅ Incidencias JS cargado");

function getRoot(){
  return document.querySelector(".panel-content");
}

function getTable(){
  const root = getRoot();
  if(!root) return null;
  return root.querySelector("#incidencias-body");
}

function init(){

  const tbody = getTable();

  if(!tbody){
    console.warn("❌ #incidencias-body no encontrado");
    return;
  }

  const data = [
    { id: 1, titulo: "Servidor caído", estado: "Pendiente" },
    { id: 2, titulo: "Error login", estado: "Resuelto" },
    { id: 3, titulo: "Factura incorrecta", estado: "Pendiente" }
  ];

  render(data);
}

function render(items){

  const tbody = getTable();
  if(!tbody) return;

  tbody.innerHTML = items.map(i => `
    <tr>
      <td>#${i.id}</td>
      <td>${i.titulo}</td>
      <td>
        <span class="badge ${i.estado === "Resuelto" ? "ok" : "pending"}">
          ${i.estado}
        </span>
      </td>
    </tr>
  `).join("");
}

init();

})();
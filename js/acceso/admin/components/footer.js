/* =====================================================
   FOOTER LOADER · ONION PRO
===================================================== */

(function(){

"use strict";

/* evitar doble carga */
if(window.__onionFooterLoaded) return;
window.__onionFooterLoaded = true;


/* =====================================================
   INIT
===================================================== */

if(document.readyState === "complete"){
  loadFooter();
}else{
  window.addEventListener("onion:app-ready", loadFooter);
}


/* =====================================================
   LOAD FOOTER
===================================================== */

async function loadFooter(){

console.log("FOOTER LOAD");

const container = document.getElementById("footer-container");
if(!container) return;

try{

  const res = await fetch("/es/acceso/admin/partials/footer.html");

  if(!res.ok){
    throw new Error("FOOTER HTML ERROR");
  }

  container.innerHTML = await res.text();

}catch(err){

  console.error("FOOTER LOAD ERROR:", err);

}

}

})();
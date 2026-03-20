/* =====================================================
   ONION LOADER · PRO
===================================================== */

(function(){

"use strict";

function getLoader(){
return document.getElementById("app-loader");
}

let loaderStartTime = 0;


/* =====================================================
   START (manual)
===================================================== */

window.loaderStart = function(){

const loader = getLoader();
if(!loader) return;

loader.style.display = "flex";
loader.classList.remove("hide");

loaderStartTime = performance.now();

};


/* =====================================================
   END (manual)
===================================================== */

window.loaderEnd = function(){

const loader = getLoader();
if(!loader) return;

const elapsed = performance.now() - loaderStartTime;
const minTime = 500;

const delay = Math.max(minTime - elapsed,0);

setTimeout(()=>{

loader.classList.add("hide");

setTimeout(()=>{
loader.style.display = "none";
},350);

},delay);

};


/* =====================================================
   CORE READY (AUTOMÁTICO)
===================================================== */

window.addEventListener("onion:app-ready",()=>{

window.loaderEnd();

});


})();
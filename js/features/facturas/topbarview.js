"use strict";

(function(){

  function init(){

    const btn = document.getElementById("btn-new-factura");
    if(!btn) return;

    const user = window.Onion?.user;

    // 🔥 SOLO ADMIN VE EL BOTÓN
    if(!user || user.role !== "admin"){
      btn.remove(); // o btn.style.display = "none";
      return;
    }

    btn.addEventListener("click", ()=>{
      console.log("crear factura");
    });

  }

  requestAnimationFrame(init);

})();

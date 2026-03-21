(function(){

"use strict";

console.log("✅ Cuenta JS PRO cargado");


/* =========================
   ROOT
========================= */

function root(){
  return document.querySelector(".panel-content.cuenta");
}

function $(sel){
  return root()?.querySelector(sel);
}


/* =========================
   INIT
========================= */

function init(){

  const Onion = window.Onion;

  if(!Onion || !Onion.state?.user){
    return setTimeout(init, 100);
  }

  load();

}

init();


/* =========================
   LOAD
========================= */

async function load(){

  try{

    const Onion = window.Onion;
    const user = Onion.state.user;

    if(!user?.userId){
      throw new Error("NO_USER");
    }

    const data = await Onion.fetch(
      Onion.config.API + "/users/" + user.userId
    );

    render(data);

  }catch(e){

    console.error("💥 CUENTA ERROR:", e);

  }

}


/* =========================
   RENDER
========================= */

function render(u){

  if(!u) return;

  // 🔥 NORMALIZACIÓN (por si backend cambia nombres)
  const id = u.id || u.userId;
  const nombre = u.nombre || u.name || "Usuario";
  const email = u.email || "--";
  const rol = u.role || "user";
  const created = u.createdAt || u.created || null;
  const plan = u.plan || "Go Plan";
  const avatar = u.avatar || null;


  /* =========================
     KPI
  ========================= */

  setText("#cuenta-plan", plan);
  setText("#cuenta-email", email);
  setText("#cuenta-fecha", formatFecha(created));


  /* =========================
     PERFIL
  ========================= */

  setText("#cuenta-nombre", nombre);
  setText("#cuenta-rol", formatRol(rol));
  setText("#cuenta-id", "ID: " + id);


  /* =========================
     AVATAR (si tienes img en HTML)
  ========================= */

  const img = $("#cuenta-avatar");
  if(img && avatar){
    img.src = avatar;
  }


  /* =========================
     ESTADO CUENTA
  ========================= */

  const statusBox = root()?.querySelector(".alert-list");

  if(statusBox){

    statusBox.innerHTML = `
      <div class="alert-item info">
        Cuenta activa
      </div>

      <div class="alert-item info">
        Email verificado: ${u.emailVerified ? "Sí" : "No"}
      </div>

      ${u.hasAvatar ? `
        <div class="alert-item info">
          Avatar configurado
        </div>
      ` : ``}
    `;

  }

}


/* =========================
   HELPERS
========================= */

function setText(selector, value){
  const el = document.querySelector(selector);
  if(el) el.textContent = value ?? "--";
}

function formatFecha(f){
  if(!f) return "--";

  const d = new Date(f);

  return d.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function formatRol(r){

  if(r === "admin") return "Administrador";
  if(r === "user") return "Usuario";

  return r;
}

})();

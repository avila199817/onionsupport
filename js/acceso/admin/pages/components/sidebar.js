(function(){

"use strict";

if(window.__sidebarInit) return;
window.__sidebarInit = true;


/* =========================
   RENDER SIDEBAR (GLOBAL)
========================= */

window.renderSidebar = function(){

  const Onion = window.Onion;
  const user = Onion?.state?.user;

  // 👉 sin usuario no hacemos nada
  if(!user) return;

  const nameEl = document.getElementById("sidebar-name");
  const avatarEl = document.getElementById("sidebar-avatar");

  // 👉 si el DOM aún no está listo, salimos (el core lo volverá a llamar)
  if(!nameEl || !avatarEl) return;


  /* =========================
     NAME
  ========================= */

  const name =
    user.name ||
    user.username ||
    user.email ||
    "Usuario";

  nameEl.textContent = name;


  /* =========================
     AVATAR
  ========================= */

  avatarEl.innerHTML = "";

  if(user.avatar){

    const img = document.createElement("img");
    img.src = user.avatar;
    img.alt = "avatar";

    img.style.width = "100%";
    img.style.height = "100%";
    img.style.borderRadius = "50%";
    img.style.objectFit = "cover";

    avatarEl.appendChild(img);

  }else{

    const initials = name
      .split(" ")
      .map(n => n[0])
      .join("")
      .substring(0,2)
      .toUpperCase();

    avatarEl.textContent = initials;

  }

  console.log("✅ SIDEBAR OK");

};


/* =========================
   OPCIONAL: activar link activo
========================= */

window.updateSidebarActive = function(){

  const links = document.querySelectorAll(".sidebar a[data-link]");
  const route = window.Onion?.router?.get?.();

  links.forEach(a => {
    const href = a.getAttribute("href");

    if(href === route){
      a.classList.add("active");
    }else{
      a.classList.remove("active");
    }
  });

};

})();
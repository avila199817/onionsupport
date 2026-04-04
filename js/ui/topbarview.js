/* =========================================================
   ROLES SYSTEM — BASE LIMPIA (READY)
========================================================= */

(function(){

  if(!window.Onion) return;

  /* =========================
     HELPERS
  ========================= */

  function getUser(){
    return Onion.state?.user || null;
  }

  function getRole(){
    return getUser()?.role || "guest";
  }

  function isAdmin(){
    return getRole() === "admin";
  }

  function isUser(){
    return getRole() === "user";
  }

  /* =========================
     UI APPLY
  ========================= */

  function applyRoleUI(){

    const role = getRole();

    // 🔥 ejemplo: botones admin
    document.querySelectorAll('[data-role="admin"]').forEach(el=>{
      el.style.display = isAdmin() ? "" : "none";
    });

    // 🔥 ejemplo: solo users
    document.querySelectorAll('[data-role="user"]').forEach(el=>{
      el.style.display = isUser() ? "" : "none";
    });

    // 🔥 debug opcional
    console.log("👤 ROLE:", role);
  }

  /* =========================
     HOOK SPA
  ========================= */

  if(!Onion.__rolesHooked){

    Onion.__rolesHooked = true;

    const originalRender = Onion.render;

    Onion.render = async function(){

      const result = await originalRender.apply(this, arguments);

      applyRoleUI();

      return result;
    };

  }else{
    window.addEventListener("load", applyRoleUI);
  }

})();

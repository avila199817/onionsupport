"use strict";

(function(){

  if(!window.Onion){
    console.error("💥 Onion no definido (init.js)");
    return;
  }

  const Onion = window.Onion;

  Onion.init = async function(){

    try{

      const token = Onion.auth?.getToken?.();

      if(!token){
        console.warn("⚠️ No token → redirect login");
        Onion.auth?.redirectLogin?.();
        return;
      }

      /* 🔥 VALIDAR TOKEN CON BACKEND */
      const res = await Onion.fetch?.("/auth/me");

      if(!res || !res.user){
        throw new Error("Token inválido");
      }

      Onion.setUser(res.user);

      console.log("✅ Usuario cargado:", res.user);

    }catch(e){

      console.error("💥 INIT AUTH ERROR:", e);

      Onion.auth?.resetSession?.();
      Onion.auth?.redirectLogin?.();

    }

  };

})();

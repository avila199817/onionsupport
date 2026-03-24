Onion.init = async function(){

  // 🔥 LOCK REAL
  if(Onion.state._initializing){
    Onion.warn?.("⚠️ INIT en curso");
    return;
  }

  if(Onion.state.ready){
    Onion.warn?.("⚠️ INIT ya ejecutado");
    return;
  }

  Onion.state._initializing = true;

  Onion.log?.("🚀 INIT START");

  try{

    /* =========================
       AUTH
    ========================= */

    let user = null;

    try{

      const res = await Onion.fetch?.(Onion.config.API + "/auth/me");

      user = res?.user || res || null;

      if(!user){
        throw new Error("NO_USER");
      }

      Onion.setUser?.(user);

    }catch(e){

      const msg = e?.message || "";

      if(
        msg.includes("401") ||
        msg.includes("NO_TOKEN") ||
        msg.includes("NO_USER")
      ){
        Onion.warn?.("🔐 No autenticado → redirect");

        Onion.clearUser?.();
        Onion.auth?.redirectLogin?.();

        return;
      }

      throw e;

    }

    /* =========================
       UI INIT
    ========================= */

    Onion.ui?.init?.();

    /* =========================
       FIRST RENDER
    ========================= */

    await Onion.render();

    /* =========================
       READY
    ========================= */

    Onion.state.ready = true;

    Onion.events.emit?.("app:ready", {
      user: Onion.state.user
    });

    Onion.log?.("✅ INIT READY");

  }catch(e){

    Onion.error?.("💥 INIT ERROR:", e);

    const app = document.getElementById("app-content");

    if(app){
      app.innerHTML = `
        <div style="padding:20px">
          <h2>Error inicializando</h2>
          <p>${e.message}</p>
          <button onclick="location.reload()">Reintentar</button>
        </div>
      `;
    }

  }finally{

    // 🔥 liberar lock SIEMPRE
    Onion.state._initializing = false;

    Onion.state.navigating = false;
    Onion.state.rendering = false;

  }

};

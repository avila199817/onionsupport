Onion.init = async function(){

  // LOCK
  if(Onion.state._initializing) return;
  if(Onion.state.ready) return;

  Onion.state._initializing = true;

  try{

    /* =========================
       AUTH
    ========================= */

    let user = null;

    try{

      const res = await Onion.fetch(Onion.config.API + "/auth/me");

      user = res?.user || res || null;

      if(!user){
        throw new Error("NO_USER");
      }

      Onion.setUser?.(user);

      /* =========================
         THEME SYNC (BD → UI)
      ========================= */

      try{

        const dbConfig = user?.config || {};

        if(dbConfig){

          // Guardar en cache
          localStorage.setItem("onion_config", JSON.stringify(dbConfig));

          // Aplicar tema real
          let darkMode;

          if(typeof dbConfig.darkMode === "boolean"){
            darkMode = dbConfig.darkMode;
          }else{
            darkMode = window.matchMedia("(prefers-color-scheme: dark)").matches;
          }

          const theme = darkMode ? "dark" : "light";

          document.documentElement.setAttribute("data-theme", theme);

        }

      }catch(e){
        console.warn("⚠️ Theme sync error:", e);
      }

    }catch(e){

      const msg = e?.message || "";

      if(
        msg.includes("401") ||
        msg.includes("NO_TOKEN") ||
        msg.includes("NO_USER")
      ){
        Onion.clearUser?.();
        Onion.auth?.redirectLogin?.();
        return;
      }

      throw e;

    }

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

  }catch(e){

    console.error("💥 INIT ERROR:", e);

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

    Onion.state._initializing = false;

    Onion.state.navigating = false;
    Onion.state.rendering = false;

  }

};
